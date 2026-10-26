export const resourceProfile = mode => mode === "balanced"
  ? { maxModels: 2, cacheBytes: 16 * 1024 * 1024, idleMs: 180000 }
  : { maxModels: 1, cacheBytes: 8 * 1024 * 1024, idleMs: 60000 };
