import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface LogSearchFilter {
  fromUtc?: string;
  toUtc?: string;
  /** analytics 事件专用：page / track（SDK 底层类型列） */
  eventType?: 'page' | 'track';
  /** analytics 事件专用：事件名（track 名 / page 路径）模糊匹配 */
  eventNameContains?: string;
  /** 分析层分类：事件属性中的 eventType（page/click/business/api/error） */
  eventTypeProp?: string;
  /** 分析层分类：事件属性中的 eventCategory（navigation/task/filter/ui/api/system） */
  eventCategoryProp?: string;
  pageNumber: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

/**
 * analytics SDK 事件（前端 POST 到 /api/analytics/events/batch，
 * 本查询端点与写入端点呼应，结构对齐 SDK 的 AnalyticsContext）。
 */
export interface AnalyticsEventLogListItem {
  id: number;
  receivedAtUtc: string;
  sessionId?: string | null;
  eventType: 'page' | 'track';
  /** track → 事件名；page → 页面路径 */
  eventName: string;
  url?: string;
  referrer?: string | null;
  userAgent?: string;
  /** page 事件的页面标题（冗余一列，便于列表展示） */
  title?: string | null;
  /** 事件完整属性，后端原文保存（存储前可脱敏），前端解析展示 */
  propertiesJson?: string | null;
}

/**
 * 日志查询 Service —— 对接后端 LogQueryController（只读、角色受保护）。
 * 仅用于支持/内控排查；正式审计请使用业务审计日志。
 */
@Injectable({ providedIn: 'root' })
export class LogQueryService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/log-query';

  private buildParams(filter: LogSearchFilter): HttpParams {
    let p = new HttpParams()
      .set('pageNumber', String(filter.pageNumber))
      .set('pageSize', String(filter.pageSize));
    if (filter.fromUtc) p = p.set('fromUtc', filter.fromUtc);
    if (filter.toUtc) p = p.set('toUtc', filter.toUtc);
    if (filter.eventType) p = p.set('eventType', filter.eventType);
    if (filter.eventNameContains) p = p.set('eventNameContains', filter.eventNameContains);
    if (filter.eventTypeProp) p = p.set('eventTypeProp', filter.eventTypeProp);
    if (filter.eventCategoryProp) p = p.set('eventCategoryProp', filter.eventCategoryProp);
    return p;
  }

  /** 查询 analytics SDK 上报的事件（写入端为 /api/analytics/events/batch） */
  searchAnalytics(filter: LogSearchFilter) {
    return this.http.get<PagedResult<AnalyticsEventLogListItem>>(`${this.base}/analytics`, {
      params: this.buildParams(filter),
    });
  }
}
