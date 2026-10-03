import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Analytics } from '../../analytics/analytics';
import { ClickTracker } from '../../analytics/click-tracker';
import { STORAGE_KEY } from '../../analytics/domain';
import type { ProbeFactory } from '../../analytics/tracker';
import { routerPageProbe } from './router-page-tracker';

/**
 * 上报地址：沿用本仓库 /api/logs/* 的同源约定。
 * 后端需按 `{ events: AnalyticsContext[] }` 的 JSON 结构接收该接口。
 */
const ANALYTICS_ENDPOINT = '/api/analytics/events/batch';

/** 打开后可在 DevTools 看到 创建→排队→发送→失败 全流程；上线前改为 false */
const ANALYTICS_DEBUG = true;

/**
 * SDK 只读 sessionId、不负责播种；这里在启动时生成一个会话 id
 * 写入 sessionStorage，让同标签页内的所有事件可关联。
 */
function seedSessionId(): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 隐私模式等场景下 storage 不可写：SDK 侧自动回退 sessionId: null
  }
}

/** 点击探针：监听带有 data-analytics 属性的元素 */
function clickProbe(): ProbeFactory {
  return (recorder) => new ClickTracker(recorder);
}

/**
 * 将 src/analytics 的埋点 SDK 接入 Angular 应用：
 * - 根注入器单例，应用启动即初始化（见 app.config.ts 的 provideEnvironmentInitializer）；
 * - 页面浏览用 Router 探针（SPA 路由切换），点击用 ClickTracker（data-analytics 属性）；
 * - 页面隐藏 / 卸载时由 SDK 内部兜底 keepalive 冲刷，业务侧无需处理。
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService implements OnDestroy {
  private readonly analytics: Analytics;

  constructor() {
    seedSessionId();

    const router = inject(Router);

    this.analytics = new Analytics({
      endpoint: ANALYTICS_ENDPOINT,
      debug: ANALYTICS_DEBUG,
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
