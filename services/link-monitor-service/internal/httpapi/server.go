package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"healthcheck/link-monitor/internal/config"
	"healthcheck/link-monitor/internal/store"
	"io"
	"net/http"
	"strconv"
	"time"
)

type repository interface {
	Ready(context.Context) error
	StartRun(context.Context, int64) (store.StartResult, error)
	CurrentRun(context.Context) (*store.Run, error)
	ListResults(context.Context, int, int, string) (store.ResultsPage, error)
}

func write(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": data})
}
func fail(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": http.StatusText(status)})
}
func New(s repository, cfg config.Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if cfg.Token == "" || s.Ready(ctx) != nil {
			fail(w, 503)
			return
		}
		write(w, 200, map[string]bool{"ready": true, "diagnostic": cfg.Diagnostic})
	})
	internal := http.NewServeMux()
	internal.HandleFunc("POST /internal/link-monitor/runs", func(w http.ResponseWriter, r *http.Request) {
		if cfg.Diagnostic {
			fail(w, 503)
			return
		}
		var payload struct {
			RequestedBy int64 `json:"requested_by"`
		}
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
		dec.DisallowUnknownFields()
		if e := dec.Decode(&payload); e != nil || payload.RequestedBy <= 0 {
			fail(w, 400)
			return
		}
		if dec.Decode(&struct{}{}) != io.EOF {
			fail(w, 400)
			return
		}
		result, e := s.StartRun(r.Context(), payload.RequestedBy)
		if e != nil {
			fail(w, 503)
			return
		}
		status := 200
		if result.Created {
			status = 202
		}
		write(w, status, result)
	})
	internal.HandleFunc("GET /internal/link-monitor/runs/current", func(w http.ResponseWriter, r *http.Request) {
		run, e := s.CurrentRun(r.Context())
		if e != nil {
			fail(w, 503)
			return
		}
		write(w, 200, run)
	})
	internal.HandleFunc("GET /internal/link-monitor/results", func(w http.ResponseWriter, r *http.Request) {
		page, limit := 1, 25
		var e error
		if v := r.URL.Query().Get("page"); v != "" {
			page, e = strconv.Atoi(v)
			if e != nil || page < 1 || page > 1000000 {
				fail(w, 400)
				return
			}
		}
		if v := r.URL.Query().Get("limit"); v != "" {
			limit, e = strconv.Atoi(v)
			if e != nil || limit < 1 || limit > 100 {
				fail(w, 400)
				return
			}
		}
		status := r.URL.Query().Get("status")
		switch status {
		case "", "available", "not_found", "restricted", "rate_limited", "site_error", "connection_failed", "uncheckable", "stale", "unchecked":
		default:
			fail(w, 400)
			return
		}
		result, e := s.ListResults(r.Context(), page, limit, status)
		if e != nil {
			fail(w, 503)
			return
		}
		write(w, 200, result)
	})
	mux.Handle("/internal/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.Token == "" {
			fail(w, 503)
			return
		}
		expected := "Bearer " + cfg.Token
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte(expected)) != 1 {
			fail(w, 401)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		if s.Ready(ctx) != nil {
			fail(w, 503)
			return
		}
		internal.ServeHTTP(w, r.WithContext(ctx))
	}))
	return mux
}
