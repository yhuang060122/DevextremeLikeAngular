import { HttpClient } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TRACE_SESSION_HEADER, TraceSessionService } from '../app/trace-session/trace-session.service';
import { traceSessionInterceptor } from '../app/trace-session/trace-session.interceptor';

describe('traceSessionInterceptor（会话级追踪 id 附加 / 捕获）', () => {
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let svc: TraceSessionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([traceSessionInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    svc = TestBed.inject(TraceSessionService);
  });

  afterEach(() => {
    svc.clear();
  });

  it('未登录时不附加 X-Trace-Session-Id', () => {
    httpClient.get('/api/foo').subscribe();
    const req = http.expectOne('/api/foo');
    expect(req.request.headers.has(TRACE_SESSION_HEADER)).toBe(false);
    req.flush({});
  });

  it('已有 id 时给所有业务请求附加 X-Trace-Session-Id', () => {
    svc.setTraceSessionId('sid-1');

    httpClient.get('/api/foo').subscribe();
    const req = http.expectOne('/api/foo');
    expect(req.request.headers.get(TRACE_SESSION_HEADER)).toBe('sid-1');
    req.flush({});
  });

  it('从登录响应头捕获 Trace-Session-Id 并存入服务', () => {
    httpClient.post('/api/auth/login', {}).subscribe();

    const req = http.expectOne('/api/auth/login');
    req.flush(
      { token: 't', userId: 'demo' },
      {
        status: 200,
        statusText: 'OK',
        headers: { [TRACE_SESSION_HEADER]: 'sid-login-1' },
      },
    );

    expect(svc.traceSessionId()).toBe('sid-login-1');
  });

  it('跳过 /api/analytics/events/ 上报端点，避免自激循环', () => {
    svc.setTraceSessionId('sid-1');

    httpClient.post('/api/analytics/events/batch', { events: [] }).subscribe();
    const req = http.expectOne('/api/analytics/events/batch');
    expect(req.request.headers.has(TRACE_SESSION_HEADER)).toBe(false);
    req.flush({});
  });
});
