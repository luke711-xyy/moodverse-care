CREATE INDEX IF NOT EXISTS music_direct_messages_sender_created
  ON music_direct_messages(sender_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS music_drift_comments_author_created
  ON music_drift_comments(author_user_id, created_at DESC);
