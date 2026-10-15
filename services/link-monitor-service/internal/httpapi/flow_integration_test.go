package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"healthcheck/link-monitor/internal/checker"
	"healthcheck/link-monitor/internal/config"
	"healthcheck/link-monitor/internal/store"
	"healthcheck/link-monitor/internal/worker"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRealFlowWithIsolatedPostgresAndSyntheticOrigin(t *testing.T) {
	dsn := os.Getenv("LINK_MONITOR_TEST_DSN")
	if dsn == "" {
		t.Skip("isolated DB required")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer admin.Close()
	var db, dir string
	if e = admin.QueryRow(ctx, "SELECT current_database(),current_setting('data_directory')").Scan(&db, &dir); e != nil || !strings.HasPrefix(db, "link_monitor_test_") || !strings.HasSuffix(strings.ReplaceAll(dir, "\\", "/"), "/.healthcheck-logs/link-monitor/pg") {
		t.Fatal("unsafe database", e)
	}
	database := fmt.Sprintf("link_monitor_test_flow_%d", time.Now().UnixNano())
	if _, e = admin.Exec(ctx, "CREATE DATABASE "+database); e != nil {
		t.Fatal(e)
	}
	defer admin.Exec(ctx, "DROP DATABASE "+database)
	pc, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	pc.ConnConfig.Database = database
	pool, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	if _, e = pool.Exec(ctx, `CREATE TABLE noticias(id bigint PRIMARY KEY,titulo text,url text);INSERT INTO noticias VALUES(1,'A','http://public.example/a'),(2,'B','http://public.example/a'),(3,'Private','http://127.0.0.1/private'),(4,'No URL',NULL)`); e != nil {
		t.Fatal(e)
	}
	migration, e := os.ReadFile("../../sql/001_link_monitor.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = pool.Exec(ctx, string(migration)); e != nil {
		t.Fatal(e)
	}
	s := store.New(pool)
	var requests atomic.Int32
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests.Add(1); w.Write([]byte("synthetic article")) }))
	defer origin.Close()
	c := checker.New(checker.Options{Lookup: func(_ context.Context, host string) ([]net.IPAddr, error) {
		if ip := net.ParseIP(host); ip != nil {
			return []net.IPAddr{{IP: ip}}, nil
		}
		return []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}, nil
	}, Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, strings.TrimPrefix(origin.URL, "http://"))
	}})
	server := httptest.NewServer(New(s, config.Config{Token: "synthetic"}))
	defer server.Close()
	request := func(method, path, body string) *http.Response {
		r, _ := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer synthetic")
		resp, e := http.DefaultClient.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		return resp
	}
	resp := request("POST", "/internal/link-monitor/runs", `{"requested_by":1}`)
	if resp.StatusCode != 202 {
		t.Fatal(resp.StatusCode)
	}
	resp.Body.Close()
	resp = request("POST", "/internal/link-monitor/runs", `{"requested_by":1}`)
	if resp.StatusCode != 200 {
		t.Fatal(resp.StatusCode)
	}
	resp.Body.Close()
	workCtx, stop := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { defer close(done); worker.New(s, c, 5).Run(workCtx) }()
	defer func() { stop(); <-done }()
	deadline := time.Now().Add(8 * time.Second)
	var run *store.Run
	for time.Now().Before(deadline) {
		run, e = s.CurrentRun(ctx)
		if e != nil {
			t.Fatal(e)
		}
		if run.State == "completed" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if run.State != "completed" || run.TotalURLs != 2 || run.ProcessedURLs != 2 || requests.Load() != 1 {
		t.Fatalf("run=%+v externalRequests=%d", run, requests.Load())
	}
	resp = request("GET", "/internal/link-monitor/results", "")
	var payload struct {
		Data store.ResultsPage `json:"data"`
	}
	e = json.NewDecoder(resp.Body).Decode(&payload)
	resp.Body.Close()
	if e != nil || payload.Data.Total != 3 || payload.Data.Summary["available"] != 2 || payload.Data.Summary["uncheckable"] != 1 {
		t.Fatalf("%+v %v", payload, e)
	}
	stop()
	<-done
	// A later instance recovers the persisted result without creating a new run.
	if got, e := store.New(pool).CurrentRun(ctx); e != nil || got.ID != run.ID {
		t.Fatal("lost persisted run", e)
	}
}
