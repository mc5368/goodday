CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  calorie_goal INTEGER NOT NULL DEFAULT 2000,
  protein_goal INTEGER NOT NULL DEFAULT 120,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('meal', 'exercise')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  calories INTEGER NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  muscle_groups TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES profiles(user_id)
);

CREATE INDEX IF NOT EXISTS entries_user_date
  ON entries (user_id, created_at);

CREATE TABLE IF NOT EXISTS pantry (
  user_id TEXT NOT NULL,
  ingredient TEXT NOT NULL,
  PRIMARY KEY (user_id, ingredient),
  FOREIGN KEY (user_id) REFERENCES profiles(user_id)
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES profiles(user_id)
);

CREATE INDEX IF NOT EXISTS chat_user_recent
  ON chat_history (user_id, created_at);
