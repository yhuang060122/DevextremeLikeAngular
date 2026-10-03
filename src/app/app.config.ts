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
import { UiBehaviorLogger } from './logs/ui-behavior-logger.service';
import { AnalyticsService } from './analytics/analytics.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // 给所有 API 请求自动打上 X-App-Client: spa-angular，供服务端识别来源
    provideHttpClient(withInterceptors([clientIdentityInterceptor])),
    // 应用启动即激活全局行为埋点（自动记录路由 page_view，无需每个组件注入）
    provideEnvironmentInitializer(() => {
      inject(UiBehaviorLogger);
    }),
    // 应用启动即初始化 analytics SDK（Router 页面探针 + data-analytics 点击探针）。
    // 与 UiBehaviorLogger 是两套独立通道：前者走 /api/logs/*，后者走 ANALYTICS_ENDPOINT。
    provideEnvironmentInitializer(() => {
      inject(AnalyticsService);
    }),
  ],
};
