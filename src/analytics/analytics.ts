import { DebugController } from "./debug";
import { hasDom, warnOnce } from "./utils";
import { EventFactory } from "./event-factory";
import { EventQueue, type FlushOptions } from "./event-queue";
import { HttpDestination } from "./http-destination";
import type { AnalyticsContext } from "./domain";
import type { AnalyticsConfig } from "./config";
import type { EventRecorder, ProbeFactory, Tracker } from "./tracker";

export class Analytics implements EventRecorder {

  private readonly trackers: Tracker[] = [];

  readonly debug: DebugController;
  private readonly factory: EventFactory;
  private readonly queue: EventQueue;

  private destroyed = false;

  private readonly handleVisibility = (): void => {
    if (document.visibilityState !== "hidden") return;

    void this.flush({ keepalive: true });
  };

  private readonly handleUnload = (): void => {
    void this.flush({ keepalive: true });
  };

  constructor(config: AnalyticsConfig) {
    this.debug = new DebugController(config.debug === true);

    const destination = new HttpDestination(
      {
        endpoint: config.endpoint,
        headers: config.headers,
        timeoutMs: config.timeoutMs,
      },
      this.debug
    );


    this.queue = new EventQueue(
      destination,
      this.debug,
      {
        batchSize: config.batchSize,
        flushInterval: config.flushInterval,
      }
    );


    this.factory = new EventFactory(this.debug, config.sessionIdProvider);

    this.wireProbes(config.probes);

    this.registerLifecycle();

  }

  private wireProbes(factories: ProbeFactory[] = []): void {

    for (const build of factories) {

      try {

        this.registerTracker(build(this));

      } catch (error) {

        warnOnce(
          "probe-factory-failed",
          "a probe factory threw while wiring the SDK; that probe was " +
            `skipped and the rest were registered (${String(error)})`,
        );

      }

    }

  }

  /**
   * Tear everything down: probes, lifecycle listeners, timers,
   * then one last best-effort flush.
   *
   * Idempotent — a second call does nothing.
   */
  destroy(): void {

    if (this.destroyed) return;
    this.destroyed = true;

    this.unregisterAll();
    this.removeLifecycle();
    this.queue.stop();

    void this.flush().finally(() => this.debug.stop());

  }

  /**
   * Awaitable teardown: waits for the buffered events to be
   * shipped (or to fail) before stopping the queue. Unlike
   * `destroy()` it does not leave a request in flight.
   */
  async close(): Promise<void> {

    if (this.destroyed) return;
    this.destroyed = true;

    this.unregisterAll();
    this.removeLifecycle();

    await this.flush();

    this.queue.stop();
    this.debug.stop();

  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  registerTracker(tracker: Tracker): void {
    this.trackers.push(tracker);
  }

  start(): void {
    for (const tracker of this.trackers) {
      tracker.start();
    }
  }

  unregisterTracker(tracker: Tracker): void {

    const index = this.trackers.indexOf(tracker);

    if (index === -1) return;

    this.trackers.splice(index, 1);

    tracker.stop();

  }

  private unregisterAll(): void {

    this.trackers
      .splice(0)
      .forEach(tracker => tracker.stop());

  }

  private record(
    build: () => AnalyticsContext,
  ): void {

    if (this.destroyed) return;

    try {

      this.queue.enqueue(build());

    } catch (error) {

      warnOnce(
        "record-failed",
        "could not record an event; it was dropped. " +
          `The host app was not affected (${String(error)})`,
      );

    }
  }

  track(
    name: string,
    properties: Record<string, unknown> = {}
  ): void {

    this.record(() => this.factory.track(name, properties));

  }

  page(
    path?: string,
    properties: Record<string, unknown> = {}
  ): void {

    this.record(() => this.factory.page(path, properties));

  }

  flush(options?: FlushOptions): Promise<void> {
    return this.queue.flush(options);
  }

  get pending(): number {
    return this.queue.size;
  }

  private registerLifecycle(): void {

    if (!hasDom()) return;

    document.addEventListener(
      "visibilitychange",
      this.handleVisibility
    );

    window.addEventListener(
      "beforeunload",
      this.handleUnload
    );
  }

  private removeLifecycle(): void {

    if (!hasDom()) return;

    document.removeEventListener(
      "visibilitychange",
      this.handleVisibility
    );

    window.removeEventListener(
      "beforeunload",
      this.handleUnload
    );
  }
}
