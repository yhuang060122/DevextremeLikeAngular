import type { AnalyticsContext } from "./domain";

export type PipelineStage =
  | "created"
  | "queued"
  | "flushing"
  | "sent"
  | "failed";

export type DebugFailureReason =
  | "queue-overflow"
  | "undeliverable"
  | "transport-error"
  | "timeout";

export interface DebugEvent {
  stage: PipelineStage;
  context: AnalyticsContext;
  timestamp: number;
  durationMs?: number;
  error?: string;

  /** Set on `failed` only. */
  reason?: DebugFailureReason;
}


const STAGE_COLORS: Record<PipelineStage, string> = {
  created: "#64748B",
  queued: "#F59E0B",
  flushing: "#3B82F6",
  sent: "#22C55E",
  failed: "#EF4444",
};

export class DebugController {

  private reporting: boolean;

  observe: ((event: DebugEvent) => void) | undefined = undefined;

  constructor(reporting = false) {

    this.reporting = reporting;

  }

  emit(event: DebugEvent): void {

    if (!this.reporting) return;

    if (this.observe) {
      this.observe(event);
      return;
    }

    this.log(event);

  }

  console(enable: boolean): void {

    this.reporting = enable;

  }

  stop(): void {

    this.reporting = false;
    this.observe = undefined;

  }
  
  private log(event: DebugEvent): void {

    const label = event.reason
      ? `${event.stage.toUpperCase()} · ${event.reason}`
      : event.stage.toUpperCase();

    console.log(
      `%c${label}`,
      `color:${STAGE_COLORS[event.stage]};font-weight:bold`,
      event.context.event.name,
      event.context.event.properties,
    );

  }

}
