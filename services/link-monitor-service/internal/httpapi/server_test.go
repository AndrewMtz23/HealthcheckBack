package httpapi

import (
	"context"
	"healthcheck/link-monitor/internal/config"
	"healthcheck/link-monitor/internal/store"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeStore struct {
	starts  int
	created bool
}

func (s *fakeStore) Ready(context.Context) error { return nil }
func (s *fakeStore) StartRun(context.Context, int64) (store.StartResult, error) {
	s.starts++
	return store.StartResult{Created: s.created}, nil
}
func (s *fakeStore) CurrentRun(context.Context) (*store.Run, error) { return nil, nil }
func (s *fakeStore) ListResults(context.Context, int, int, string) (store.ResultsPage, error) {
	return store.ResultsPage{Items: []store.ResultRow{}}, nil
}
func TestAuthenticationDiagnosticAndValidation(t *testing.T) {
	for _, tc := range []struct {
		name, token, body string
		diagnostic        bool
		want              int
	}{{"no token", "", "{\"requested_by\":1}", false, 401}, {"wrong token", "wrong", "{}", false, 401}, {"invalid actor", "secret", "{\"requested_by\":0}", false, 400}, {"valid", "secret", "{\"requested_by\":1}", false, 202}, {"unknown field", "secret", "{\"requested_by\":1,\"url\":\"http://localhost\"}", false, 400}, {"diagnostic", "secret", "{\"requested_by\":1}", true, 503}} {
		t.Run(tc.name, func(t *testing.T) {
			s := &fakeStore{created: true}
			h := New(s, config.Config{Token: "secret", Diagnostic: tc.diagnostic})
			r := httptest.NewRequest("POST", "/internal/link-monitor/runs", strings.NewReader(tc.body))
			if tc.token != "" {
				r.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("code=%d body=%s", w.Code, w.Body)
			}
			if tc.want != 202 && s.starts != 0 {
				t.Fatal("unauthorized start")
			}
		})
	}
}
func TestReadAndQuery(t *testing.T) {
	h := New(&fakeStore{}, config.Config{Token: "secret"})
	for path, want := range map[string]int{"/health": 200, "/internal/link-monitor/runs/current": 200, "/internal/link-monitor/results?limit=101": 400, "/internal/link-monitor/results?page=0": 400, "/internal/link-monitor/results?status=bogus": 400, "/internal/link-monitor/results": 200} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		r.Header.Set("Authorization", "Bearer secret")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Errorf("%s: %d %s", path, w.Code, w.Body)
		}
	}
}
