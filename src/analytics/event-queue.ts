import { hasDom } from "./utils";
import type { AnalyticsContext } from "./domain";
import type { DebugController } from "./debug";
import type { Destination } from "./http-destination";

export interface EventQueueOptions {
  batchSize?: number;
  flushInterval?: number;
}

export interface FlushOptions {
  keepalive?: boolean;
}

const DEFAULT_OPTIONS: Required<EventQueueOptions> = {
  batchSize: 20,
  flushInterval: 1000,
};

const MAX_BUFFERED_EVENTS = 500;

export class EventQueue {

  private readonly queue: AnalyticsContext[] = [];

  private readonly options: Required<EventQueueOptions>;

  private readonly destination: Destination;

  private readonly debug: DebugController;

  private inFlight?: Promise<void>;

  private timer?: number;

  private autoFlush = true;

  constructor(
    destination: Destination,
    debug: DebugController,
    options: EventQueueOptions = {}
  ) {
    this.destination = destination;
    this.debug = debug;

    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    if (hasDom()) {
      window.addEventListener("online", this.handleOnline);
    }
  }

  enqueue(context: AnalyticsContext): void {

    if (this.queue.length >= MAX_BUFFERED_EVENTS) {
      const dropped = this.queue.shift() as AnalyticsContext;

      // Debug → FAILED (terminal: it never even left)
      this.debug.emit({
        stage: "failed",
        context: dropped,
        timestamp: Date.now(),
        reason: "queue-overflow",
        error: "queue overflow",
      });
    }

    this.queue.push(context);

    // Debug → QUEUED
    this.debug.emit({
      stage: "queued",
      context,
      timestamp: Date.now(),
    });

    if (this.queue.length >= this.options.batchSize) {
      void this.flush();
      return;
    }

    this.scheduleFlush();

  }

  flush(options?: FlushOptions): Promise<void> {

    if (this.inFlight) return this.inFlight;

    if (this.queue.length === 0) return Promise.resolve();

    const run = this.drain(options).finally(() => {
      this.inFlight = undefined;
    });

    this.inFlight = run;

    return run;

  }

  private async drain(options?: FlushOptions): Promise<void> {

    this.clearTimer();

    while (this.queue.length > 0) {

      const batch = this.queue.slice(
        0,
        this.options.batchSize
      );

      let error: unknown;

      try {

        // Debug → FLUSHING
        batch.forEach(ctx =>
          this.debug.emit({
            stage: "flushing",
            context: ctx,
            timestamp: Date.now(),
          })
        );

        await this.destination.send(batch, options);

      } catch (caught) {
        error = caught;
      }

      if (!error) {
        this.queue.splice(0, batch.length);
        continue;
      }

      this.drop(batch, error);

    }

  }

  stop(): void {

    this.autoFlush = false;
    this.clearTimer();

    if (hasDom()) {
      window.removeEventListener("online", this.handleOnline);
    }

  }

  get size(): number {
    return this.queue.length;
  }

  private drop(
    batch: readonly AnalyticsContext[],
    error: unknown
  ): void {

    this.queue.splice(0, batch.length);

    batch.forEach(ctx =>
      this.debug.emit({
        stage: "failed",
        context: ctx,
        timestamp: Date.now(),
        reason: "undeliverable",
        error: `dropped after one attempt: ${String(error)}`,
      })
    );

  }

  private scheduleFlush(): void {

    if (!this.autoFlush) return;
    if (this.timer) return;

    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.options.flushInterval);

  }

  private clearTimer(): void {

    if (!this.timer) return;

    clearTimeout(this.timer);
    this.timer = undefined;

  }

  private readonly handleOnline = (): void => {
    void this.flush();
  };

}
