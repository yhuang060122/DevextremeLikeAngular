import type { ProbeFactory } from './tracker';

export interface AnalyticsConfig {
  endpoint: string;

  batchSize?: number;
  flushInterval?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  debug?: boolean;
  probes?: ProbeFactory[];
}
