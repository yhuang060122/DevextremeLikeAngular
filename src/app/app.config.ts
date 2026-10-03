import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { clientIdentityInterceptor } from './logs/client-identity.interceptor';
import { traceSessionInterceptor } from './trace-session/trace-session.interceptor';
import { apiCallTrackerInterceptor } from './analytics/api-call-tracker.interceptor';
import { AnalyticsService } from './analytics/analytics.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // 来源标记头 + Trace-Session-Id（登录会话级日志关联，附加/捕获 X-Trace-Session-Id）
    // + 用 analytics 记录 API 调用（后两者都跳过 /api/analytics/events/ 防循环）
    provideHttpClient(
      withInterceptors([
        clientIdentityInterceptor,
        traceSessionInterceptor,
        apiCallTrackerInterceptor,
      ]),
    ),
    // 应用启动即初始化 analytics SDK（Router 页面探针 + data-analytics 点击探针），
    // 全局行为埋点唯一通道；页面隐藏/卸载时由 SDK 内部兜底冲刷。
    provideEnvironmentInitializer(() => {
      inject(AnalyticsService);
    }),
  ],
};
