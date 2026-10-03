import type { AnalyticsContext, AnalyticsEvent } from './domain';

import { readPageContext, readSessionId } from './domain';

import type { DebugController } from './debug';

export class EventFactory {
  private readonly debug: DebugController;
  private readonly sessionIdProvider: (() => string | null) | undefined;

  constructor(
    debug: DebugController,
    sessionIdProvider?: () => string | null,
  ) {
    this.debug = debug;
    this.sessionIdProvider = sessionIdProvider;
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

    const scope = globalThis as {
      document?: Document;
      navigator?: { userAgent?: string };
    };

    const context: AnalyticsContext = {
      sessionId: this.resolveSessionId(),
      url: page.pageUrl,
      referrer: scope.document?.referrer || null,
      userAgent: scope.navigator?.userAgent ?? '',
      event,
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
