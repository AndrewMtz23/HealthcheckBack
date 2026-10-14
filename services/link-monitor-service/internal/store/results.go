package store

import (
	"context"
	"encoding/json"
)

const resultsCTE = `WITH display AS (
 SELECT n.id AS news_id,n.titulo AS title,n.url AS current_url,old.original_url AS checked_url,old.result,
 CASE WHEN old.original_url IS NULL THEN 'unchecked' WHEN old.original_url=n.url THEN 'current' ELSE 'stale' END AS freshness,
 EXISTS(SELECT 1 FROM link_monitor_items i JOIN link_monitor_checks c ON c.id=i.check_id JOIN link_monitor_runs r ON r.id=i.run_id WHERE i.news_id=n.id AND i.original_url=n.url AND c.state!='done' AND r.state IN ('queued','running')) AS pending
 FROM noticias n LEFT JOIN LATERAL (
 SELECT i.original_url,c.result FROM link_monitor_items i JOIN link_monitor_checks c ON c.id=i.check_id JOIN link_monitor_runs r ON r.id=i.run_id
 WHERE i.news_id=n.id AND c.state='done' ORDER BY (i.original_url=n.url) DESC,r.created_at DESC,r.id DESC LIMIT 1
 ) old ON true WHERE n.url IS NOT NULL AND btrim(n.url)!=''
), labeled AS (SELECT *,CASE WHEN freshness='current' THEN result->>'status' ELSE freshness END AS label FROM display) `

func (s *Store) ListResults(ctx context.Context, page, limit int, status string) (ResultsPage, error) {
	out := ResultsPage{Items: []ResultRow{}, Page: page, Limit: limit, Summary: map[string]int{}}
	// Repeatable read keeps page, totals and summaries consistent while jobs finish.
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return out, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`); e != nil {
		return out, e
	}
	totals, e := tx.Query(ctx, resultsCTE+`SELECT label,count(*) FROM labeled GROUP BY label`)
	if e != nil {
		return out, e
	}
	for totals.Next() {
		var key string
		var count int
		if e = totals.Scan(&key, &count); e != nil {
			totals.Close()
			return out, e
		}
		out.Summary[key] = count
		if status == "" || status == key {
			out.Total += count
		}
	}
	e = totals.Err()
	totals.Close()
	if e != nil {
		return out, e
	}
	rows, e := tx.Query(ctx, resultsCTE+`SELECT news_id,title,current_url,checked_url,freshness,pending,result FROM labeled WHERE ($1='' OR label=$1) ORDER BY news_id DESC LIMIT $2 OFFSET $3`, status, limit, (page-1)*limit)
	if e != nil {
		return out, e
	}
	for rows.Next() {
		var r ResultRow
		var data []byte
		if e = rows.Scan(&r.NewsID, &r.Title, &r.CurrentURL, &r.CheckedURL, &r.Freshness, &r.Pending, &data); e != nil {
			rows.Close()
			return out, e
		}
		if len(data) > 0 {
			if e = json.Unmarshal(data, &r.Result); e != nil {
				rows.Close()
				return out, e
			}
		}
		out.Items = append(out.Items, r)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return out, e
	}
	return out, tx.Commit(ctx)
}
