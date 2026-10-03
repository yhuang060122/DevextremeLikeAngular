export interface EventRecorder {
  track(
    name: string,
    properties?: Record<string, unknown>
  ): void;

  page(
    path?: string,
    properties?: Record<string, unknown>
  ): void;

}

export interface Tracker {
  start(): void;
  stop(): void;
}

export type ProbeFactory = (recorder: EventRecorder) => Tracker;


export abstract class BaseTracker implements Tracker {
  private running = false;

  start(): void {
    if (this.running) return;
    if (!this.canStart()) return;

    this.running = true;
    this.onStart();
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.onStop();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Return false to skip starting. The tracker stays stopped,
   * so a later `start()` can still succeed once the runtime
   * appears.
   */
  protected canStart(): boolean {
    return true;
  }

  protected abstract onStart(): void;

  protected abstract onStop(): void;
}
