import { warnOnce } from './utils';

export type AnalyticsEventType = 'track' | 'page';

export interface AnalyticsEvent {
  readonly type: AnalyticsEventType;

  /**
   * Track → event name
   * Page  → page path
   */
  readonly name: string;

  readonly properties: Readonly<Record<string, unknown>>;

  readonly timestamp: string;
}

export interface AnalyticsContext {
  readonly sessionId: string | null;

  readonly url: string;

  readonly referrer: string | null;

  readonly userAgent: string;

  readonly event: AnalyticsEvent;
}

/**
 * 应用元数据：创建 Analytics 实例时注入一次，
 * 随每个事件自动携带（appName / appVersion / appEnvironment）。
 *
 * 配置一次、全事件生效，适合区分多应用 / 多环境的数据，
 * 不需要在每个 track 调用处手动传。
 */
export interface AppMetadata {
  /** 应用名称，如 "DevextremeLikeDataGrid" / "jquery-todo" */
  readonly name: string;

  /** 应用版本，如 package.json 的 version */
  readonly version: string;

  /** 运行环境：development / staging / production 等 */
  readonly environment: string;
}

export function readPageContext(): {
  pagePath: string;
  pageUrl: string;
  pageTitle: string;
} {
  const scope = typeof globalThis !== 'undefined' ? globalThis : undefined;

  const location = (scope as { location?: Location } | undefined)?.location;
  const doc = (scope as { document?: Document } | undefined)?.document;

  return {
    pagePath: location?.pathname ?? '',
    pageUrl: location?.href ?? '',
    pageTitle: doc?.title ?? '',
  };
}

/**
 * 会话 id 的存储键（仅作为未配置 sessionIdProvider 时的回退）。
 *
 * SDK 只读不写：由宿主应用在启动时播种（写入失败时事件自动携带 sessionId: null）。
 * Angular 宿主已改用 Trace-Session-Id（AnalyticsConfig.sessionIdProvider），
 * 此存储回退仅供其它宿主使用。
 */
export const STORAGE_KEY = 'analytics.session';

const STORAGE_WARNING =
  'sessionStorage could not be read, so no session id is ' +
  'available. Events will carry sessionId: null. If the host ' +
  'writes a correlation id, it will be picked up on the next ' +
  'event.';

export function readSessionId(): string | null {
  // No DOM, no storage (SSR): there is no page to correlate, and
  // therefore nothing to degrade.
  if (typeof sessionStorage === 'undefined') return null;

  let stored: string | null;

  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    warnOnce('session-storage', STORAGE_WARNING);

    return null;
  }

  return stored ? stored : null;
}
