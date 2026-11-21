CREATE TABLE IF NOT EXISTS fitness_profiles (
  user_id TEXT PRIMARY KEY,
  fitness_goal TEXT NOT NULL DEFAULT 'general_fitness'
    CHECK (fitness_goal IN ('weight_loss', 'build_muscle', 'event_training', 'maintain', 'general_fitness')),
  goal_details TEXT NOT NULL DEFAULT '',
  age INTEGER CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  gender_identity TEXT NOT NULL DEFAULT '',
  height_cm REAL CHECK (height_cm IS NULL OR height_cm BETWEEN 80 AND 250),
  weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400),
  activity_level TEXT NOT NULL DEFAULT ''
    CHECK (activity_level IN ('', 'low', 'light', 'moderate', 'high')),
  training_experience TEXT NOT NULL DEFAULT ''
    CHECK (training_experience IN ('', 'beginner', 'intermediate', 'advanced')),
  target_event TEXT NOT NULL DEFAULT '',
  target_event_date TEXT NOT NULL DEFAULT '',
  limitations TEXT NOT NULL DEFAULT '',
  equipment TEXT NOT NULL DEFAULT '',
  preferred_activities TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES profiles(user_id)
);
