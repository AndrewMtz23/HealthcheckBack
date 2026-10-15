package checker

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestHostLimitIncludesRedirects(t *testing.T) {
	gate := newHostGate(20 * time.Millisecond)
	var mu sync.Mutex
	times := []time.Time{}
	active, max := 0, 0
	c := New(Options{})
	c.gate = gate
	c.transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		mu.Lock()
		active++
		if active > max {
			max = active
		}
		times = append(times, time.Now())
		mu.Unlock()
		time.Sleep(5 * time.Millisecond)
		mu.Lock()
		active--
		mu.Unlock()
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); c.Check(context.Background(), "https://example.com") }()
	}
	wg.Wait()
	if max != 1 {
		t.Fatalf("parallel host calls=%d", max)
	}
	for i := 1; i < len(times); i++ {
		if times[i].Sub(times[i-1]) < 20*time.Millisecond {
			t.Fatal("host interval not respected")
		}
	}
}
