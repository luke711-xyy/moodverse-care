-- Preserve a minimal append-only review history for staff-handled user reports.
-- Reporter deletion removes their reports; reviewer deletion anonymizes the audit actor.
CREATE TABLE IF NOT EXISTS music_report_reviews (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES music_content_reports(id) ON DELETE CASCADE,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT NOT NULL CHECK (from_status IN ('open', 'reviewing')),
  to_status TEXT NOT NULL CHECK (to_status IN ('reviewing', 'actioned', 'dismissed')),
  created_at TEXT NOT NULL,
  CHECK (from_status <> to_status)
);
CREATE INDEX IF NOT EXISTS music_report_reviews_report_created
  ON music_report_reviews(report_id, created_at DESC, id DESC);
