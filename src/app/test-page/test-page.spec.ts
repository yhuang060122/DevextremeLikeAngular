import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TestPage } from './test-page';

describe('TestPage（API 测试页）', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('点击 Search 请求 /api/test/events 并渲染事件行', async () => {
    const fixture = TestBed.createComponent(TestPage);
    fixture.detectChanges();

    // 初始状态：无结果提示
    expect(fixture.nativeElement.textContent).toContain('点击上方 Search 按钮查看结果');

    const button = fixture.nativeElement.querySelector(
      'button[data-analytics="test-page-search"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();

    const req = http.expectOne('/api/test/events');
    expect(req.request.method).toBe('GET');
    req.flush({
      serverTimeUtc: '2026-10-03T17:00:00.000Z',
      total: 2,
      items: [
        {
          id: 2,
          receivedAtUtc: '2026-10-03T16:59:00.000Z',
          eventType: 'page',
          eventName: '/test',
          sessionId: 's-1',
          title: 'API 测试',
        },
        {
          id: 1,
          receivedAtUtc: '2026-10-03T16:58:00.000Z',
          eventType: 'track',
          eventName: 'Element Clicked',
          sessionId: 's-1',
          title: null,
        },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('事件总数：2');
    expect(text).toContain('/test');
    expect(text).toContain('Element Clicked');
    expect(text).toContain('page');
    expect(text).not.toContain('点击上方 Search 按钮查看结果');
  });

  it('请求失败时展示错误提示', async () => {
    const fixture = TestBed.createComponent(TestPage);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[data-analytics="test-page-search"]',
    ) as HTMLButtonElement;
    button.click();

    const req = http.expectOne('/api/test/events');
    req.flush('后端不可达', { status: 500, statusText: 'Server Error' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('请求失败：请确认后端已启动');
  });
});
