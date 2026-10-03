import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';

export type UiEventType = 'page_view' | 'button_click' | 'modal_open' | 'dropdown_change';

export interface UiBehaviorEvent {
  eventType: UiEventType;
  routeUrl?: string;
  elementId?: string;
  elementText?: string;
  timestampUtc: string;
  extra?: Record<string, string | number | boolean>;
}

/**
 * 前端用户行为埋点：自动记录“浏览了哪个页面”，并支持业务组件手动记录按钮点击。
 *
 * 设计要点（务必遵守）：
 * - 本地缓冲 + 定时批量上报，绝不每点一次就发一条 HTTP，避免请求风暴；
 * - 页面卸载时用 navigator.sendBeacon 兜底，尽量把剩余日志送达；
 * - 上报失败只回放少量数据，不做无限重试（这是“尽力型”日志，不能拖垮用户操作）；
 * - 时间戳由浏览器生成，但服务端会以“收到时间”为准（浏览器时间可被篡改）；
 * - 这些日志仅作排查线索，不能当作审计证据（审计必须看服务端业务日志）。
 */
@Injectable({ providedIn: 'root' })
export class UiBehaviorLogger {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private buffer: UiBehaviorEvent[] = [];
  private readonly flushIntervalMs = 7_500;
  private readonly maxBufferSize = 15;
  private readonly maxRetryKeep = 8;
  private readonly endpoint = '/api/logs/ui-behaviors/batch';
  private timerId?: ReturnType<typeof setInterval>;

  constructor() {
    this.listenRouteChanges();
    this.startAutoFlush();
    this.registerBeforeUnload();
  }

  /** 全局自动记录页面访问（路由跳转），业务组件无需手动调用 */
  private listenRouteChanges(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((navEnd) => {
        this.push({
          eventType: 'page_view',
          routeUrl: navEnd.urlAfterRedirects,
          timestampUtc: new Date().toISOString(),
        });
      });
  }

  /** 记录按钮点击（业务组件在 click 处理里调用） */
  logClick(elementId: string, label?: string, extra?: Record<string, string | number | boolean>): void {
    this.push({
      eventType: 'button_click',
      routeUrl: this.router.url,
      elementId,
      elementText: label,
      timestampUtc: new Date().toISOString(),
      extra,
    });
  }

  /** 记录弹窗打开 */
  logModalOpen(elementId: string, label?: string): void {
    this.push({
      eventType: 'modal_open',
      routeUrl: this.router.url,
      elementId,
      elementText: label,
      timestampUtc: new Date().toISOString(),
    });
  }

  private push(evt: UiBehaviorEvent): void {
    this.buffer.push(evt);
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  private startAutoFlush(): void {
    this.timerId = setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  private registerBeforeUnload(): void {
    window.addEventListener('beforeunload', () => this.flush(true));
  }

  async flush(isUnload = false): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = [...this.buffer];
    this.buffer = [];

    if (isUnload && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(this.endpoint, JSON.stringify(batch));
      } catch {
        // beacon 失败：丢弃本批，不阻塞页面关闭
      }
      return;
    }

    try {
      await firstValueFrom(this.http.post(this.endpoint, batch));
    } catch {
      // 上报失败：只回放少量，防止无限堆积
      this.buffer.unshift(...batch.slice(-this.maxRetryKeep));
    }
  }

  destroy(): void {
    if (this.timerId) clearInterval(this.timerId);
  }
}
