import type { AnalyticsContext, AnalyticsEvent } from './domain';

import { readPageContext, readSessionId } from './domain';

import type { DebugController } from './debug';

export class EventFactory {
  private readonly debug: DebugController;

  constructor(debug: DebugController) {
    this.debug = debug;
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

  private createContext(event: AnalyticsEvent): AnalyticsContext {
    const page = readPageContext();

    const scope = globalThis as {
      document?: Document;
      navigator?: { userAgent?: string };
    };

    const context: AnalyticsContext = {
      sessionId: readSessionId(),
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
