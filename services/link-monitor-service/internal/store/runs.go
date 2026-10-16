package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"healthcheck/link-monitor/internal/audit"
	"healthcheck/link-monitor/internal/checker"
	"os"
	"strings"
)

func (s *Store) Ready(ctx context.Context) error {
	var ok bool
	e := s.pool.QueryRow(ctx, `SELECT to_regclass('link_monitor_runs') IS NOT NULL AND to_regclass('link_monitor_checks') IS NOT NULL AND to_regclass('link_monitor_items') IS NOT NULL`).Scan(&ok)
	if e == nil && !ok {
		return errors.New("schema unavailable")
	}
	return e
}
func (s *Store) StartRun(ctx context.Context, actor int64) (StartResult, error) {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return StartResult{}, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(734252,1)`); e != nil {
		return StartResult{}, e
	}
	active, e := scanRun(tx.QueryRow(ctx, `SELECT `+runColumns+` FROM link_monitor_runs WHERE state IN ('queued','running')`))
	if e == nil {
		return StartResult{Run: *active}, tx.Commit(ctx)
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return StartResult{}, e
	}
	run, e := scanRun(tx.QueryRow(ctx, `INSERT INTO link_monitor_runs(requested_by,state) VALUES($1,'queued') RETURNING `+runColumns, actor))
	if e != nil {
		return StartResult{}, e
	}
	// One query captures a consistent catalogue; cursor results are materialized before writes.
	rows, e := tx.Query(ctx, `SELECT id,url FROM noticias ORDER BY id`)
	if e != nil {
		return StartResult{}, e
	}
	type item struct {
		id  int64
		url *string
	}
	items := []item{}
	for rows.Next() {
		var i item
		if e = rows.Scan(&i.id, &i.url); e != nil {
			rows.Close()
			return StartResult{}, e
		}
		items = append(items, i)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return StartResult{}, e
	}
	unique := map[string]int64{}
	skipped := 0
	for _, i := range items {
		if i.url == nil || strings.TrimSpace(*i.url) == "" {
			skipped++
			continue
		}
		normalized, err := checker.Normalize(*i.url)
		if err != nil {
			normalized = *i.url
		}
		checkID, exists := unique[normalized]
		if !exists {
			e = tx.QueryRow(ctx, `INSERT INTO link_monitor_checks(run_id,url) VALUES($1,$2) RETURNING id`, run.ID, normalized).Scan(&checkID)
			if e != nil {
				return StartResult{}, e
			}
			unique[normalized] = checkID
		}
		if _, e = tx.Exec(ctx, `INSERT INTO link_monitor_items(run_id,check_id,news_id,original_url) VALUES($1,$2,$3,$4)`, run.ID, checkID, i.id, *i.url); e != nil {
			return StartResult{}, e
		}
	}
	run, e = scanRun(tx.QueryRow(ctx, `UPDATE link_monitor_runs SET total_urls=$2,skipped_news=$3,state=CASE WHEN $2=0 THEN 'completed' ELSE 'queued' END,finished_at=CASE WHEN $2=0 THEN clock_timestamp() END WHERE id=$1 RETURNING `+runColumns, run.ID, len(unique), skipped))
	if e != nil {
		return StartResult{}, e
	}
	if _, e = audit.WriteAudit(ctx, tx, audit.RunEvent(run.ID, &actor, run.CreatedAt, "started", run.TotalURLs, "")); e != nil {
		return StartResult{}, e
	}
	if run.State == "completed" {
		if _, e = audit.WriteAudit(ctx, tx, audit.RunEvent(run.ID, &actor, *run.FinishedAt, "success", 0, "")); e != nil {
			return StartResult{}, e
		}
	}
	return StartResult{Run: *run, Created: true}, tx.Commit(ctx)
}
func (s *Store) CurrentRun(ctx context.Context) (*Run, error) {
	r, e := scanRun(s.pool.QueryRow(ctx, `SELECT `+runColumns+` FROM link_monitor_runs ORDER BY created_at DESC,id DESC LIMIT 1`))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	return r, e
}
func (s *Store) ClaimQueued(ctx context.Context) (*Run, error) {
	r, e := scanRun(s.pool.QueryRow(ctx, `UPDATE link_monitor_runs SET state='running',started_at=clock_timestamp(),heartbeat_at=clock_timestamp() WHERE state='queued' RETURNING `+runColumns))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	return r, e
}
func (s *Store) PendingChecks(ctx context.Context, runID string, limit int) ([]Check, error) {
	rows, e := s.pool.Query(ctx, `SELECT id,url FROM link_monitor_checks WHERE run_id=$1 AND state='pending' ORDER BY id LIMIT $2`, runID, limit)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	checks := []Check{}
	for rows.Next() {
		var c Check
		if e = rows.Scan(&c.ID, &c.URL); e != nil {
			return nil, e
		}
		checks = append(checks, c)
	}
	return checks, rows.Err()
}
func (s *Store) SaveResult(ctx context.Context, runID string, id int64, result checker.CheckResult) error {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(context.Background())
	var state string
	if e = tx.QueryRow(ctx, `SELECT state FROM link_monitor_runs WHERE id=$1 FOR UPDATE`, runID).Scan(&state); e != nil {
		return e
	}
	if state != "running" {
		return ErrConflict
	}
	data, e := json.Marshal(result)
	if e != nil {
		return e
	}
	tag, e := tx.Exec(ctx, `UPDATE link_monitor_checks SET state='done',result=$3 WHERE id=$1 AND run_id=$2 AND state!='done'`, id, runID, data)
	if e != nil {
		return e
	}
	if tag.RowsAffected() != 1 {
		return ErrConflict
	}
	if _, e = tx.Exec(ctx, `UPDATE link_monitor_runs SET processed_urls=processed_urls+1 WHERE id=$1`, runID); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) FinishRun(ctx context.Context, id, state, code string) error {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(context.Background())
	run, e := scanRun(tx.QueryRow(ctx, `UPDATE link_monitor_runs SET state=$2,error_code=NULLIF($3,''),finished_at=clock_timestamp() WHERE id=$1 AND state='running' AND ($2!='completed' OR processed_urls=total_urls) RETURNING `+runColumns, id, state, code))
	if errors.Is(e, pgx.ErrNoRows) {
		return ErrConflict
	}
	if e != nil {
		return e
	}
	var actor *int64
	if os.Getenv("AUDIT_ENABLED") == "true" {
		if e = tx.QueryRow(ctx, `SELECT u.id FROM link_monitor_runs r LEFT JOIN usuarios u ON u.id=r.requested_by WHERE r.id=$1`, id).Scan(&actor); e != nil {
			return e
		}
	}
	outcome := "failure"
	if state == "completed" {
		outcome = "success"
	}
	if _, e = audit.WriteAudit(ctx, tx, audit.RunEvent(id, actor, *run.FinishedAt, outcome, run.ProcessedURLs, code)); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) InterruptAbandoned(ctx context.Context) error {
	rows, e := s.pool.Query(ctx, `SELECT id::text FROM link_monitor_runs WHERE state='running'`)
	if e != nil {
		return e
	}
	var ids []string
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		if e = s.FinishRun(ctx, id, "interrupted", "WORKER_INTERRUPTED"); e != nil && !errors.Is(e, ErrConflict) {
			return e
		}
	}
	return nil
}
