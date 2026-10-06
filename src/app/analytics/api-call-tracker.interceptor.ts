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
 * 用 analytics 记录所有 API 调用。事件属性：
 *
 * 核心字段（与 jquery-todo 宿主 schema 一致）：
 *   method / url / apiEndpoint / apiVersion / status / ok / durationMs
 * 失败字段（成功时为 null，保持 schema 稳定）：
 *   error_code / error_message / error_track_trace
 *
 * 循环防护（关键）：
 * - 跳过 analytics 上报端点自身（/api/analytics/events/），否则
 *   "上报 Api Call → 产生新事件 → 再次上报" 会形成自激循环；
 * - 另外 SDK 上报走原生 fetch、不经 HttpClient，本拦截器天然看不到
 *   它，跳过逻辑是双保险（避免 SDK 未来改走 HttpClient 时引入循环）。
 */

/** 从请求 URL 提取 API 端点：去掉 query string / hash 的路径。 */
function readApiEndpoint(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    const clean = url.split(/[?#]/)[0];
    return clean || url;
  }
}

/** 从 URL 提取 API 版本号（/api/v1/xxx 或 /api/v1.2/xxx）；无版本段返回 null。 */
function readApiVersion(url: string): string | null {
  const match = url.match(/\/api\/v(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

/** 截断超长文本（错误体可能很长），避免整个进入事件。 */
function clamp(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 失败时收集"错误追踪信息"：优先后端错误响应体（常携带 traceId /
 * 内部错误码），其次错误对象自身。
 */
function readErrorTrackTrace(error: HttpErrorResponse): string | null {
  const body = error.error;
  if (body != null && body !== '') {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const trimmed = text?.trim();
    if (trimmed) return clamp(trimmed);
  }
  const message = error.message?.trim();
  return message ? clamp(message) : null;
}

export const apiCallTrackerInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/analytics/events/')) {
    return next(req);
  }

  const analytics = inject(AnalyticsService);
  const started = performance.now();
  const apiEndpoint = readApiEndpoint(req.urlWithParams);
  const apiVersion = readApiVersion(req.urlWithParams);

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          analytics.track('Api Call', {
            ...readPageContext(),
            method: req.method,
            url: req.urlWithParams,
            apiEndpoint,
            apiVersion,
            status: event.status,
            ok: true,
            durationMs: Math.round(performance.now() - started),
            // 成功时错误字段为 null，schema 不随成败变化
            error_code: null,
            error_message: null,
            error_track_trace: null,
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        const errorMessage = error.statusText || String(error.message ?? error);
        analytics.track('Api Call', {
          ...readPageContext(),
          method: req.method,
          url: req.urlWithParams,
          apiEndpoint,
          apiVersion,
          status: error.status,
          ok: false,
          error: errorMessage,
          error_code: error.status,
          error_message: errorMessage,
          error_track_trace: readErrorTrackTrace(error),
          durationMs: Math.round(performance.now() - started),
        });
      },
    }),
  );
};
