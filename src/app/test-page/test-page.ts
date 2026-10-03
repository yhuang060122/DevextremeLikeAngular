import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TraceSessionService } from '../trace-session/trace-session.service';

export interface TestEventItem {
  id: number;
  receivedAtUtc: string;
  eventType: 'page' | 'track';
  eventName: string;
  sessionId?: string | null;
  title?: string | null;
}

export interface TestEventsResponse {
  serverTimeUtc: string;
  total: number;
  items: TestEventItem[];
}

/** Demo 登录响应（真实系统由 JWT 登录 DTO 替换；Trace-Session-Id 走响应头下发）。 */
export interface DemoLoginResponse {
  token: string;
  userId: string;
}

/**
 * API 测试页：验证前后端联调。
 * 点击「Search」→ 请求 GET /api/test/events → 展示服务器时间与最近事件。
 * 下方为 Trace-Session-Id demo：登录/登出演示会话级追踪 id 的签发与清理。
 */
@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.html',
})
export class TestPage {
  private readonly http = inject(HttpClient);
  private readonly traceSession = inject(TraceSessionService);

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly data = signal<TestEventsResponse | null>(null);

  /** 当前 tab 的 Trace-Session-Id（只读 signal，登录后由拦截器自动捕获）。 */
  protected readonly traceSessionId = this.traceSession.traceSessionId;

  /** demo 登录/登出请求进行中标记。 */
  protected readonly demoBusy = signal(false);

  protected async onSearch(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.get<TestEventsResponse>('/api/test/events'),
      );
      this.data.set(res);
    } catch {
      this.error.set('请求失败：请确认后端已启动（cd server && dotnet run）');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onDemoLogin(): Promise<void> {
    this.demoBusy.set(true);
    this.error.set('');
    try {
      // Trace-Session-Id 由 traceSessionInterceptor 从响应头自动捕获并写入服务，
      // 这里只需触发登录请求。
      await firstValueFrom(
        this.http.post<DemoLoginResponse>('/api/auth/login', {
          username: 'demo',
          password: 'demo',
        }),
      );
    } catch {
      this.error.set('Demo 登录失败：请确认后端已启动（cd server && dotnet run）');
    } finally {
      this.demoBusy.set(false);
    }
  }

  protected async onDemoLogout(): Promise<void> {
    this.demoBusy.set(true);
    this.error.set('');
    try {
      // 登出请求自带当前 X-Trace-Session-Id → 后端删除映射。
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      this.error.set('Demo 登出失败：请确认后端已启动（cd server && dotnet run）');
    } finally {
      // 无论成功与否都清空本 tab 的 Trace-Session-Id。
      this.traceSession.clear();
      this.demoBusy.set(false);
    }
  }

  protected formatUtc(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }
}
