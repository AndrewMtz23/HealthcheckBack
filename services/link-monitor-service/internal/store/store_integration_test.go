package store

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"healthcheck/link-monitor/internal/checker"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("LINK_MONITOR_TEST_DSN")
	if dsn == "" {
		t.Skip("isolated test database required")
	}
	ctx := context.Background()
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	var db, dir string
	if err = p.QueryRow(ctx, "SELECT current_database(),current_setting('data_directory')").Scan(&db, &dir); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(db, "link_monitor_test_") || !strings.HasSuffix(strings.ReplaceAll(dir, "\\", "/"), "/.healthcheck-logs/link-monitor/pg") {
		t.Fatal("unsafe test database")
	}
	_, err = p.Exec(ctx, `DROP TABLE IF EXISTS link_monitor_items,link_monitor_checks,link_monitor_runs,noticias CASCADE; CREATE TABLE noticias(id bigint PRIMARY KEY,titulo text NOT NULL,url text); INSERT INTO noticias VALUES(1,'A','https://example.com/a'),(2,'B','https://example.com/a'),(3,'None',NULL);`)
	if err != nil {
		t.Fatal(err)
	}
	sql, err := os.ReadFile("../../sql/001_link_monitor.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	return New(p)
}

func TestConcurrentStartAndDeduplication(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	results := make(chan StartResult, 2)
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); r, e := s.StartRun(ctx, 1); results <- r; errs <- e }()
	}
	wg.Wait()
	close(results)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	id := ""
	created := 0
	for r := range results {
		if id != "" && r.Run.ID != id {
			t.Fatal("duplicate runs")
		}
		id = r.Run.ID
		if r.Created {
			created++
		}
		if r.Run.TotalURLs != 1 || r.Run.SkippedNews != 1 {
			t.Fatalf("%+v", r)
		}
	}
	if created != 1 {
		t.Fatalf("created=%d", created)
	}
	var items int
	if e := s.pool.QueryRow(ctx, "SELECT count(*) FROM link_monitor_items").Scan(&items); e != nil || items != 2 {
		t.Fatalf("items=%d err=%v", items, e)
	}
}

func TestResultsFreshnessAndLateWrite(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	r, e := s.StartRun(ctx, 1)
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.ClaimQueued(ctx)
	if e != nil {
		t.Fatal(e)
	}
	checks, e := s.PendingChecks(ctx, r.Run.ID, 10)
	if e != nil {
		t.Fatal(e)
	}
	result := checker.CheckResult{Status: "available", FinalURL: "https://example.com/a", CheckedAt: time.Now().UTC()}
	if e = s.SaveResult(ctx, r.Run.ID, checks[0].ID, result); e != nil {
		t.Fatal(e)
	}
	if e = s.FinishRun(ctx, r.Run.ID, "completed", ""); e != nil {
		t.Fatal(e)
	}
	if e = s.SaveResult(ctx, r.Run.ID, checks[0].ID, result); e == nil {
		t.Fatal("late write accepted")
	}
	page, e := s.ListResults(ctx, 1, 25, "")
	if e != nil || page.Total != 2 || page.Items[0].Freshness != "current" {
		t.Fatalf("%+v %v", page, e)
	}
	s.pool.Exec(ctx, "UPDATE noticias SET url='https://example.com/b' WHERE id=2")
	page, e = s.ListResults(ctx, 1, 25, "stale")
	if e != nil || page.Total != 1 || page.Items[0].NewsID != 2 {
		t.Fatalf("%+v %v", page, e)
	}
	s.pool.Exec(ctx, "UPDATE noticias SET url='https://example.com/a' WHERE id=2")
	page, e = s.ListResults(ctx, 1, 25, "available")
	if e != nil || page.Total != 2 {
		t.Fatalf("%+v %v", page, e)
	}
	s.pool.Exec(ctx, "DELETE FROM noticias WHERE id=2")
	page, e = s.ListResults(ctx, 1, 25, "")
	if e != nil || page.Total != 1 {
		t.Fatalf("%+v %v", page, e)
	}
}

func TestEmptyAndRecovery(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	s.pool.Exec(ctx, "DELETE FROM noticias")
	r, e := s.StartRun(ctx, 1)
	if e != nil || r.Run.State != "completed" {
		t.Fatalf("%+v %v", r, e)
	}
	s.pool.Exec(ctx, "INSERT INTO noticias VALUES(1,'a','https://example.com')")
	r, e = s.StartRun(ctx, 1)
	if e != nil {
		t.Fatal(e)
	}
	s.ClaimQueued(ctx)
	lease, e := s.AcquireLease(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if other, e := s.AcquireLease(ctx); e == nil {
		other.Close(ctx)
		t.Fatal("second lease acquired")
	}
	if e = s.InterruptAbandoned(ctx); e != nil {
		t.Fatal(e)
	}
	lease.Close(ctx)
	current, e := s.CurrentRun(ctx)
	if e != nil || current.State != "interrupted" || current.ID != r.Run.ID {
		t.Fatalf("%+v %v", current, e)
	}
}

func TestLostLeaseCannotReconcileNewOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	_, e := s.StartRun(ctx, 1)
	if e != nil {
		t.Fatal(e)
	}
	old, e := s.AcquireLease(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer old.Close(ctx)
	pid := old.conn.Conn().PgConn().PID()
	var terminated bool
	if e = s.pool.QueryRow(ctx, "SELECT pg_terminate_backend($1,1000)", pid).Scan(&terminated); e != nil || !terminated {
		t.Fatal("terminate failed", e)
	}
	fresh, e := s.AcquireLease(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer fresh.Close(ctx)
	run, e := fresh.RecoverAndClaim(ctx)
	if e != nil || run == nil {
		t.Fatal("claim failed", e)
	}
	if _, e = old.RecoverAndClaim(ctx); e == nil {
		t.Fatal("lost owner reconciled new run")
	}
	current, e := s.CurrentRun(ctx)
	if e != nil || current.State != "running" || current.ID != run.ID {
		t.Fatalf("%+v %v", current, e)
	}
}
