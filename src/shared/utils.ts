import { APP_LOG_PREFIX } from "./config";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length !== 2) {
    return null;
  }

  return parts.pop()?.split(";").shift() ?? null;
}

export function parseMidFromLocation(url: string): string | null {
  return url.match(/space\.bilibili\.com\/(\d+)/)?.[1] ?? null;
}

export function injectStyle(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

export function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export function logInfo(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(APP_LOG_PREFIX, message);
    return;
  }

  console.info(APP_LOG_PREFIX, message, payload);
}

export function logError(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.error(APP_LOG_PREFIX, message);
    return;
  }

  console.error(APP_LOG_PREFIX, message, payload);
}
