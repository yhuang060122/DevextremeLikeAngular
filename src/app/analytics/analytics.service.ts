import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Analytics } from '../../analytics/analytics';
import { ClickTracker } from '../../analytics/click-tracker';
import type { ProbeFactory } from '../../analytics/tracker';
import { TraceSessionService } from '../trace-session/trace-session.service';
import { routerPageProbe } from './router-page-tracker';

/**
 * 上报地址：沿用本仓库 /api/logs/* 的同源约定。
 * 后端需按 `{ events: AnalyticsContext[] }` 的 JSON 结构接收该接口。
 */
const ANALYTICS_ENDPOINT = '/api/analytics/events/batch';

/** 打开后可在 DevTools 看到 创建→排队→发送→失败 全流程；上线前改为 false */
const ANALYTICS_DEBUG = true;

/**
 * 应用元数据：随每个 analytics 事件自动携带（appName / appVersion / appEnvironment）。
 * version 建议构建时注入（如 Angular define / 环境替换），demo 阶段先写常量；
 * environment 按 hostname 推断（localhost → development），部署到生产主机自动变为 production。
 */
function detectEnvironment(): string {
  if (typeof window === 'undefined') return 'development';
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' ? 'development' : 'production';
}

const APP_META = {
  name: 'DevextremeLikeDataGrid',
  version: '0.0.0',
  environment: detectEnvironment(),
};

/** 点击探针：监听带有 data-analytics 属性的元素 */
function clickProbe(): ProbeFactory {
  return (recorder) => new ClickTracker(recorder);
}

/**
 * 将 src/analytics 的埋点 SDK 接入 Angular 应用：
 * - 根注入器单例，应用启动即初始化（见 app.config.ts 的 provideEnvironmentInitializer）；
 * - 页面浏览用 Router 探针（SPA 路由切换），点击用 ClickTracker（data-analytics 属性）；
 * - 事件 sessionId 使用登录会话的 Trace-Session-Id（未登录时为 null），
 *   由 TraceSessionService 提供，登录后拦截器捕获响应头并实时生效；
 * - 页面隐藏 / 卸载时由 SDK 内部兜底 keepalive 冲刷，业务侧无需处理。
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService implements OnDestroy {
  private readonly analytics: Analytics;

  constructor() {
    const router = inject(Router);
    const traceSession = inject(TraceSessionService);

    this.analytics = new Analytics({
      endpoint: ANALYTICS_ENDPOINT,
      debug: ANALYTICS_DEBUG,
      app: APP_META,
      // 会话关联改用 Trace-Session-Id：登录后由拦截器写入 TraceSessionService，
      // 每个事件创建时实时读取（未登录/已登出为 null）。
      sessionIdProvider: () => traceSession.traceSessionId(),
      probes: [clickProbe(), routerPageProbe(router)],
    });

    this.analytics.start();
  }

  /** 自定义事件（业务组件可在关键操作处调用） */
  track(name: string, properties: Record<string, unknown> = {}): void {
    this.analytics.track(name, properties);
  }

  /** 手动上报页面浏览（一般不需要：Router 探针已自动记录） */
  page(path?: string, properties: Record<string, unknown> = {}): void {
    this.analytics.page(path, properties);
  }

  /** 立即冲刷缓冲中的事件 */
  flush(): Promise<void> {
    return this.analytics.flush();
  }

  /** 当前缓冲中尚未发送的事件数 */
  get pending(): number {
    return this.analytics.pending;
  }

  ngOnDestroy(): void {
    this.analytics.destroy();
  }
}
