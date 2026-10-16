package store

import (
 "context"
 "os"
 "strings"
 "testing"
 "github.com/jackc/pgx/v5/pgxpool"
)

func TestAuditAtomicRuns(t *testing.T) {
 dsn:=os.Getenv("AUDIT_TEST_DSN");if dsn==""{t.Skip("isolated audit harness required")}
 ctx:=context.Background();pool,e:=pgxpool.New(ctx,dsn);if e!=nil{t.Fatal(e)};defer pool.Close()
 var name,dir string
 if e=pool.QueryRow(ctx,"SELECT current_database(),current_setting('data_directory')").Scan(&name,&dir);e!=nil{t.Fatal(e)}
 if !strings.HasPrefix(name,"editorial_")||!strings.HasSuffix(strings.ReplaceAll(dir,"\\","/"),"/.healthcheck-logs/phase00-pg"){t.Fatal("unsafe audit database")}
 t.Setenv("AUDIT_ENABLED","true")
 s:=New(pool)
 run,e:=s.StartRun(ctx,1);if e!=nil{t.Fatal(e)}
 if run.Run.State!="completed"{t.Fatal("empty catalogue should complete")}
 var count int
 if e=pool.QueryRow(ctx,"SELECT count(*) FROM system_logs WHERE request_id=$1",run.Run.ID).Scan(&count);e!=nil{t.Fatal(e)}
 if count!=2{t.Fatalf("expected start + completion, got %d",count)}
 if _,e=pool.Exec(ctx,"ALTER TABLE system_logs RENAME TO unavailable_audit_table");e!=nil{t.Fatal(e)}
 defer pool.Exec(ctx,"ALTER TABLE unavailable_audit_table RENAME TO system_logs")
 if _,e=s.StartRun(ctx,1);e==nil{t.Fatal("missing audit must fail")}
 if e=pool.QueryRow(ctx,"SELECT count(*) FROM link_monitor_runs").Scan(&count);e!=nil{t.Fatal(e)}
 if count!=1{t.Fatal("run was not rolled back")}
}
