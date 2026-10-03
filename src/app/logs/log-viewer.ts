import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ApiAccessLogDetail,
  ApiAccessLogListItem,
  LogPipelineSnapshot,
  LogQueryService,
  LogSearchFilter,
  UiBehaviorLogListItem,
} from './log-query.service';

type TabMode = 'api' | 'ui';

/**
 * 日志查询面板（支持 / 内控只读排查）。
 *
 * 能回答这些问题：
 * - 这个请求是从 Angular 前端、Scalar 文档面板，还是 Postman/curl 发起的？
 * - 谁、几点几分、调用了什么接口、返回码多少、耗时多久？
 * - 用户点了按钮，有没有真的发出对应 API？（用「附近事件」核对）
 * - 日志后台管道本身健不健康（Worker 心跳 / 队列堆积）？
 *
 * ⚠️ 本面板仅用于问题排查，不能作为合规审计证据。
 */
@Component({
  selector: 'app-log-viewer',
  templateUrl: './log-viewer.html',
  styleUrl: './log-viewer.css',
})
export class LogViewer implements OnInit, OnDestroy {
  private readonly logSvc = inject(LogQueryService);

  // ---- 筛选条件（全部用事件绑定 + signal，不引入 FormsModule） ----
  protected readonly fromLocal = signal('');
  protected readonly toLocal = signal('');
  protected readonly userName = signal('');
  protected readonly pathContains = signal('');
  protected readonly clientSource = signal('');
  protected readonly statusCode = signal('');

  // ---- 列表状态 ----
  protected readonly activeTab = signal<TabMode>('api');
  protected readonly apiItems = signal<ApiAccessLogListItem[]>([]);
  protected readonly uiItems = signal<UiBehaviorLogListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly pageNumber = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  // ---- 详情弹窗 ----
  protected readonly detailVisible = signal(false);
  protected readonly selectedDetail = signal<ApiAccessLogDetail | null>(null);

  // ---- 附近事件弹窗 ----
  protected readonly correlateVisible = signal(false);
  protected readonly correlateApi = signal<ApiAccessLogListItem[]>([]);
  protected readonly correlateUi = signal<UiBehaviorLogListItem[]>([]);
  protected readonly correlateAnchor = signal('');

  // ---- 管道健康状态（10s 自动刷新） ----
  protected readonly pipeline = signal<LogPipelineSnapshot | null>(null);
  private pipelineTimer?: ReturnType<typeof setInterval>;

  protected readonly sourceOptions = [
    { label: '全部来源', value: '' },
    { label: 'SPA Angular', value: 'spa-angular' },
    { label: 'Scalar', value: 'scalar' },
    { label: '其他 / Unknown', value: 'unknown-api-client' },
  ];

  ngOnInit(): void {
    this.setQuickRange(7);
    void this.loadCurrentTab();
    void this.loadPipeline();
    this.pipelineTimer = setInterval(() => void this.loadPipeline(), 10_000);
  }

  ngOnDestroy(): void {
    if (this.pipelineTimer) clearInterval(this.pipelineTimer);
  }

  // ================= 查询与分页 =================

  protected setQuickRange(days: number): void {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    this.fromLocal.set(this.toLocalInput(from));
    this.toLocal.set(this.toLocalInput(now));
  }

  protected async onSearch(): Promise<void> {
    this.pageNumber.set(1);
    await this.loadCurrentTab();
  }

  protected async loadCurrentTab(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.activeTab() === 'api') {
        const res = await firstValueFrom(this.logSvc.searchApiAccess(this.currentFilter()));
        this.apiItems.set(res.items);
        this.total.set(res.total);
      } else {
        const res = await firstValueFrom(this.logSvc.searchUiBehavior(this.currentFilter()));
        this.uiItems.set(res.items);
        this.total.set(res.total);
      }
    } catch {
      this.error.set('加载失败：请确认后端 /api/log-query 可达，且当前账号具备 LogViewer / Admin 角色');
    } finally {
      this.loading.set(false);
    }
  }

  protected totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  protected async onPage(delta: number): Promise<void> {
    const next = this.pageNumber() + delta;
    if (next < 1) return;
    const totalPages = Math.max(1, Math.ceil(this.total() / this.pageSize()));
    if (next > totalPages) return;
    this.pageNumber.set(next);
    await this.loadCurrentTab();
  }

  protected async switchTab(tab: TabMode): Promise<void> {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.pageNumber.set(1);
    await this.loadCurrentTab();
  }

  private currentFilter(): LogSearchFilter {
    const from = this.fromLocal();
    const to = this.toLocal();
    const status = Number(this.statusCode());
    return {
      fromUtc: from ? new Date(from).toISOString() : undefined,
      toUtc: to ? new Date(to).toISOString() : undefined,
      userNameContains: this.userName() || undefined,
      pathContains: this.pathContains() || undefined,
      clientSource: this.clientSource() || undefined,
      statusCode: Number.isFinite(status) && status > 0 ? status : undefined,
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize(),
    };
  }

  // ================= 详情 / 附近事件 =================

  protected async showDetail(item: ApiAccessLogListItem): Promise<void> {
    try {
      const det = await firstValueFrom(this.logSvc.getApiDetail(item.id));
      this.selectedDetail.set(det);
      this.detailVisible.set(true);
    } catch {
      this.error.set('获取日志详情失败（记录可能已归档或已被清理）');
    }
  }

  protected async showCorrelate(item: ApiAccessLogListItem): Promise<void> {
    if (!item.userId) return;
    try {
      const res = await firstValueFrom(
        this.logSvc.correlateNearby(item.userId, item.createdAtUtc, 45),
      );
      this.correlateApi.set(res.apiLogs);
      this.correlateUi.set(res.uiLogs);
      this.correlateAnchor.set(item.createdAtUtc);
      this.correlateVisible.set(true);
    } catch {
      this.error.set('关联查询失败');
    }
  }

  // ================= 管道健康 =================

  private async loadPipeline(): Promise<void> {
    try {
      this.pipeline.set(await firstValueFrom(this.logSvc.getPipelineStatus()));
    } catch {
      // 健康接口暂时不可达：静默，不炸页面
    }
  }

  // ================= 展示辅助 =================

  protected formatUtc(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }

  protected sourceClass(src: string): string {
    if (src === 'spa-angular') return 'badge badge-spa';
    if (src === 'scalar') return 'badge badge-scalar';
    return 'badge badge-unknown';
  }

  protected methodClass(m: string): string {
    switch (m) {
      case 'GET': return 'text-sky-600 font-semibold';
      case 'POST': return 'text-emerald-600 font-semibold';
      case 'PUT': return 'text-amber-600 font-semibold';
      case 'DELETE': return 'text-red-600 font-semibold';
      default: return 'font-semibold';
    }
  }

  protected pipelineCardStyle(): Record<string, string> {
    const p = this.pipeline();
    if (!p) return {};
    const critical =
      p.apiWorkerStaleSec > 90 || p.uiWorkerStaleSec > 90 ||
      p.apiPending >= 2500 || p.uiPending >= 2500;
    const warn =
      p.apiPending >= 800 || p.uiPending >= 800 ||
      p.apiWorkerStaleSec > 30 || p.uiWorkerStaleSec > 30;
    return critical
      ? { background: '#fee2e2', borderColor: '#f87171' }
      : warn
        ? { background: '#fef3c7', borderColor: '#fbbf24' }
        : { background: '#dcfce7', borderColor: '#4ade80' };
  }

  protected pipelineStatusText(): string {
    const p = this.pipeline();
    if (!p) return '管道状态未知';
    if (p.apiWorkerStaleSec > 90 || p.uiWorkerStaleSec > 90 || p.apiPending >= 2500 || p.uiPending >= 2500) {
      return '⚠ 日志 Worker 疑似卡死 / 队列严重堆积';
    }
    if (p.apiPending >= 800 || p.uiPending >= 800 || p.apiWorkerStaleSec > 30 || p.uiWorkerStaleSec > 30) {
      return '⚠ 日志通道有堆积 / Worker 节拍变慢';
    }
    return '✓ 日志后台管道正常';
  }

  private toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
