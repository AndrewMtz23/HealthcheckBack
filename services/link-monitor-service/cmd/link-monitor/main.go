package main

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"healthcheck/link-monitor/internal/checker"
	"healthcheck/link-monitor/internal/config"
	"healthcheck/link-monitor/internal/httpapi"
	"healthcheck/link-monitor/internal/store"
	"healthcheck/link-monitor/internal/worker"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"time"
)

func main() {
	if e := run(); e != nil {
		log.Print("Link monitor stopped: check configuration or service availability")
		os.Exit(1)
	}
}
func run() error {
	cfg, e := config.Load()
	if e != nil {
		return e
	}
	pc, e := config.DatabaseConfig(cfg.Concurrency)
	if e != nil {
		return e
	}
	pc.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	pool, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		return e
	}
	defer pool.Close()
	s := store.New(pool)
	done := make(chan struct{})
	if !cfg.Diagnostic && cfg.Token != "" {
		go func() {
			defer close(done)
			worker.New(s, checker.New(checker.Options{Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second}), cfg.Concurrency).Run(ctx)
		}()
	} else {
		close(done)
	}
	server := &http.Server{Addr: net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)), Handler: httpapi.New(s, cfg), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 * 1024}
	errCh := make(chan error, 1)
	go func() {
		log.Printf("Link monitor listening on port %d (diagnostic=%t)", cfg.Port, cfg.Diagnostic)
		errCh <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
	case e = <-errCh:
		cancel()
	}
	stopCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	server.Shutdown(stopCtx)
	<-done
	if errors.Is(e, http.ErrServerClosed) {
		return nil
	}
	return e
}
