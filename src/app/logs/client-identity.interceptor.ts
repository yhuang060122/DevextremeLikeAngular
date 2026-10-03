import { HttpInterceptorFn } from '@angular/common/http';

/** 请求头常量：让服务端能区分请求来源（Angular / Scalar / 其它客户端） */
export const HEADER_APP_CLIENT = 'X-App-Client';
export const HEADER_APP_SOURCE_ID = 'X-App-SourceId';

/** Angular SPA 的客户端标识（与后端 LogClientSource.SpaAngular 对应） */
export const CLIENT_SPA_ANGULAR = 'spa-angular';

/**
 * 给所有业务 API 请求自动打上来源标记头。
 *
 * 服务端配合：自定义 AccessLogMiddleware 读取该头，把请求归类为
 * spa-angular / scalar / unknown-api-client，便于支持/内控排查。
 *
 * 注意：
 * - 不上报埋点接口自身（analytics 事件批量上报），避免“埋点接口
 *   又产生日志”的自激循环；
 * - Header 可以被伪造，这只是来源标签，不是安全鉴权（鉴权仍走 JWT）。
 */
export const clientIdentityInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/analytics/events/batch')) {
    return next(req);
  }
  return next(
    req.clone({ setHeaders: { [HEADER_APP_CLIENT]: CLIENT_SPA_ANGULAR } }),
  );
};

/**
 * 给某个关键业务请求附加“动作来源”提示（可选）。
 *
 * 用法：
 *   this.http.post('/api/funds/1/revalue', payload, {
 *     headers: { [HEADER_APP_SOURCE_ID]: 'ui-btn-run-nav-calculation' },
 *   });
 * 服务端会把它存到 ApiAccessLog.SourceHint，用于定位“是页面哪个按钮触发的”。
 */
export const withSourceId = (sourceId: string) => ({ [HEADER_APP_SOURCE_ID]: sourceId });
