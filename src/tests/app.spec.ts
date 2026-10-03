import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from '../app/app';

/**
 * App 根组件测试：应用模板已改为「导航 + router-outlet」结构，
 * RouterLink / RouterOutlet 需要 Router 提供者，否则 NG0201。
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render nav links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = [...compiled.querySelectorAll('a')].map((a) => a.textContent?.trim());
    expect(links).toContain('Slots Demo');
    expect(links).toContain('Context Guard 测试');
    expect(links).toContain('日志查询');
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });
});
