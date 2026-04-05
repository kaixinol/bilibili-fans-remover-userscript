export const APP_LOG_PREFIX = "[Bilibili Fans Cleaner]";
export const APP_VERSION = __APP_VERSION__;
export const CONFIG_STORAGE_KEY = "bk-fans-cleaner-config";

export interface FansCleanerConfig {
  pageSize: number;
  removeDelayMs: number;
  bulkFetchDelayMinMs: number;
  bulkFetchDelayMaxMs: number;
}

type PartialFansCleanerConfig = Partial<FansCleanerConfig>;

export const DEFAULT_CONFIG: FansCleanerConfig = {
  pageSize: 50,
  removeDelayMs: 800,
  bulkFetchDelayMinMs: 1000,
  bulkFetchDelayMaxMs: 1500
};

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.round(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeConfig(config: PartialFansCleanerConfig): FansCleanerConfig {
  const pageSize = normalizePositiveInt(config.pageSize, DEFAULT_CONFIG.pageSize);
  const removeDelayMs = normalizePositiveInt(config.removeDelayMs, DEFAULT_CONFIG.removeDelayMs);
  const bulkFetchDelayMinMs = normalizePositiveInt(
    config.bulkFetchDelayMinMs,
    DEFAULT_CONFIG.bulkFetchDelayMinMs
  );
  const bulkFetchDelayMaxMs = normalizePositiveInt(
    config.bulkFetchDelayMaxMs,
    DEFAULT_CONFIG.bulkFetchDelayMaxMs
  );

  return {
    pageSize,
    removeDelayMs,
    bulkFetchDelayMinMs: Math.min(bulkFetchDelayMinMs, bulkFetchDelayMaxMs),
    bulkFetchDelayMaxMs: Math.max(bulkFetchDelayMinMs, bulkFetchDelayMaxMs)
  };
}

export async function getFansCleanerConfig(): Promise<FansCleanerConfig> {
  try {
    const storedConfig = await Promise.resolve(
      GM_getValue<PartialFansCleanerConfig>(CONFIG_STORAGE_KEY, {})
    );
    return normalizeConfig(storedConfig);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setFansCleanerConfig(config: PartialFansCleanerConfig): Promise<FansCleanerConfig> {
  const normalizedConfig = normalizeConfig(config);

  await Promise.resolve(GM_setValue(CONFIG_STORAGE_KEY, normalizedConfig));
  return normalizedConfig;
}
