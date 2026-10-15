package store

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Lease struct{ conn *pgxpool.Conn }

// Recovery must use the locked session: a disconnected former owner cannot
// mutate a successor's job through an unrelated pooled connection.
func (l *Lease) RecoverAndClaim(ctx context.Context) (*Run, error) {
	tx, e := l.conn.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, `UPDATE link_monitor_runs SET state='interrupted',error_code='WORKER_INTERRUPTED',finished_at=clock_timestamp() WHERE state='running'`); e != nil {
		return nil, e
	}
	run, e := scanRun(tx.QueryRow(ctx, `UPDATE link_monitor_runs SET state='running',started_at=clock_timestamp(),heartbeat_at=clock_timestamp() WHERE state='queued' RETURNING `+runColumns))
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, tx.Commit(ctx)
	}
	if e != nil {
		return nil, e
	}
	return run, tx.Commit(ctx)
}

func (s *Store) AcquireLease(ctx context.Context) (*Lease, error) {
	c, e := s.pool.Acquire(ctx)
	if e != nil {
		return nil, e
	}
	var locked bool
	e = c.QueryRow(ctx, `SELECT pg_try_advisory_lock(734252,2)`).Scan(&locked)
	if e != nil || !locked {
		c.Release()
		if e == nil {
			e = ErrConflict
		}
		return nil, e
	}
	return &Lease{conn: c}, nil
}
func (l *Lease) Heartbeat(ctx context.Context, id string) error {
	if id == "" {
		return l.conn.Ping(ctx)
	}
	tag, e := l.conn.Exec(ctx, `UPDATE link_monitor_runs SET heartbeat_at=clock_timestamp() WHERE id=$1 AND state='running'`, id)
	if e == nil && tag.RowsAffected() != 1 {
		return ErrConflict
	}
	return e
}
func (l *Lease) Close(ctx context.Context) error {
	_, e := l.conn.Exec(ctx, `SELECT pg_advisory_unlock(734252,2)`)
	if e != nil {
		l.conn.Conn().Close(ctx)
	}
	l.conn.Release()
	return e
}
