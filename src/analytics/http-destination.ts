import type { AnalyticsContext } from './domain';

export interface SendOptions {
  keepalive?: boolean;
}

export interface Destination {
  send(events: readonly AnalyticsContext[], options?: SendOptions): Promise<void>;
}

export interface HttpDestinationOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const KEEPALIVE_BODY_LIMIT = 60_000;

/** `keepalive` gates on bytes, and bodies are usually UTF-8. */
function byteLength(body: string): number {
  if (typeof TextEncoder === 'undefined') return body.length;

  return new TextEncoder().encode(body).length;
}

export class HttpDestination implements Destination {
  private readonly options: HttpDestinationOptions;

  constructor(options: HttpDestinationOptions) {
    this.options = options;
  }

  async send(events: readonly AnalyticsContext[], options: SendOptions = {}): Promise<void> {
    if (events.length === 0) return;

    const body = JSON.stringify({ events });

    const keepalive = this.allowKeepalive(body, options.keepalive === true);

    let timedOut = false;

    try {
      const response = await this.post(body, keepalive, () => (timedOut = true));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const failure: {
        reason: 'timeout' | 'transport-error';
        message: string;
      } = timedOut
        ? {
            reason: 'timeout',
            message: `no response after ${timeoutMs} ms`,
          }
        : {
            reason: 'transport-error',
            message: String(error),
          };

      throw timedOut ? new Error(failure.message) : error;
    }
  }

  private buildHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',

      ...this.options.headers,
    };
  }

  private buildInit(body: string, keepalive: boolean): RequestInit {
    return {
      method: 'POST',
      headers: this.buildHeaders(),
      body,
      keepalive,
    };
  }

  private allowKeepalive(body: string, requested: boolean): boolean {
    if (!requested) return false;

    return byteLength(body) <= KEEPALIVE_BODY_LIMIT;
  }

  private async post(body: string, keepalive: boolean, onTimeout: () => void): Promise<Response> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const init = this.buildInit(body, keepalive);

    if (typeof AbortController === 'undefined' || timeoutMs <= 0) {
      return fetch(this.options.endpoint, init);
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      onTimeout();
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(this.options.endpoint, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
