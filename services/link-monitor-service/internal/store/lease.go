package store

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Lease struct{ conn *pgxpool.Conn }

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
