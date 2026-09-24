-- Allow one weather entry per planet and local calendar day going forward.
-- Existing duplicate days remain readable; the trigger blocks new inserts only.
CREATE TRIGGER IF NOT EXISTS mood_entries_one_per_planet_day
BEFORE INSERT ON mood_entries
WHEN NEW.planet_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM mood_entries existing
  WHERE existing.planet_id = NEW.planet_id AND existing.date = NEW.date
)
BEGIN
  SELECT RAISE(ABORT, 'DAILY_ENTRY_EXISTS');
END;
