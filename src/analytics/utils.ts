declare global {
  interface Window {
    ANALYTICS_DEBUG?: boolean;
  }
}

const warned = new Set<string>();

/**
 * 调试开关：浏览器控制台执行 `window.ANALYTICS_DEBUG = true` 后，
 * event queue 会打印 入队 / 队列条数 / flush 来源与结果 日志。
 */
export function isDebugEnabled(): boolean {
  return typeof window !== 'undefined' && window.ANALYTICS_DEBUG === true;
}

export function warnOnce(key: string, message: string): void {
  if (typeof console === 'undefined') return;
  if (warned.has(key)) return;

  warned.add(key);

  console.warn(`[analytics] ${message}`);
}

export function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}
