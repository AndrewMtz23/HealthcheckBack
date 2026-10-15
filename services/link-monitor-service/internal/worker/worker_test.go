package worker

import (
	"context"
	"healthcheck/link-monitor/internal/checker"
	"healthcheck/link-monitor/internal/store"
	"sync"
	"testing"
	"time"
)

type fakeStore struct {
	mu    sync.Mutex
	saved int
	fail  bool
}

func (s *fakeStore) PendingChecks(_ context.Context, _ string, _ int) ([]store.Check, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saved >= 20 {
		return nil, nil
	}
	out := []store.Check{}
	for i := s.saved; i < s.saved+5 && i < 20; i++ {
		out = append(out, store.Check{ID: int64(i), URL: "https://example.com"})
	}
	return out, nil
}
func (s *fakeStore) SaveResult(_ context.Context, _ string, _ int64, _ checker.CheckResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fail {
		return store.ErrConflict
	}
	s.saved++
	return nil
}
func (s *fakeStore) FinishRun(context.Context, string, string, string) error { return nil }

type fakeChecker struct {
	mu          sync.Mutex
	active, max int
}

func (c *fakeChecker) Check(ctx context.Context, _ string) checker.CheckResult {
	c.mu.Lock()
	c.active++
	if c.active > c.max {
		c.max = c.active
	}
	c.mu.Unlock()
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Millisecond):
	}
	c.mu.Lock()
	c.active--
	c.mu.Unlock()
	return checker.CheckResult{Status: "connection_failed"}
}
func TestBoundedExecutionAndPersistenceFailure(t *testing.T) {
	s := &fakeStore{}
	c := &fakeChecker{}
	if e := execute(context.Background(), s, c, "run", 5); e != nil {
		t.Fatal(e)
	}
	if s.saved != 20 || c.max > 5 {
		t.Fatalf("saved=%d max=%d", s.saved, c.max)
	}
	s = &fakeStore{fail: true}
	if e := execute(context.Background(), s, c, "run", 5); e == nil {
		t.Fatal("DB error ignored")
	}
}
