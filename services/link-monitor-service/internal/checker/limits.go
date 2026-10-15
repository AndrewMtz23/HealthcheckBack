package checker

import (
	"context"
	"sync"
	"time"
)

type hostSlot struct {
	token chan struct{}
	last  time.Time
	refs  int
}
type hostGate struct {
	mu       sync.Mutex
	slots    map[string]*hostSlot
	interval time.Duration
}

func newHostGate(interval time.Duration) *hostGate {
	return &hostGate{slots: map[string]*hostSlot{}, interval: interval}
}
func (g *hostGate) acquire(ctx context.Context, host string) (func(), error) {
	g.mu.Lock()
	now := time.Now()
	for k, s := range g.slots {
		if s.refs == 0 && now.Sub(s.last) >= g.interval {
			delete(g.slots, k)
		}
	}
	s := g.slots[host]
	if s == nil {
		s = &hostSlot{token: make(chan struct{}, 1)}
		g.slots[host] = s
	}
	s.refs++
	g.mu.Unlock()
	drop := func() { g.mu.Lock(); s.refs--; g.mu.Unlock() }
	select {
	case s.token <- struct{}{}:
	case <-ctx.Done():
		drop()
		return nil, ctx.Err()
	}
	release := func() { <-s.token; drop() }
	wait := time.Until(s.last.Add(g.interval))
	if wait > 0 {
		timer := time.NewTimer(wait)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-ctx.Done():
			release()
			return nil, ctx.Err()
		}
	}
	g.mu.Lock()
	s.last = time.Now()
	g.mu.Unlock()
	return release, nil
}
