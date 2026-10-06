import type { ProbeFactory } from './tracker';
import type { AppMetadata } from './domain';

export interface AnalyticsConfig {
  endpoint: string;

  batchSize?: number;
  flushInterval?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  debug?: boolean;
  probes?: ProbeFactory[];

  /**
   * 应用元数据（可选）。配置一次，随每个事件自动携带
   * appName / appVersion / appEnvironment 三个属性。
   */
  app?: AppMetadata;

  /**
   * 会话 id 提供者（可选）。
   *
   * 提供时：每个事件的 sessionId 都由该函数实时取值（例如 Angular 侧
   * 返回登录会话的 Trace-Session-Id），未提供时回退到 sessionStorage
   * 里宿主播种的 id（见 domain.readSessionId）。
   */
  sessionIdProvider?: () => string | null;
}
