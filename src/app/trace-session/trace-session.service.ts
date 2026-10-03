import { Injectable, signal } from '@angular/core';

/**
 * Trace-Session-Id 请求/响应头名（与后端 TraceSessionIdMiddleware.HeaderName 一致）。
 * 只用于日志关联，不参与鉴权；后端不会因无效 id 拒绝请求。
 */
export const TRACE_SESSION_HEADER = 'X-Trace-Session-Id';

/**
 * 会话持久化开关。
 * - false（默认，handoff 基准方案）：仅内存 Signal 存储。F5 刷新会丢失 id，
 *   登录会话的日志链路在刷新后中断（重新登录后恢复）。
 * - true：使用 sessionStorage 持久化。sessionStorage 按浏览器 tab 隔离，
 *   F5 刷新存活、关闭 tab 即销毁，不会跨 tab 污染。
 * 切勿使用 localStorage：会造成跨 tab 污染，违反 handoff 约束。
 */
const PERSIST_IN_SESSION_STORAGE = false;
const SESSION_STORAGE_KEY = 'trace-session-id';

/**
 * 登录会话级追踪 ID 服务（方案 A：后端主控，前端持有当前 tab 的会话 id）。
 *
 * 生命周期：
 *  - 登录成功 → 拦截器从响应头 X-Trace-Session-Id 捕获并 setTraceSessionId；
 *  - 登出     → 调用 clear()（同时后端按入站头删除映射）；
 *  - 关 tab   → 内存/ sessionStorage 随之销毁；后端 key 由 TTL 兜底过期。
 */
@Injectable({ providedIn: 'root' })
export class TraceSessionService {
  private readonly _traceSessionId = signal<string | null>(null);

  /** 只读 signal：当前 tab 的 Trace-Session-Id（未登录 / 已登出为 null）。 */
  public readonly traceSessionId = this._traceSessionId.asReadonly();

  constructor() {
    if (PERSIST_IN_SESSION_STORAGE) {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        this._traceSessionId.set(stored);
      }
    }
  }

  /** 由拦截器在登录响应（或任何携带该头的响应）中调用。 */
  public setTraceSessionId(id: string | null): void {
    this._traceSessionId.set(id);
    if (PERSIST_IN_SESSION_STORAGE) {
      if (id) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }

  /** 登出后清空当前 tab 的 Trace-Session-Id。 */
  public clear(): void {
    this.setTraceSessionId(null);
  }
}
