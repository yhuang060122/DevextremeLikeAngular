import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { readPageContext } from '../../analytics/domain';
import { AnalyticsService } from './analytics.service';

/**
 * 用 analytics 记录所有 API 调用（方法 / URL / 状态码 / 耗时 / 页面上下文）。
 *
 * 循环防护（关键）：
 * - 跳过 analytics 上报端点自身（/api/analytics/events/），否则
 *   "上报 Api Call → 产生新事件 → 再次上报" 会形成自激循环；
 * - 另外 SDK 上报走原生 fetch、不经 HttpClient，本拦截器天然看不到
 *   它，跳过逻辑是双保险（避免 SDK 未来改走 HttpClient 时引入循环）。
 */
export const apiCallTrackerInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/analytics/events/')) {
    return next(req);
  }

  const analytics = inject(AnalyticsService);
  const started = performance.now();

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          analytics.track('Api Call', {
            ...readPageContext(),
            method: req.method,
            url: req.urlWithParams,
            status: event.status,
            ok: true,
            durationMs: Math.round(performance.now() - started),
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        analytics.track('Api Call', {
          ...readPageContext(),
          method: req.method,
          url: req.urlWithParams,
          status: error.status,
          ok: false,
          error: error.statusText || String(error.message ?? error),
          durationMs: Math.round(performance.now() - started),
        });
      },
    }),
  );
};
