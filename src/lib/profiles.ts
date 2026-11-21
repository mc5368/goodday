export async function ensureProfile(db: D1Database, userId: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)").bind(userId).run();
  await db.prepare("INSERT OR IGNORE INTO fitness_profiles (user_id) VALUES (?)").bind(userId).run();
}
