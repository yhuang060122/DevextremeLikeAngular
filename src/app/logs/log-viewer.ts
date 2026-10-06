import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AnalyticsEventLogListItem,
  LogQueryService,
  LogSearchFilter,
} from './log-query.service';

/**
 * 日志查询面板（支持 / 内控只读排查）。
 *
 * 只展示 analytics 事件（page / track / Api Call 等）：
 * - 时间区间、事件类型、事件名筛选 + 分页；
 * - 点击「详情」查看事件完整 payload（属性 / URL / Referrer / UA）。
 *
 * ⚠️ 本面板仅用于问题排查，不能作为合规审计证据。
 */
@Component({
  selector: 'app-log-viewer',
  templateUrl: './log-viewer.html',
  styleUrl: './log-viewer.css',
})
export class LogViewer implements OnInit {
  private readonly logSvc = inject(LogQueryService);

  // ---- 筛选条件（全部用事件绑定 + signal，不引入 FormsModule） ----
  protected readonly fromLocal = signal('');
  protected readonly toLocal = signal('');
  protected readonly eventTypeFilter = signal<'' | 'page' | 'track'>('');
  protected readonly eventNameContains = signal('');
  /** 分析层分类：事件属性 eventType（page/click/business/api/error） */
  protected readonly eventTypePropFilter = signal('');
  /** 分析层分类：事件属性 eventCategory（navigation/task/filter/ui/api/system） */
  protected readonly eventCategoryPropFilter = signal('');

  // ---- 列表状态 ----
  protected readonly items = signal<AnalyticsEventLogListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly pageNumber = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  // ---- analytics 事件详情弹窗 ----
  protected readonly detailVisible = signal(false);
  protected readonly selected = signal<AnalyticsEventLogListItem | null>(null);

  ngOnInit(): void {
    this.setQuickRange(7);
    void this.load();
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
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.logSvc.searchAnalytics({
          ...this.currentFilter(),
          eventType: this.eventTypeFilter() || undefined,
          eventNameContains: this.eventNameContains() || undefined,
          eventTypeProp: this.eventTypePropFilter() || undefined,
          eventCategoryProp: this.eventCategoryPropFilter() || undefined,
        }),
      );
      this.items.set(res.items);
      this.total.set(res.total);
    } catch {
      this.error.set('加载失败：请确认后端 /api/log-query 可达');
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
    await this.load();
  }

  private currentFilter(): LogSearchFilter {
    const from = this.fromLocal();
    const to = this.toLocal();
    return {
      fromUtc: from ? new Date(from).toISOString() : undefined,
      toUtc: to ? new Date(to).toISOString() : undefined,
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize(),
    };
  }

  // ================= 详情 =================

  protected showDetail(item: AnalyticsEventLogListItem): void {
    this.selected.set(item);
    this.detailVisible.set(true);
  }

  /** 解析事件完整属性（后端存 propertiesJson，防御性解析） */
  protected analyticsProps(item: AnalyticsEventLogListItem): Record<string, unknown> {
    if (!item.propertiesJson) return {};
    try {
      return JSON.parse(item.propertiesJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** 属性完整 JSON（详情弹窗用，解析失败回退原文） */
  protected analyticsPropsJson(item: AnalyticsEventLogListItem): string {
    const parsed = this.analyticsProps(item);
    if (Object.keys(parsed).length > 0) {
      return JSON.stringify(parsed, null, 2);
    }
    return item.propertiesJson ?? '（无）';
  }

  /** 列表行的属性摘要：常见键按优先级取一两个 */
  protected analyticsSummary(item: AnalyticsEventLogListItem): string {
    const p = this.analyticsProps(item);
    const s = (key: string): string | null => {
      const v = p[key];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const parts: string[] = [];
    const title = s('title');
    const element = s('element');
    const label = s('label');
    const text = s('text');
    const id = s('id');
    const errorMsg = s('error_message') || s('error');
    if (title) parts.push(title);
    if (element) parts.push(`元素:${element}`);
    if (label) parts.push(`标签:${label}`);
    if (text) parts.push(`文本:${text}`);
    if (id) parts.push(`id:${id}`);
    if (errorMsg) parts.push(`错误:${errorMsg}`);
    if (typeof p['durationMs'] === 'number') parts.push(`${p['durationMs']}ms`);
    return parts.join(' · ') || '—';
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

  private toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
