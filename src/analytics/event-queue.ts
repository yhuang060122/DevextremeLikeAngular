import { hasDom, isDebugEnabled } from "./utils";
import type { AnalyticsContext } from "./domain";
import type { Destination } from "./http-destination";

export interface EventQueueOptions {
  batchSize?: number;
  flushInterval?: number;
}

export interface FlushOptions {
  keepalive?: boolean;
}

/** flush 触发来源：schedule=定时 / batch=队列满 / online=网络恢复 / manual=外部手动（卸载、隐藏、显式调用） */
type FlushSource = "schedule" | "batch" | "online" | "manual";

const DEFAULT_OPTIONS: Required<EventQueueOptions> = {
  batchSize: 20,
  flushInterval: 1000,
};

const MAX_BUFFERED_EVENTS = 500;

export class EventQueue {

  private readonly queue: AnalyticsContext[] = [];

  private readonly options: Required<EventQueueOptions>;

  private readonly destination: Destination;

  private inFlight?: Promise<void>;

  private timer?: number;

  private autoFlush = true;

  constructor(
    destination: Destination,
    options: EventQueueOptions = {}
  ) {
    this.destination = destination;

    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    if (hasDom()) {
      window.addEventListener("online", this.handleOnline);
    }
  }

  /** event queue 调试日志：控制台执行 window.ANALYTICS_DEBUG = true 后输出 */
  private log(message: string): void {
    if (!isDebugEnabled()) return;
    console.log(`[analytics][queue] ${message}`);
  }

  enqueue(context: AnalyticsContext): void {

    if (this.queue.length >= MAX_BUFFERED_EVENTS) {
      const dropped = this.queue.shift() as AnalyticsContext;

      this.log(
        `enqueue 队列溢出（>${MAX_BUFFERED_EVENTS}），丢弃最早 1 条（${dropped.event.name}），队列仍为 ${this.queue.length} 条`,
      );
    }

    this.queue.push(context);

    this.log(`enqueue +1（${context.event.name}）→ 队列 ${this.queue.length} 条`);

    if (this.queue.length >= this.options.batchSize) {
      this.log(`enqueue 队列达到 batchSize(${this.options.batchSize})，触发 flush[batch]`);
      void this.runFlush("batch");
      return;
    }

    this.scheduleFlush();

  }

  /** 外部触发的 flush（页面隐藏 / 卸载 / 业务显式调用等），来源记为 manual */
  flush(options?: FlushOptions): Promise<void> {
    return this.runFlush("manual", options);
  }

  private runFlush(source: FlushSource, options?: FlushOptions): Promise<void> {

    if (this.inFlight) {
      this.log(`flush[${source}]：已有发送进行中，跳过本次`);
      return this.inFlight;
    }

    if (this.queue.length === 0) {
      this.log(`flush[${source}]：队列 0 条 → 无数据，跳过`);
      return Promise.resolve();
    }

    this.log(`flush[${source}]：队列 ${this.queue.length} 条 → 开始发送`);

    const run = this.drain(source, options).finally(() => {
      this.inFlight = undefined;
    });

    this.inFlight = run;

    return run;

  }

  private async drain(source: FlushSource, options?: FlushOptions): Promise<void> {

    this.clearTimer();

    while (this.queue.length > 0) {

      const batch = this.queue.slice(
        0,
        this.options.batchSize
      );

      let error: unknown;

      try {

        await this.destination.send(batch, options);

      } catch (caught) {
        error = caught;
      }

      if (!error) {
        this.queue.splice(0, batch.length);
        this.log(`flush[${source}]：已发送 ${batch.length} 条，队列剩余 ${this.queue.length} 条`);
        continue;
      }

      this.drop(batch, error);
      this.log(
        `flush[${source}]：发送失败，丢弃 ${batch.length} 条（${String(error)}），队列剩余 ${this.queue.length} 条`,
      );

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

  }

  private scheduleFlush(): void {

    if (!this.autoFlush) return;
    if (this.timer) return;

    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.runFlush("schedule");
    }, this.options.flushInterval);

  }

  private clearTimer(): void {

    if (!this.timer) return;

    clearTimeout(this.timer);
    this.timer = undefined;

  }

  private readonly handleOnline = (): void => {
    void this.runFlush("online");
  };

}
