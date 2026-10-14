BEGIN;
CREATE TABLE link_monitor_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','completed','interrupted','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_at timestamptz,
 finished_at timestamptz, heartbeat_at timestamptz,
 total_urls integer NOT NULL DEFAULT 0, processed_urls integer NOT NULL DEFAULT 0,
 skipped_news integer NOT NULL DEFAULT 0, error_code text,
 CHECK(processed_urls>=0 AND processed_urls<=total_urls)
);
CREATE UNIQUE INDEX link_monitor_one_active ON link_monitor_runs ((true)) WHERE state IN ('queued','running');
CREATE TABLE link_monitor_checks (
 id bigserial PRIMARY KEY,run_id uuid NOT NULL REFERENCES link_monitor_runs(id),url text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','checking','done')),
 result jsonb, UNIQUE(run_id,url)
);
CREATE INDEX link_monitor_pending ON link_monitor_checks(run_id,id) WHERE state='pending';
CREATE TABLE link_monitor_items (
 run_id uuid NOT NULL REFERENCES link_monitor_runs(id), check_id bigint NOT NULL REFERENCES link_monitor_checks(id),
 news_id bigint NOT NULL, original_url text NOT NULL, PRIMARY KEY(run_id,news_id)
);
CREATE INDEX link_monitor_news_results ON link_monitor_items(news_id,run_id);
COMMIT;
