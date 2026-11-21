type QueryHandler = (sql: string, values: unknown[]) => unknown;

export function createDatabase(handlers: {
  first?: QueryHandler;
  all?: QueryHandler;
  run?: QueryHandler;
  batch?: (statements: unknown[]) => unknown;
} = {}) {
  const calls: { kind: string; sql?: string; values?: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async first() {
          calls.push({ kind: "first", sql, values: this.values });
          return handlers.first?.(sql, this.values) ?? null;
        },
        async all() {
          calls.push({ kind: "all", sql, values: this.values });
          return handlers.all?.(sql, this.values) ?? { results: [] };
        },
        async run() {
          calls.push({ kind: "run", sql, values: this.values });
          return handlers.run?.(sql, this.values) ?? { success: true };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      calls.push({ kind: "batch" });
      return handlers.batch?.(statements) ?? [];
    },
  };
  return { db: db as unknown as D1Database, calls };
}

export function responseJson<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export function createSessionToken(byte = 7): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function validFitnessProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    fitnessGoal: "build_muscle",
    goalDetails: "Build strength steadily",
    age: 34,
    genderIdentity: "non-binary",
    heightCm: 172,
    weightKg: 68,
    activityLevel: "moderate",
    trainingExperience: "beginner",
    targetEvent: "",
    targetEventDate: "",
    limitations: "",
    equipment: "Dumbbells",
    preferredActivities: "Strength training",
    ...overrides,
  };
}
