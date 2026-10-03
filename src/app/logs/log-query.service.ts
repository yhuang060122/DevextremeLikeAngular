import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface LogSearchFilter {
  fromUtc?: string;
  toUtc?: string;
  userId?: string;
  userNameContains?: string;
  pathContains?: string;
  clientSource?: string;
  statusCode?: number;
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

export interface ApiAccessLogListItem {
  id: number;
  createdAtUtc: string;
  userId?: string;
  userName: string;
  httpMethod: string;
  path: string;
  queryString?: string;
  statusCode: number;
  elapsedMs: number;
  clientSource: string;
  sourceHint?: string;
  ipAddress: string;
}

export interface ApiAccessLogDetail extends ApiAccessLogListItem {
  requestBodyPreview?: string;
  userAgent: string;
}

export interface UiBehaviorLogListItem {
  id: number;
  receivedAtUtc: string;
  userId?: string;
  userName?: string;
  eventType: string;
  routeUrl?: string;
  elementId?: string;
  elementText?: string;
  extraJson?: string;
}

export interface CorrelateNearbyResult {
  apiLogs: ApiAccessLogListItem[];
  uiLogs: UiBehaviorLogListItem[];
}

export interface LogPipelineSnapshot {
  snapshotAtUtc: string;
  apiPending: number;
  apiErrors: number;
  apiWorkerStaleSec: number;
  apiLastSuccessAgeSec: number;
  uiPending: number;
  uiErrors: number;
  uiWorkerStaleSec: number;
  uiLastSuccessAgeSec: number;
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
    if (filter.userId) p = p.set('userId', filter.userId);
    if (filter.userNameContains) p = p.set('userNameContains', filter.userNameContains);
    if (filter.pathContains) p = p.set('pathContains', filter.pathContains);
    if (filter.clientSource) p = p.set('clientSource', filter.clientSource);
    if (filter.statusCode) p = p.set('statusCode', String(filter.statusCode));
    return p;
  }

  searchApiAccess(filter: LogSearchFilter) {
    return this.http.get<PagedResult<ApiAccessLogListItem>>(`${this.base}/api-access`, {
      params: this.buildParams(filter),
    });
  }

  getApiDetail(id: number) {
    return this.http.get<ApiAccessLogDetail>(`${this.base}/api-access/${id}`);
  }

  searchUiBehavior(filter: LogSearchFilter) {
    return this.http.get<PagedResult<UiBehaviorLogListItem>>(`${this.base}/ui-behavior`, {
      params: this.buildParams(filter),
    });
  }

  /** 查看某用户在某时刻 ±windowSeconds 内的全部 API + UI 事件，用于核对“点没点按钮、有没有真发请求” */
  correlateNearby(userId: string, anchorUtc: string, windowSeconds = 45) {
    return this.http.get<CorrelateNearbyResult>(`${this.base}/correlate-nearby`, {
      params: new HttpParams()
        .set('userId', userId)
        .set('anchorUtc', anchorUtc)
        .set('windowSeconds', String(windowSeconds)),
    });
  }

  /** 日志后台管道状态（Worker 心跳 / 队列堆积 / 错误计数），仅供运维面板 */
  getPipelineStatus() {
    return this.http.get<LogPipelineSnapshot>(`${this.base}/pipeline-status`);
  }
}
