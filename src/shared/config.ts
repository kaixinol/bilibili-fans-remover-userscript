export const APP_LOG_PREFIX = "[Bilibili Fans Cleaner]";
export const APP_VERSION = __APP_VERSION__;
export const CONFIG_STORAGE_KEY = "bk-fans-cleaner-config";

export type FansQueryMode = "legacy" | "attribute";
import { GM_getValue, GM_setValue } from '$';

export interface FansCleanerConfig {
  pageSize: number;
  removeDelayMs: number;
  bulkFetchDelayMinMs: number;
  bulkFetchDelayMaxMs: number;
  fansQueryMode: FansQueryMode;
}

type PartialFansCleanerConfig = Partial<FansCleanerConfig>;

export const DEFAULT_CONFIG: FansCleanerConfig = {
  pageSize: 50,
  removeDelayMs: 800,
  bulkFetchDelayMinMs: 1000,
  bulkFetchDelayMaxMs: 1500,
  fansQueryMode: "attribute"
};

// 检查 GM API 是否可用
function isGMAvailable(): boolean {
  return typeof GM_getValue === "function" && typeof GM_setValue === "function";
}

// 使用 localStorage 作为开发环境的 fallback
function getFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setToLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("[Bilibili Fans Cleaner] localStorage 保存失败", error);
  }
}

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
  const fansQueryMode = config.fansQueryMode === "legacy" ? "legacy" : "attribute";

  return {
    pageSize,
    removeDelayMs,
    bulkFetchDelayMinMs: Math.min(bulkFetchDelayMinMs, bulkFetchDelayMaxMs),
    bulkFetchDelayMaxMs: Math.max(bulkFetchDelayMinMs, bulkFetchDelayMaxMs),
    fansQueryMode
  };
}

export async function getFansCleanerConfig(): Promise<FansCleanerConfig> {
  try {
    let storedConfig: PartialFansCleanerConfig;
    
    if (isGMAvailable()) {
      storedConfig = await Promise.resolve(
        GM_getValue<PartialFansCleanerConfig>(CONFIG_STORAGE_KEY, {})
      );
    } else {
      // 开发环境使用 localStorage
      storedConfig = getFromLocalStorage<PartialFansCleanerConfig>(CONFIG_STORAGE_KEY, {});
    }
    
    return normalizeConfig(storedConfig);
  } catch (error) {
    console.warn("[Bilibili Fans Cleaner] 读取配置失败，使用默认配置", error);
    return DEFAULT_CONFIG;
  }
}

export async function setFansCleanerConfig(config: PartialFansCleanerConfig): Promise<FansCleanerConfig> {
  const normalizedConfig = normalizeConfig(config);

  try {
    if (isGMAvailable()) {
      await Promise.resolve(GM_setValue(CONFIG_STORAGE_KEY, normalizedConfig));
    } else {
      // 开发环境使用 localStorage
      setToLocalStorage(CONFIG_STORAGE_KEY, normalizedConfig);
    }
  } catch (error) {
    console.warn("[Bilibili Fans Cleaner] 配置保存失败", error);
  }
  
  return normalizedConfig;
}
