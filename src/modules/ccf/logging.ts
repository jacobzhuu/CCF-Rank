import { getCCFSettings } from "./settings";

export function safeLog(...args: any[]) {
  try {
    const shouldLog =
      addon.data.env === "development" || getCCFSettings().enableDebugLog;
    if (!shouldLog) return;
    addon.data.ztoolkit.log(...args);
  } catch {
    // Ignore logging failures.
  }
}
