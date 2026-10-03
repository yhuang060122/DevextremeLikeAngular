import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { TRACE_SESSION_HEADER, TraceSessionService } from './trace-session.service';

/**
 * Trace-Session-Id 拦截器（handoff 前端 Scope）：
 *  - 出站：给所有业务 API 请求附加 X-Trace-Session-Id（当前 tab 会话 id，无则不加）；
 *  - 入站：从任意响应头捕获 X-Trace-Session-Id（登录响应签发），存入 TraceSessionService，
 *    之后的请求自动携带。
 *
 * 注意：
 *  - 跳过 analytics 上报端点，避免自激循环（与其它拦截器一致）；
 *  - 该头仅日志关联用途，不参与鉴权。
 */
export const traceSessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/analytics/events/')) {
    return next(req);
  }

  const service = inject(TraceSessionService);
  const current = service.traceSessionId();

  const outgoing = current
    ? req.clone({ setHeaders: { [TRACE_SESSION_HEADER]: current } })
    : req;

  return next(outgoing).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          const captured = event.headers.get(TRACE_SESSION_HEADER);
          if (captured) {
            service.setTraceSessionId(captured);
          }
        }
      },
    }),
  );
};
