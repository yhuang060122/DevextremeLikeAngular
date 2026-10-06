import { HttpClient } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnalyticsService } from '../app/analytics/analytics.service';
import { apiCallTrackerInterceptor } from '../app/analytics/api-call-tracker.interceptor';

describe('apiCallTrackerInterceptor（用 analytics 记录 API 调用）', () => {
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiCallTrackerInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    // 初始化 analytics（Router 探针 / 队列）
    TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function sentApiCallEvents(): Array<Record<string, unknown>> {
    const call = fetchMock.mock.calls.find(
      ([url]) => url === '/api/analytics/events/batch',
    ) as [string, RequestInit] | undefined;
    if (!call) return [];
    const body = JSON.parse(call[1].body as string) as {
      events: Array<{ event: { name: string; properties: Record<string, unknown> } }>;
    };
    return body.events
      .filter((e) => e.event.name === 'Api Call')
      .map((e) => e.event.properties);
  }

  it('记录普通 API 调用的 Api Call 事件（method/url/apiEndpoint/status/耗时）', async () => {
    httpClient.get('/api/foo').subscribe();
    http.expectOne('/api/foo').flush({}, { status: 200, statusText: 'OK' });

    await TestBed.inject(AnalyticsService).flush();

    const calls = sentApiCallEvents();
    expect(calls.length).toBe(1);
    expect(calls[0]['method']).toBe('GET');
    expect(calls[0]['url']).toBe('/api/foo');
    expect(calls[0]['apiEndpoint']).toBe('/api/foo');
    expect(calls[0]['apiVersion']).toBeNull();
    expect(calls[0]['eventType']).toBe('api');
    expect(calls[0]['eventCategory']).toBe('api');
    expect(calls[0]['status']).toBe(200);
    expect(calls[0]['ok']).toBe(true);
    expect(typeof calls[0]['durationMs']).toBe('number');
    // 成功时错误字段为 null（schema 不随成败变化）
    expect(calls[0]['error_code']).toBeNull();
    expect(calls[0]['error_message']).toBeNull();
    expect(calls[0]['error_track_trace']).toBeNull();
  });

  it('记录失败的 API 调用（含 error_code / error_message / error_track_trace）', async () => {
    httpClient.get('/api/missing').subscribe({ error: () => undefined });
    http.expectOne('/api/missing').flush(
      { message: 'not found' },
      { status: 404, statusText: 'Not Found' },
    );

    await TestBed.inject(AnalyticsService).flush();

    const calls = sentApiCallEvents();
    expect(calls.length).toBe(1);
    expect(calls[0]['method']).toBe('GET');
    expect(calls[0]['url']).toBe('/api/missing');
    expect(calls[0]['apiEndpoint']).toBe('/api/missing');
    expect(calls[0]['eventType']).toBe('api');
    expect(calls[0]['eventCategory']).toBe('api');
    expect(calls[0]['status']).toBe(404);
    expect(calls[0]['ok']).toBe(false);
    expect(calls[0]['error_code']).toBe(404);
    expect(calls[0]['error_message']).toBe('Not Found');
    // error_track_trace 取后端错误响应体原文（此处为 {message:'not found'} 的 JSON）
    expect(String(calls[0]['error_track_trace'])).toContain('not found');
  });

  it('跳过 /api/analytics/events/ 上报端点，避免自激循环', async () => {
    httpClient.post('/api/analytics/events/batch', { events: [] }).subscribe();
    http.expectOne('/api/analytics/events/batch').flush({}, { status: 200, statusText: 'OK' });

    await TestBed.inject(AnalyticsService).flush();

    expect(sentApiCallEvents().length).toBe(0);
  });
});
