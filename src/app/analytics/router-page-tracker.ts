import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import type { Subscription } from 'rxjs';
import type { EventRecorder, ProbeFactory, Tracker } from '../../analytics/tracker';

/**
 * Angular Router 驱动的页面浏览探针。
 *
 * SDK 自带的 PageTracker 面向 MPA：启动时读 window.location.pathname，
 * 只覆盖整页刷新。SPA 的路由切换不会触发它，因此这里用 Router 事件
 * 补上页面浏览：
 * - 首次导航（应用启动）→ 记录初始页面；
 * - 每次 NavigationEnd → 记录目标页面（urlAfterRedirects）。
 *
 * 与 SDK 的 ProbeFactory 契约一致：返回一个 Tracker，由 Analytics
 * 统一管理 start/stop。
 */
export function routerPageProbe(router: Router): ProbeFactory {
  return (recorder: EventRecorder): Tracker => {
    let subscription: Subscription | undefined;

    return {
      start(): void {
        if (subscription) return;

        // 若启动时导航已经完成（例如服务被延迟实例化），
        // 补记当前页面，避免漏掉第一个 page 事件。
        if (router.navigated) {
          recorder.page(router.url, { title: document.title });
        }

        subscription = router.events
          .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
          .subscribe((navEnd) => {
            recorder.page(navEnd.urlAfterRedirects, { title: document.title });
          });
      },

      stop(): void {
        subscription?.unsubscribe();
        subscription = undefined;
      },
    };
  };
}
