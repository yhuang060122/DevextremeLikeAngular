import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AnalyticsService } from '../app/analytics/analytics.service';
import { TraceSessionService } from '../app/trace-session/trace-session.service';

@Component({ template: '' })
class DummyComponent {}

interface SentBatch {
  events: Array<{
    event: { type: string; name: string; properties: Record<string, unknown> };
    sessionId: string | null;
  }>;
}

describe('AnalyticsService（接入 Angular 应用）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    // 静默 SDK 的 debug 控制台输出，保持测试日志干净
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: DummyComponent },
          { path: 'logs', component: DummyComponent },
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** 取最后一次 POST 到 /api/analytics/events/batch 的请求体 */
  function lastSentBatch(): SentBatch {
    const call = fetchMock.mock.calls.find(
      ([url]) => url === '/api/analytics/events/batch',
    ) as [string, RequestInit];
    expect(call, '期望至少有一次上报到 analytics endpoint').toBeDefined();
    return JSON.parse(call[1].body as string) as SentBatch;
  }

  it('启动即实例化，路由切换产生 page 事件并携带 Trace-Session-Id', async () => {
    // 模拟登录后拦截器写入 Trace-Session-Id
    const traceSession = TestBed.inject(TraceSessionService);
    traceSession.setTraceSessionId('trace-session-1');

    const service = TestBed.inject(AnalyticsService);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/logs');

    await service.flush();

    const batch = lastSentBatch();
    const names = batch.events.map((e) => e.event.name);
    expect(names).toContain('/logs');

    // 事件 sessionId 应取当前 tab 的 Trace-Session-Id
    const sessionIds = new Set(batch.events.map((e) => e.sessionId));
    expect(sessionIds.size).toBe(1);
    expect([...sessionIds][0]).toBe('trace-session-1');
  });

  it('未登录（无 Trace-Session-Id）时事件 sessionId 为 null', async () => {
    // 防御性清空：确保本用例从未登录状态开始
    TestBed.inject(TraceSessionService).clear();

    const service = TestBed.inject(AnalyticsService);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/logs');
    await service.flush();

    const batch = lastSentBatch();
    expect(batch.events.length).toBeGreaterThan(0);
    expect(batch.events.every((e) => e.sessionId === null)).toBe(true);
  });

  it('点击带 data-analytics 的元素记录 Element Clicked（含 id/name/type/label）', async () => {
    const service = TestBed.inject(AnalyticsService);

    const button = document.createElement('button');
    button.setAttribute('data-analytics', 'demo-btn');
    button.setAttribute('name', 'demo-action');
    button.setAttribute('type', 'submit');
    // 文本需 data-analytics-text 显式开启（SDK 的隐私保护设计）
    button.setAttribute('data-analytics-text', '');
    button.textContent = 'Click me';
    document.body.appendChild(button);

    button.click();

    document.body.removeChild(button);

    await service.flush();

    const batch = lastSentBatch();
    const clicked = batch.events.find(
      (e) => e.event.name === 'Element Clicked',
    );
    expect(clicked).toBeDefined();
    expect(clicked?.event.properties['element']).toBe('demo-btn');
    expect(clicked?.event.properties['text']).toBe('Click me');
    // 元素标识四件套：id / name / type / label
    expect(clicked?.event.properties['id']).toBeNull();
    expect(clicked?.event.properties['name']).toBe('demo-action');
    expect(clicked?.event.properties['type']).toBe('submit');
    expect(clicked?.event.properties['label']).toBe('Click me');
  });

  it('点击元素的 label 优先取 aria-label，而非可见文本', async () => {
    const service = TestBed.inject(AnalyticsService);

    const btn = document.createElement('button');
    btn.setAttribute('data-analytics', 'aria-btn');
    btn.setAttribute('aria-label', '删除任务');
    btn.textContent = '×';
    document.body.appendChild(btn);

    btn.click();

    document.body.removeChild(btn);

    await service.flush();

    const batch = lastSentBatch();
    const clicked = batch.events.find(
      (e) => e.event.name === 'Element Clicked',
    );
    expect(clicked).toBeDefined();
    expect(clicked?.event.properties['element']).toBe('aria-btn');
    expect(clicked?.event.properties['label']).toBe('删除任务');
  });
});
