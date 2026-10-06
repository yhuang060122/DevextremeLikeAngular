import type { AnalyticsContext, AnalyticsEvent, AppMetadata } from './domain';

import { readPageContext, readSessionId } from './domain';

import type { DebugController } from './debug';

export class EventFactory {
  private readonly debug: DebugController;
  private readonly sessionIdProvider: (() => string | null) | undefined;
  private readonly app: AppMetadata | undefined;

  constructor(
    debug: DebugController,
    sessionIdProvider?: () => string | null,
    app?: AppMetadata,
  ) {
    this.debug = debug;
    this.sessionIdProvider = sessionIdProvider;
    this.app = app;
  }

  track(name: string, properties: Record<string, unknown> = {}): AnalyticsContext {
    const event: AnalyticsEvent = {
      type: 'track',
      name,
      properties,
      timestamp: new Date().toISOString(),
    };

    return this.createContext(event);
  }

  page(path?: string, properties: Record<string, unknown> = {}): AnalyticsContext {
    const page = readPageContext();

    const event: AnalyticsEvent = {
      type: 'page',
      name: path ?? page.pagePath,
      properties: {
        title: page.pageTitle,
        ...properties,
      },
      timestamp: new Date().toISOString(),
    };

    return this.createContext(event);
  }

  /**
   * 会话 id 解析：
   * - 配置了 sessionIdProvider → 用提供者实时返回值（如 Trace-Session-Id）；
   * - 未配置 → 回退到 sessionStorage 中宿主播种的 id。
   */
  private resolveSessionId(): string | null {
    if (this.sessionIdProvider) {
      return this.sessionIdProvider();
    }
    return readSessionId();
  }

  private createContext(event: AnalyticsEvent): AnalyticsContext {
    const page = readPageContext();

    // 应用元数据注入：配置一次，随每个事件自动携带。
    // appName / appVersion / appEnvironment 优先级高于业务属性，
    // 防止业务代码意外覆盖全局标识。
    const eventWithApp: AnalyticsEvent = this.app
      ? {
          ...event,
          properties: {
            ...event.properties,
            appName: this.app.name,
            appVersion: this.app.version,
            appEnvironment: this.app.environment,
          },
        }
      : event;

    const scope = globalThis as {
      document?: Document;
      navigator?: { userAgent?: string };
    };

    const context: AnalyticsContext = {
      sessionId: this.resolveSessionId(),
      url: page.pageUrl,
      referrer: scope.document?.referrer || null,
      userAgent: scope.navigator?.userAgent ?? '',
      event: eventWithApp,
    };

    // Debug → CREATED
    this.debug.emit({
      stage: 'created',
      context,
      timestamp: Date.now(),
    });

    return context;
  }
}
