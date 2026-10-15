package worker

import (
	"context"
	"errors"
	"healthcheck/link-monitor/internal/checker"
	"healthcheck/link-monitor/internal/store"
	"sync"
	"time"
)

type checking interface {
	Check(context.Context, string) checker.CheckResult
}
type repository interface {
	PendingChecks(context.Context, string, int) ([]store.Check, error)
	SaveResult(context.Context, string, int64, checker.CheckResult) error
	FinishRun(context.Context, string, string, string) error
}
type Worker struct {
	store       *store.Store
	checker     checking
	concurrency int
}

func New(s *store.Store, c *checker.Checker, concurrency int) *Worker {
	return &Worker{store: s, checker: c, concurrency: concurrency}
}
func execute(parent context.Context, s repository, c checking, id string, concurrency int) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	for {
		if e := ctx.Err(); e != nil {
			return e
		}
		checks, e := s.PendingChecks(ctx, id, concurrency)
		if e != nil {
			return e
		}
		if len(checks) == 0 {
			return s.FinishRun(ctx, id, "completed", "")
		}
		var wg sync.WaitGroup
		errs := make(chan error, len(checks))
		for _, check := range checks {
			wg.Add(1)
			go func(check store.Check) {
				defer wg.Done()
				result := c.Check(ctx, check.URL)
				if e := ctx.Err(); e != nil {
					errs <- e
					return
				}
				if e := s.SaveResult(ctx, id, check.ID, result); e != nil {
					errs <- e
					cancel()
				}
			}(check)
		}
		wg.Wait()
		close(errs)
		for e := range errs {
			return e
		}
	}
}
func (w *Worker) Run(ctx context.Context) error {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
		lease, e := w.store.AcquireLease(ctx)
		if e != nil {
			continue
		}
		// Only the holder may reconcile a previously interrupted process.
		run, claimErr := lease.RecoverAndClaim(ctx)
		if claimErr == nil && run != nil {
			e = w.runLeased(ctx, lease, run.ID)
		}
		closeCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		lease.Close(closeCtx)
		cancel()
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}
func (w *Worker) runLeased(parent context.Context, lease *store.Lease, id string) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		timer := time.NewTicker(5 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				pingCtx, stop := context.WithTimeout(ctx, 2*time.Second)
				e := lease.Heartbeat(pingCtx, id)
				stop()
				if e != nil {
					cancel()
					return
				}
			}
		}
	}()
	e := execute(ctx, w.store, w.checker, id, w.concurrency)
	cancel()
	<-heartbeatDone
	if e != nil {
		endCtx, stop := context.WithTimeout(context.Background(), 3*time.Second)
		defer stop()
		state := "failed"
		code := "PERSISTENCE_FAILED"
		if errors.Is(e, context.Canceled) || parent.Err() != nil {
			state = "interrupted"
			code = "WORKER_INTERRUPTED"
		}
		w.store.FinishRun(endCtx, id, state, code)
	}
	return e
}
