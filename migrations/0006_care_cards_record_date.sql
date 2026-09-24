-- Key care cards to the user's local check-in day, not the UTC day of creation.
ALTER TABLE care_cards ADD COLUMN record_date TEXT;

UPDATE care_cards SET record_date = substr(created_at, 1, 10) WHERE record_date IS NULL;

DROP INDEX IF EXISTS care_cards_planet_day;
CREATE UNIQUE INDEX IF NOT EXISTS care_cards_planet_record_day ON care_cards(planet_id, record_date);
