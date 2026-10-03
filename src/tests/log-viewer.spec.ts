import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LogViewer } from '../app/logs/log-viewer';

function emptyPage() {
  return { items: [], total: 0, pageNumber: 1, pageSize: 25, totalPages: 1 };
}

describe('LogViewer（Analytics 事件查询）', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogViewer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('初始化即请求 /api/log-query/analytics 并渲染事件行', async () => {
    const fixture = TestBed.createComponent(LogViewer);
    fixture.detectChanges();

    http
      .expectOne((req) => req.url.includes('/api/log-query/analytics'))
      .flush({
        ...emptyPage(),
        items: [
          {
            id: 2,
            receivedAtUtc: '2026-10-03T12:00:00.000Z',
            sessionId: 's-abc',
            eventType: 'page',
            eventName: '/logs',
            url: 'http://localhost/logs',
            title: '日志查询',
            propertiesJson: '{"title":"日志查询"}',
          },
          {
            id: 1,
            receivedAtUtc: '2026-10-03T12:00:05.000Z',
            sessionId: 's-abc',
            eventType: 'track',
            eventName: 'Element Clicked',
            url: 'http://localhost/logs',
            propertiesJson: '{"element":"nav-logs","text":"日志查询"}',
          },
        ],
      });

    await fixture.whenStable();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    const first = (rows[0] as HTMLTableRowElement).textContent ?? '';
    expect(first).toContain('/logs');
    expect(first).toContain('page');
    const second = (rows[1] as HTMLTableRowElement).textContent ?? '';
    expect(second).toContain('Element Clicked');
  });

  it('筛选：事件类型与事件名作为查询参数', async () => {
    const fixture = TestBed.createComponent(LogViewer);
    fixture.detectChanges();

    http
      .expectOne((req) => req.url.includes('/api/log-query/analytics'))
      .flush(emptyPage());
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      'select[aria-label="事件类型"]',
    ) as HTMLSelectElement;
    select.value = 'page';
    select.dispatchEvent(new Event('change'));

    const input = fixture.nativeElement.querySelector(
      'input[placeholder*="事件名"]',
    ) as HTMLInputElement;
    input.value = '/logs';
    input.dispatchEvent(new Event('input'));

    const searchBtn = fixture.nativeElement.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement;
    searchBtn.click();

    const req = http.expectOne((r) => r.url.includes('/api/log-query/analytics'));
    expect(req.request.params.get('eventType')).toBe('page');
    expect(req.request.params.get('eventNameContains')).toBe('/logs');
    req.flush(emptyPage());
    await fixture.whenStable();
  });

  it('请求失败时展示错误提示', async () => {
    const fixture = TestBed.createComponent(LogViewer);
    fixture.detectChanges();

    http
      .expectOne((req) => req.url.includes('/api/log-query/analytics'))
      .flush('后端不可达', { status: 500, statusText: 'Server Error' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('加载失败');
  });
});
