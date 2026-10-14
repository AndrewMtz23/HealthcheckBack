package store

import (
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"healthcheck/link-monitor/internal/checker"
	"time"
)

var ErrConflict = errors.New("monitor state conflict")

type Store struct{ pool *pgxpool.Pool }

func New(p *pgxpool.Pool) *Store { return &Store{pool: p} }

type Run struct {
	ID            string     `json:"id"`
	State         string     `json:"state"`
	CreatedAt     time.Time  `json:"created_at"`
	StartedAt     *time.Time `json:"started_at"`
	FinishedAt    *time.Time `json:"finished_at"`
	HeartbeatAt   *time.Time `json:"heartbeat_at"`
	TotalURLs     int        `json:"total_urls"`
	ProcessedURLs int        `json:"processed_urls"`
	SkippedNews   int        `json:"skipped_news"`
	ErrorCode     *string    `json:"error_code"`
}
type StartResult struct {
	Run     Run  `json:"run"`
	Created bool `json:"created"`
}
type Check struct {
	ID  int64
	URL string
}
type ResultRow struct {
	NewsID     int64                `json:"news_id"`
	Title      string               `json:"title"`
	CurrentURL string               `json:"current_url"`
	CheckedURL *string              `json:"checked_url"`
	Freshness  string               `json:"freshness"`
	Pending    bool                 `json:"pending"`
	Result     *checker.CheckResult `json:"result"`
}
type ResultsPage struct {
	Items   []ResultRow    `json:"items"`
	Page    int            `json:"page"`
	Limit   int            `json:"limit"`
	Total   int            `json:"total"`
	Summary map[string]int `json:"summary"`
}

const runColumns = `id::text,state,created_at,started_at,finished_at,heartbeat_at,total_urls,processed_urls,skipped_news,error_code`

type scanner interface{ Scan(...any) error }

func scanRun(row scanner) (*Run, error) {
	var r Run
	e := row.Scan(&r.ID, &r.State, &r.CreatedAt, &r.StartedAt, &r.FinishedAt, &r.HeartbeatAt, &r.TotalURLs, &r.ProcessedURLs, &r.SkippedNews, &r.ErrorCode)
	return &r, e
}
