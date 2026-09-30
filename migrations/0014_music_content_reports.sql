-- Minimal user-submitted moderation intake. Target IDs are intentionally not
-- foreign keys so a report remains reviewable after its content is removed.
CREATE TABLE IF NOT EXISTS music_content_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('planet', 'moment', 'drift_bottle', 'drift_comment', 'direct_message')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) BETWEEN 1 AND 128),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'privacy', 'copyright', 'other')),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at TEXT NOT NULL,
  UNIQUE (reporter_user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS music_content_reports_review_queue
  ON music_content_reports(status, created_at ASC);
CREATE INDEX IF NOT EXISTS music_content_reports_reporter_created
  ON music_content_reports(reporter_user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS music_content_reports_daily_limit
BEFORE INSERT ON music_content_reports
WHEN (
  SELECT count(*) FROM music_content_reports
  WHERE reporter_user_id = NEW.reporter_user_id
    AND substr(created_at, 1, 10) = substr(NEW.created_at, 1, 10)
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'MUSIC_REPORT_DAILY_LIMIT');
END;
