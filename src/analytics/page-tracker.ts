import { BaseTracker } from "./tracker";
import type { EventRecorder } from "./tracker";
import { hasDom } from "./utils";
import { readPageContext } from "./domain";

export class PageTracker extends BaseTracker {

  private readonly recorder: EventRecorder;

  private currentPath = "";

  private enteredAt = 0;

  constructor(recorder: EventRecorder) {
    super();

    this.recorder = recorder;
  }

  /**
   * Start browser page tracking.
   */
  protected override canStart(): boolean {
    return hasDom();
  }

  protected onStart(): void {

    this.currentPath = window.location.pathname;

    this.trackPage();

    this.enteredAt = performance.now();

    document.addEventListener(
      "visibilitychange",
      this.handleVisibility
    );

    window.addEventListener(
      "beforeunload",
      this.handleUnload
    );

  }

  protected onStop(): void {

    document.removeEventListener(
      "visibilitychange",
      this.handleVisibility
    );

    window.removeEventListener(
      "beforeunload",
      this.handleUnload
    );

  }

  private trackPage(
    path: string = this.currentPath
  ): void {

    this.recorder.page(
      path,
      {
        title: document.title,
        eventType: "page",
        eventCategory: "navigation",
      }
    );

  }

  private trackDuration(): void {

    const duration = Math.round(
      performance.now() - this.enteredAt
    );

    this.recorder.track(
      "Page Duration",
      {
        // The shared reader, so these three keys cannot drift
        // from the ones on an `Element Clicked`. This file used
        // to read `document.title` itself, which is the exact
        // duplication the read-then-spread form exists to stop.
        ...readPageContext(),

        eventType: "page",
        eventCategory: "navigation",

        durationMs: duration,
      }
    );

  }

  private handleVisibility = (): void => {

    if (document.visibilityState === "hidden") {
      this.trackDuration();
    }

  };

  private handleUnload = (): void => {

    this.trackDuration();

  };

}