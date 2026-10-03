import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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

/**
 * API 测试页：验证前后端联调。
 * 点击「Search」→ 请求 GET /api/test/events → 展示服务器时间与最近事件。
 */
@Component({
  selector: 'app-test-page',
  templateUrl: './test-page.html',
})
export class TestPage {
  private readonly http = inject(HttpClient);

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly data = signal<TestEventsResponse | null>(null);

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

  protected formatUtc(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }
}
