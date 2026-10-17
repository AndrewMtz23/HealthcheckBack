package store

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
)

func TestAuditAtomicRuns(t *testing.T) {
	dsn := os.Getenv("AUDIT_TEST_DSN")
	if dsn == "" {
		t.Skip("isolated audit harness required")
	}
	ctx := context.Background()
	pool, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	var name, dir string
	if e = pool.QueryRow(ctx, "SELECT current_database(),current_setting('data_directory')").Scan(&name, &dir); e != nil {
		t.Fatal(e)
	}
	if !strings.HasPrefix(name, "editorial_") || !strings.HasSuffix(strings.ReplaceAll(dir, "\\", "/"), "/.healthcheck-logs/phase00-pg") {
		t.Fatal("unsafe audit database")
	}
	t.Setenv("AUDIT_ENABLED", "true")
	s := New(pool)
	run, e := s.StartRun(ctx, 1)
	if e != nil {
		t.Fatal(e)
	}
	if run.Run.State != "completed" {
		t.Fatal("empty catalogue should complete")
	}
	var count int
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM system_logs WHERE request_id=$1", run.Run.ID).Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 2 {
		t.Fatalf("expected start + completion, got %d", count)
	}
	if _, e = pool.Exec(ctx, "ALTER TABLE system_logs RENAME TO unavailable_audit_table"); e != nil {
		t.Fatal(e)
	}
	defer pool.Exec(ctx, "ALTER TABLE unavailable_audit_table RENAME TO system_logs")
	if _, e = s.StartRun(ctx, 1); e == nil {
		t.Fatal("missing audit must fail")
	}
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM link_monitor_runs").Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 1 {
		t.Fatal("run was not rolled back")
	}
	pool.Exec(ctx, "ALTER TABLE unavailable_audit_table RENAME TO system_logs")
	if _, e = pool.Exec(ctx, "INSERT INTO noticias(titulo,contenido,url) VALUES('Audit fixture','Synthetic','https://example.org/a'); INSERT INTO usuarios(id,nombre,email,rol) VALUES(9999,'Synthetic','audit-delete@example.invalid','admin')"); e != nil {
		t.Fatal(e)
	}
	started, e := s.StartRun(ctx, 9999)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.ClaimQueued(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = pool.Exec(ctx, "DELETE FROM usuarios WHERE id=9999"); e != nil {
		t.Fatal(e)
	}
	if e = s.FinishRun(ctx, started.Run.ID, "interrupted", "WORKER_INTERRUPTED"); e != nil {
		t.Fatal(e)
	}
	var kind string
	var user *int64
	if e = pool.QueryRow(ctx, "SELECT actor_type,user_id FROM system_logs WHERE request_id=$1 AND outcome='failure'", started.Run.ID).Scan(&kind, &user); e != nil {
		t.Fatal(e)
	}
	if kind != "user" || user != nil {
		t.Fatal("deleted initiator must remain a user, not system")
	}
}
