
# Project Handoff: Time-Series EAV Search Implementation

## 1. 技术栈与架构概览 (Tech Stack & Architecture)
* **Backend**: .NET 10 Web API (C# 14, Primary Constructors, Records)
* **ORM & Database**: Entity Framework Core 10 + SQL Server
* **Frontend**: Angular v21 (100% Standalone, Zoneless, Signals, `httpResource`)
* **核心数据模型**: 带时间序列维度的 EAV（Entity-Attribute-Value）表 `entity_data`。实体属性（如 `name`, `code`, `description`）以纵向行形式存储（`data_code`），且每条记录带有生效日期 `value_date`。

---

## 2. 核心业务规则与架构决策 (Key Design Decisions)
1. **防历史脏数据误匹配（Point-in-Time Snapshot First）**：
   * 实体属性随 `value_date` 演进（例如基金或实体曾用名变更）。
   * **强约束**：严禁直接在全表跑 `LIKE` 模糊匹配。必须先按 `(entity_id, data_code)` 锁定离基准日（`AsOfDate`，默认今天 `<= Today`）最近的那唯一一条记录（`ROW_NUMBER() = 1`），再在最新快照集上执行关键字匹配。
2. **两阶段查询（Two-Phase Query & Pivot）**：
   * **Phase 1（定位 ID）**：在最新快照集上过滤搜索词，拿到去重后的 `entity_id` 总数与当前页 ID 列表（如 20 条）。
   * **Phase 2（条件聚合行转列 Pivot）**：仅针对当前页的 20 个 `entity_id` 提取属性，通过 `MAX(CASE WHEN ...)` 将纵向 EAV 数据拍平为前端所需的横向 DTO，彻底规避全表 Self-Join 与笛卡尔积内存爆炸。
3. **全链路取消信号穿透（End-to-End Cancellation）**：
   * 前端 `httpResource` 在用户输入变化时自动触发 `AbortSignal` 中断旧请求 $\rightarrow$ 穿透至 .NET 10 Controller 的 `CancellationToken` $\rightarrow$ 传递至 EF Core `CountAsync(ct)` / `ToListAsync(ct)` 立即终止 SQL Server 慢查询。

---

## 3. 数据库层实现 (SQL Server Schema, Indexes & iTVF)

### 3.1 核心复合索引（避免 Sort 开销，实现 Index Seek）
```sql
-- 1. 支撑按 (data_code, entity_id) 快速定位 <= @asOfDate 的最新一条记录
CREATE NONCLUSTERED INDEX IX_entity_data_DataCode_EntityId_ValueDateDesc
ON dbo.entity_data (data_code ASC, entity_id ASC, value_date DESC)
INCLUDE (data_txt_value);

-- 2. 支撑第二阶段按 entity_id 快速拉取对应属性
CREATE NONCLUSTERED INDEX IX_entity_data_EntityId_DataCode_ValueDateDesc
ON dbo.entity_data (entity_id ASC, data_code ASC, value_date DESC)
INCLUDE (data_txt_value, value_data);
```

### 3.2 内联表值函数 (Inline Table-Valued Function, iTVF)
将“按基准日期取最新属性快照”封装为参数化视图（iTVF），供 SQL Server 优化器内联展开并实现谓词下推（Predicate Pushdown）：

```sql
CREATE OR ALTER FUNCTION dbo.fn_GetEntityAttributesAsOf
(
    @asOfDate DATETIME2
)
RETURNS TABLE
AS
RETURN
(
    WITH RankedData AS
    (
        SELECT 
            entity_id,
            data_code,
            value_date,
            data_txt_value,
            ROW_NUMBER() OVER (
                PARTITION BY entity_id, data_code 
                ORDER BY value_date DESC
            ) AS rn
        FROM dbo.entity_data
        WHERE value_date <= @asOfDate
          AND data_code IN ('name', 'code', 'description')
    )
    SELECT 
        entity_id,
        data_code,
        value_date,
        data_txt_value
    FROM RankedData
    WHERE rn = 1
);
```

---

## 4. 后端实现 (.NET 10 + EF Core 10)

### 4.1 实体与契约 DTO (`Models/SearchModels.cs`)
```csharp
namespace MyProject.Api.Models;

// 数据库实体映射
public class EntityData
{
    public int EntityId { get; set; }
    public string DataCode { get; set; } = string.Empty; // 'name', 'code', 'description'
    public DateTime ValueDate { get; set; }
    public string? DataTxtValue { get; set; }
    public decimal? ValueData { get; set; }
}

// 搜索请求参数
public record SearchRequest(
    string? Query,
    DateTime? AsOfDate = null,
    int Page = 1,
    int PageSize = 20
);

// 通用分页响应包装器
public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize
);

// 拍平后的前端展示 DTO
public record EntitySearchDto(
    int EntityId,
    string? Code,
    string? Name,
    string? Description,
    DateTime? LatestValueDate
);
```

### 4.2 EF Core `DbContext` 配置与函数映射 (`Data/AppDbContext.cs`)
```csharp
using Microsoft.EntityFrameworkCore;
using MyProject.Api.Models;

namespace MyProject.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<EntityData> EntityData => Set<EntityData>();

    // 映射 SQL Server 内联表值函数 (iTVF)
    public IQueryable<EntityData> GetEntityAttributesAsOf(DateTime asOfDate)
        => FromExpression(() => GetEntityAttributesAsOf(asOfDate));

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<EntityData>(entity =>
        {
            entity.ToTable("entity_data");
            entity.HasKey(e => new { e.EntityId, e.DataCode, e.ValueDate });

            entity.Property(e => e.EntityId).HasColumnName("entity_id");
            entity.Property(e => e.DataCode).HasColumnName("data_code").HasMaxLength(64);
            entity.Property(e => e.ValueDate).HasColumnName("value_date");
            entity.Property(e => e.DataTxtValue).HasColumnName("data_txt_value");
            entity.Property(e => e.ValueData).HasColumnName("value_data");

            // 复合索引配置（Code-First 场景）
            entity.HasIndex(x => new { x.DataCode, x.EntityId, x.ValueDate })
                  .IsDescending(false, false, true)
                  .IncludeProperties(x => x.DataTxtValue);
        });

        // 绑定 dbo.fn_GetEntityAttributesAsOf
        modelBuilder.HasDbFunction(typeof(AppDbContext).GetMethod(
                nameof(GetEntityAttributesAsOf), [typeof(DateTime)])!)
            .HasName("fn_GetEntityAttributesAsOf")
            .HasSchema("dbo");
    }
}
```

### 4.3 Controller 实现：方案 A（推荐：基于 iTVF 表值函数）
```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyProject.Api.Data;
using MyProject.Api.Models;

namespace MyProject.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EntitiesController(AppDbContext db) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<PagedResult<EntitySearchDto>>> Search(
        [FromQuery] SearchRequest request,
        CancellationToken ct)
    {
        var targetDate = request.AsOfDate?.Date ?? DateTime.Today;

        // 1. 直接查询 iTVF 快照视图（每个 (entity_id, data_code) 已确保唯一且最新）
        var snapshotQuery = db.GetEntityAttributesAsOf(targetDate)
            .AsNoTracking();

        // 2. 第一阶段：关键字过滤并定位去重后的 EntityId
        if (!string.IsNullOrWhiteSpace(request.Query))
        {
            var keyword = request.Query.Trim();
            snapshotQuery = snapshotQuery.Where(x =>
                x.DataTxtValue != null &&
                EF.Functions.Like(x.DataTxtValue, $"%{keyword}%"));
        }

        var distinctEntityIds = snapshotQuery
            .Select(x => x.EntityId)
            .Distinct();

        var totalCount = await distinctEntityIds.CountAsync(ct);
        if (totalCount == 0)
        {
            return Ok(new PagedResult<EntitySearchDto>([], 0, request.Page, request.PageSize));
        }

        var pagedEntityIds = await distinctEntityIds
            .OrderBy(id => id)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        // 3. 第二阶段：针对当前页的 20 个 EntityId 在 SQL 端执行条件聚合 (MAX CASE WHEN) 行转列
        var items = await db.GetEntityAttributesAsOf(targetDate)
            .AsNoTracking()
            .Where(x => pagedEntityIds.Contains(x.EntityId))
            .GroupBy(x => x.EntityId)
            .Select(g => new EntitySearchDto(
                g.Key,
                g.Where(x => x.DataCode == "code").Select(x => x.DataTxtValue).FirstOrDefault(),
                g.Where(x => x.DataCode == "name").Select(x => x.DataTxtValue).FirstOrDefault(),
                g.Where(x => x.DataCode == "description").Select(x => x.DataTxtValue).FirstOrDefault(),
                g.Max(x => x.ValueDate)
            ))
            .ToListAsync(ct);

        return Ok(new PagedResult<EntitySearchDto>(items, totalCount, request.Page, request.PageSize));
    }
}
```

### 4.4 Controller 备选实现：方案 B（纯 LINQ 写法，无需数据库建函数）
如果环境受限无法创建 SQL 函数，可直接使用 EF Core 10 的 `GroupBy` + `FirstOrDefault` 翻译为 `ROW_NUMBER()`：

```csharp
[HttpGet("search-linq")]
public async Task<ActionResult<PagedResult<EntitySearchDto>>> SearchPureLinq(
    [FromQuery] SearchRequest request,
    CancellationToken ct)
{
    var targetDate = request.AsOfDate?.Date ?? DateTime.Today;
    string[] targetCodes = ["name", "code", "description"];

    // 0. 构建最新快照 IQueryable 表达式树
    var latestAttributesQuery = db.EntityData
        .AsNoTracking()
        .Where(x => targetCodes.Contains(x.DataCode) && x.ValueDate <= targetDate)
        .GroupBy(x => new { x.EntityId, x.DataCode })
        .Select(g => g.OrderByDescending(x => x.ValueDate).FirstOrDefault()!);

    // 1. 第一阶段：过滤搜索词并获取分页 EntityId
    var matchedQuery = latestAttributesQuery;
    if (!string.IsNullOrWhiteSpace(request.Query))
    {
        var keyword = request.Query.Trim();
        matchedQuery = matchedQuery.Where(x =>
            x.DataTxtValue != null &&
            EF.Functions.Like(x.DataTxtValue, $"%{keyword}%"));
    }

    var distinctEntityIds = matchedQuery.Select(x => x.EntityId).Distinct();
    var totalCount = await distinctEntityIds.CountAsync(ct);

    if (totalCount == 0)
    {
        return Ok(new PagedResult<EntitySearchDto>([], 0, request.Page, request.PageSize));
    }

    var pagedEntityIds = await distinctEntityIds
        .OrderBy(id => id)
        .Skip((request.Page - 1) * request.PageSize)
        .Take(request.PageSize)
        .ToListAsync(ct);

    // 2. 第二阶段：拉取当前页最多 20 * 3 = 60 行最新属性记录，并在内存拍平为 DTO
    var latestRowsForPage = await db.EntityData
        .AsNoTracking()
        .Where(x => pagedEntityIds.Contains(x.EntityId)
                 && targetCodes.Contains(x.DataCode)
                 && x.ValueDate <= targetDate)
        .GroupBy(x => new { x.EntityId, x.DataCode })
        .Select(g => g.OrderByDescending(x => x.ValueDate).FirstOrDefault()!)
        .ToListAsync(ct);

    var items = pagedEntityIds
        .Select(id =>
        {
            var rows = latestRowsForPage.Where(r => r.EntityId == id).ToList();
            return new EntitySearchDto(
                EntityId: id,
                Code: rows.FirstOrDefault(r => r.DataCode == "code")?.DataTxtValue,
                Name: rows.FirstOrDefault(r => r.DataCode == "name")?.DataTxtValue,
                Description: rows.FirstOrDefault(r => r.DataCode == "description")?.DataTxtValue,
                LatestValueDate: rows.Count > 0 ? rows.Max(r => r.ValueDate) : null
            );
        })
        .ToList();

    return Ok(new PagedResult<EntitySearchDto>(items, totalCount, request.Page, request.PageSize));
}
```

---

## 5. 前端实现 (Angular v21)

### 5.1 类型契约定义 (`models/entity-search.model.ts`)
```typescript
export interface SearchRequest {
  query: string;
  asOfDate?: string;
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface EntitySearchDto {
  entityId: number;
  code: string | null;
  name: string | null;
  description: string | null;
  latestValueDate: string | null;
}
```

### 5.2 响应式搜索组件 (`entity-search.component.ts`)
结合 `signal`、`toObservable` 防抖与 `httpResource` 实现自动请求管理与过期请求中断（`AbortSignal`）：

```typescript
import { Component, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PagedResult, EntitySearchDto } from './models/entity-search.model';

@Component({
  selector: 'app-entity-search',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="search-panel">
      <div class="filters">
        <!-- 关键字输入 -->
        <input 
          type="search" 
          [ngModel]="rawQuery()" 
          (ngModelChange)="onQueryChange($event)"
          placeholder="搜索名称、编码或描述..." 
        />

        <!-- 基准日期选择 (As-Of Date) -->
        <input 
          type="date" 
          [ngModel]="asOfDate()" 
          (ngModelChange)="onDateChange($event)" 
        />
      </div>

      @if (searchResource.isLoading()) {
        <div class="status-loading">正在检索最新快照数据...</div>
      }

      @if (searchResource.error()) {
        <div class="status-error">检索失败，请稍后重试。</div>
      }

      @if (searchResource.value(); as data) {
        <div class="summary">共匹配到 {{ data.totalCount }} 个实体</div>

        <table class="result-table">
          <thead>
            <tr>
              <th>Entity ID</th>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Latest Value Date</th>
            </tr>
          </thead>
          <tbody>
            @for (item of data.items; track item.entityId) {
              <tr>
                <td>{{ item.entityId }}</td>
                <td><strong>{{ item.code ?? '-' }}</strong></td>
                <td>{{ item.name ?? '-' }}</td>
                <td>{{ item.description ?? '-' }}</td>
                <td>{{ item.latestValueDate | date:'yyyy-MM-dd' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty">未找到符合条件的实体</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `
})
export class EntitySearchComponent {
  // 1. 原始状态 Signals
  readonly rawQuery = signal('');
  readonly asOfDate = signal(new Date().toISOString().split('T')[0]); // 默认今天 yyyy-MM-dd
  readonly page = signal(1);
  readonly pageSize = signal(20);

  // 2. 防抖处理（300ms）
  readonly debouncedQuery = toSignal(
    toObservable(this.rawQuery).pipe(
      debounceTime(300),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );

  // 3. 声明式 HTTP 资源：自动追踪 Signal 依赖并在参数变化时 Abort 上一次未完成的请求
  readonly searchResource = httpResource<PagedResult<EntitySearchDto>>(() => ({
    url: '/api/entities/search',
    method: 'GET',
    params: {
      query: this.debouncedQuery().trim(),
      asOfDate: this.asOfDate(),
      page: this.page(),
      pageSize: this.pageSize()
    }
  }));

  onQueryChange(newQuery: string): void {
    this.rawQuery.set(newQuery);
    this.page.set(1);
  }

  onDateChange(newDate: string): void {
    this.asOfDate.set(newDate);
    this.page.set(1);
  }
}
```

---

## 6. 后续演进待办 (Next Steps / TODOs)
- [ ] **EF Core Migration 集成**：将 `fn_GetEntityAttributesAsOf` 的创建脚本纳入项目的 EF Core Migration（`migrationBuilder.Sql(...)`）实现自动化部署。
- [ ] **自定义排序支持**：支持前端按 `code` 或 `name` 的字母序对分页结果进行排序（在第一阶段查询中对目标排序属性的 `data_txt_value` 执行排序后再取分页 ID）。
- [ ] **数值型扩展检索**：如业务需要按 `value_data`（数值列）范围过滤，可在 `fn_GetEntityAttributesAsOf` 返回列中追加 `value_data` 并在 DTO 中映射。



# DevextremeLikeDataGrid

> Devextreme 风格的数据网格 + 埋点日志 + 会话级追踪的全栈演示项目 / A full-stack demo of a Devextreme-style data grid, analytics logging, and session-level tracing.

前端：**Angular 22（Zoneless）** · 后端：**.NET 10 Minimal API** · 数据库：**SQLite** · 日志：**Serilog（结构化 JSON）**

---

## 中文文档

### 简介

本项目是一个前后端分离的全栈演示，重点展示：

- **自定义插槽数据网格**：具名插槽（Toolbar）与泛型插槽（行模板）的运行时行为，类型安全由 strictTemplates 保证；
- **埋点 SDK**：独立于框架的 `src/analytics` 埋点库，支持页面浏览（Router 探针）与元素点击（`data-analytics` 探针），批量上报、页面隐藏/卸载 keepalive 兜底；
- **日志查询页**：查询后端落库的 analytics 事件；
- **Trace-Session-Id**：登录会话级追踪 ID（方案 A：后端主控），用于全链路日志检索——同一个浏览器 tab 登录后的全部请求与埋点事件复用同一个 id。

### 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Angular 22（Zoneless、Signals）、TypeScript、Tailwind CSS 4、Vitest（`@angular/build:unit-test`） |
| 后端 | .NET 10 Minimal API、EF Core（SQLite）、Serilog（Compact JSON 控制台输出）、Scalar OpenAPI UI |
| 追踪 | 自定义 `TraceSessionIdMiddleware` + 内存存储（单实例） |

### 目录结构

```
├─ server/                  # .NET 10 后端（端口 5080）
│  ├─ Program.cs            # Minimal API 入口：Serilog / CORS / 中间件 / 接口
│  ├─ Data/                 # SQLite DbContext（analytics 事件落库）
│  ├─ Models/               # DTO
│  └─ TraceSession/         # Trace-Session-Id：中间件 + 存储 + 配置
├─ src/
│  ├─ analytics/            # 框架无关的埋点 SDK（页面/点击探针、批量上报）
│  ├─ app/
│  │  ├─ analytics/         # Angular 接入（AnalyticsService、API 调用埋点、Router 探针）
│  │  ├─ trace-session/     # Trace-Session-Id 前端服务（Signal）+ 拦截器
│  │  ├─ slots-demo/        # 具名插槽表格演示
│  │  ├─ context-guard-demo/# 泛型插槽上下文保护演示
│  │  ├─ logs/              # 日志查询页（analytics 事件 tab）
│  │  └─ test-page/         # API 测试页（含 Trace-Session-Id demo 登录/登出）
│  └─ tests/                # 全部单元测试（*.spec.ts，Vitest）
├─ jquery-todo/            # 独立 jQuery 3 待办应用（Analytics SDK 浏览器打包用法，见下文）
│  ├─ index.html           # 入口：data-analytics 元素标记 + 脚本加载顺序
│  ├─ css/style.css
│  └─ js/                  # analytics-sdk.js（esbuild 产物）+ api.js + analytics.js + app.js
└─ proxy.conf.json          # ng serve 把 /api 代理到 localhost:5080
```

### 环境要求

- .NET SDK **10.0**
- Node.js **22+**、npm 10

### 快速开始

**1. 启动后端**

```bash
cd server
dotnet run
```

- 服务监听 `http://localhost:5080`
- 接口调试面板（Scalar UI）：<http://localhost:5080/scalar/v1>
- 首次启动自动创建 `server/analytics.db`（SQLite）

**2. 启动前端**

```bash
npm install
npm run start     # 即 ng serve，默认 http://localhost:4200
```

前端 `/api/*` 请求经 `proxy.conf.json` 代理到后端 5080，开发环境同源、无跨域问题。

**3. 浏览器验证**

打开 <http://localhost:4200>：

| 路由 | 内容 |
| --- | --- |
| `/` | 具名插槽表格（Slots Demo） |
| `/context-guard` | 泛型插槽上下文保护演示 |
| `/logs` | 日志查询页（analytics 事件，可按事件类型/名称筛选） |
| `/test` | API 测试页 + **Trace-Session-Id demo 登录/登出** |

### Trace-Session-Id（会话级日志追踪）

方案 A：后端主控，`X-Trace-Session-Id` 头，**仅日志关联用途，不参与鉴权**。

流程：

```
登录成功 POST /api/auth/login（200）
  → TraceSessionIdMiddleware 生成新 Guid，写入存储（TTL 对齐 access token）
  → 通过响应头 X-Trace-Session-Id 下发
前端拦截器捕获该头 → TraceSessionService（Signal，每个 tab 独立）
  → 后续所有业务请求自动附加 X-Trace-Session-Id
后端按入站头把 TraceSessionId 推入 Serilog 日志作用域
  → 按该 id 检索即可拿到一次登录会话的全部日志
登出 POST /api/auth/logout → 按入站头删除映射；关 tab 不发登出 → TTL 兜底过期
```

实现要点：

- 后端：`server/TraceSession/TraceSessionIdMiddleware.cs` + `InMemoryTraceSessionStore`（单实例部署用内存实现，重启即清空映射，仅日志关联用途，可接受）；
- 前端：`src/app/trace-session/`（Service + 拦截器，默认内存存储，可开启 sessionStorage 持久化以支持 F5 续链，切勿用 localStorage）；
- CORS 已 `WithExposedHeaders("X-Trace-Session-Id")`，否则浏览器读不到登录响应头；
- 无效/被篡改的入站 id **不会**导致请求被拒绝，日志中 `TraceSessionId` 为 null；
- 后端日志为结构化 JSON，事件带 `TraceSessionId / RequestId / UserId` 字段；
- 埋点事件的 `sessionId` 即当前 tab 的 Trace-Session-Id（未登录为 null）。

> 注：本仓库无真实 JWT 认证，`/api/auth/login`、`/api/auth/logout` 为 demo 级端点（见 `server/Program.cs`），接入真实认证后 Trace-Session-Id 机制无需改动。

### 后端接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/analytics/events/batch` | 埋点 SDK 批量上报 `{ events: [...] }` |
| GET | `/api/log-query/analytics` | analytics 事件分页查询（时间/类型/名称筛选；另有属性分类筛选 eventTypeProp/eventCategoryProp） |
| GET | `/api/log-query/api-access` 等 | API 日志 tab 的占位 stub |
| GET | `/api/test/events` | 联调测试：服务器时间 + 最近事件 |
| POST | `/api/auth/login` | demo 登录（成功时签发 Trace-Session-Id 响应头） |
| POST | `/api/auth/logout` | demo 登出（删除 Trace-Session-Id 映射） |

### jquery-todo：独立 jQuery 应用中使用 Analytics SDK

`jquery-todo/` 是一个不依赖 Angular 构建链的独立 jQuery 3 待办应用，演示如何把本仓库的
框架无关 Analytics SDK（`src/analytics`）打包成浏览器脚本，并在原生 JS 环境中接入
（页面浏览、元素点击、业务事件、API 调用四类埋点全部走同一 SDK 批量队列，后端
`/logs` 页可查）。

**SDK 打包**（每次修改 `src/analytics/*` 后重建产物 `jquery-todo/js/analytics-sdk.js`）：

```bash
npx esbuild src/analytics/bundle-entry.ts --bundle --format=iife \
  --global-name=AnalyticsSDK --target=es2020 \
  --outfile=jquery-todo/js/analytics-sdk.js
```

**使用方式**：脚本按顺序加载（jquery CDN → SDK 产物 → 业务模块）：

| 文件 | 职责 |
| --- | --- |
| `js/analytics-sdk.js` | esbuild 打包的 SDK 产物（IIFE，全局 `AnalyticsSDK`） |
| `js/api.js` | 后端连接：`getServerStatus()` 探活；`request()` 封装在每次业务 API 完成时自动上报 `Api Call` 埋点（循环防护：跳过 `/api/analytics/events/` 自身） |
| `js/analytics.js` | SDK 宿主集成：播种会话 id（`sessionStorage['analytics.session']`）、创建 `Analytics` 实例（endpoint=后端 batch 接口，注册 PageTracker + ClickTracker 探针）、暴露 `window.todoAnalytics` |
| `js/app.js` | 应用逻辑；业务事件经 `window.todoAnalytics.track('todo_add' / 'todo_toggle' / 'todo_delete' / 'todo_clear_completed', props)` 上报 |

**四类埋点**：

所有事件自动携带**应用元数据** `appName` / `appVersion` / `appEnvironment`（Analytics 实例创建时注入一次，随每个事件落库，用于区分多应用/多环境；Angular 侧 version 为常量、environment 按 hostname 推断，jquery-todo 侧为 demo 值）。

| 类型 | 事件名 | 触发 | 说明 |
| --- | --- | --- | --- |
| 页面浏览 | `page` | 加载 / 切后台 / 卸载 | PageTracker 探针（含停留时长）；eventType=page / category=navigation |
| 元素点击 | `Element Clicked` | 点击带 `data-analytics` 属性的元素 | ClickTracker 探针；eventType=click，category 按 `data-analytics` 值推导（nav-*→navigation、todo-*→task、filter-*→filter、其余→ui） |
| 业务事件 | `todo_*` | 应用动作 | app.js → SDK `track()`；eventType=business / category=task |
| API 调用 | `Api Call` | 每次业务 API 请求完成 | api.js `request()`；eventType=api / category=api；method/url/apiEndpoint/apiVersion/status/ok/durationMs + 失败字段 error_code/error_message/error_track_trace + 页面上下文 |

**运行**：

```bash
cd server && dotnet run          # 后端 5080（dev CORS 已放开，独立页面可直连）
# 直接浏览器打开 jquery-todo/index.html，或：
cd jquery-todo && python -m http.server 8000   # http://localhost:8000
```

后端地址可在页面加载前用 `window.TODO_API_BASE` 覆盖。后端不可达时自动降级：
状态栏变黄提示，任务数据落 localStorage，埋点静默丢弃，应用功能不受影响。

### 测试与构建

```bash
npm test          # 前端单测（Vitest，spec 统一放在 src/tests/）
npm run build     # 前端生产构建（输出 dist/）
cd server && dotnet build   # 后端编译校验
```

---

## English Documentation

### Overview

A full-stack demo focused on:

- **Custom-slot data grid**: named slots (Toolbar) and generic row-template slots, with type safety enforced by Angular strictTemplates;
- **Analytics SDK**: a framework-agnostic library under `src/analytics`, with router page probes and `data-analytics` click probes, batched reporting, and keepalive flush on page hide/unload;
- **Log viewer**: query analytics events persisted by the backend;
- **Trace-Session-Id**: login-session-level tracing ID (Plan A: backend-controlled) for end-to-end log lookup — every API request and analytics event from one browser tab shares the same ID.

### Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | Angular 22 (Zoneless, Signals), TypeScript, Tailwind CSS 4, Vitest (`@angular/build:unit-test`) |
| Backend | .NET 10 Minimal API, EF Core (SQLite), Serilog (compact JSON console), Scalar OpenAPI UI |
| Tracing | Custom `TraceSessionIdMiddleware` + in-memory store (single instance) |

### Project Layout

```
├─ server/                  # .NET 10 backend (port 5080)
│  ├─ Program.cs            # Minimal API entry: Serilog / CORS / middleware / endpoints
│  ├─ Data/                 # SQLite DbContext (analytics events)
│  ├─ Models/               # DTOs
│  └─ TraceSession/         # Trace-Session-Id: middleware + store + options
├─ src/
│  ├─ analytics/            # Framework-agnostic analytics SDK
│  ├─ app/
│  │  ├─ analytics/         # Angular integration (AnalyticsService, API-call tracking, router probe)
│  │  ├─ trace-session/     # Trace-Session-Id frontend service (Signal) + interceptor
│  │  ├─ slots-demo/        # Named-slot grid demo
│  │  ├─ context-guard-demo/# Generic-slot context guard demo
│  │  ├─ logs/              # Log viewer page (analytics events tab)
│  │  └─ test-page/         # API test page (with Trace-Session-Id demo login/logout)
│  └─ tests/                # All unit tests (*.spec.ts, Vitest)
├─ jquery-todo/            # Standalone jQuery 3 todo app (Analytics SDK browser bundling, see below)
│  ├─ index.html           # Entry: data-analytics element markers + script loading order
│  ├─ css/style.css
│  └─ js/                  # analytics-sdk.js (esbuild output) + api.js + analytics.js + app.js
└─ proxy.conf.json          # ng serve proxies /api to localhost:5080
```

### Prerequisites

- .NET SDK **10.0**
- Node.js **22+**, npm 10

### Quick Start

**1. Start the backend**

```bash
cd server
dotnet run
```

- Listens on `http://localhost:5080`
- API explorer (Scalar UI): <http://localhost:5080/scalar/v1>
- Creates `server/analytics.db` (SQLite) on first run

**2. Start the frontend**

```bash
npm install
npm run start     # ng serve → http://localhost:4200
```

`/api/*` requests are proxied to the backend via `proxy.conf.json` (same-origin in dev).

**3. Try it in the browser**

Open <http://localhost:4200>:

| Route | Content |
| --- | --- |
| `/` | Named-slot grid (Slots Demo) |
| `/context-guard` | Generic-slot context guard demo |
| `/logs` | Log viewer (analytics events, filterable) |
| `/test` | API test page + **Trace-Session-Id demo login/logout** |

### Trace-Session-Id (session-level log tracing)

Plan A: backend-controlled. Header `X-Trace-Session-Id`, **logging only, never used for auth**.

Flow:

```
Login success POST /api/auth/login (200)
  → TraceSessionIdMiddleware generates a new Guid, persists mapping (TTL aligned with access token)
  → returned via response header X-Trace-Session-Id
Frontend interceptor captures it → TraceSessionService (Signal, per tab)
  → all subsequent business requests attach X-Trace-Session-Id
Backend pushes the incoming ID into the Serilog scope
  → query logs by this ID to retrieve the whole login-session trail
Logout POST /api/auth/logout → mapping deleted by incoming header; tab closed without logout → TTL cleanup
```

Key points:

- Backend: `server/TraceSession/TraceSessionIdMiddleware.cs` + `InMemoryTraceSessionStore` (single instance; in-memory mapping cleared on restart — log-correlation only, acceptable);
- Frontend: `src/app/trace-session/` (service + interceptor; memory-only by default, optional sessionStorage persistence for F5 survival — never localStorage);
- CORS exposes the header via `WithExposedHeaders("X-Trace-Session-Id")`, otherwise the browser cannot read it from the login response;
- Invalid/tampered incoming IDs never reject a request; `TraceSessionId` is null in logs when missing;
- Backend logs are structured JSON with `TraceSessionId / RequestId / UserId`;
- Analytics event `sessionId` is the current tab's Trace-Session-Id (null before login).

> Note: this repo has no real JWT auth — `/api/auth/login` and `/api/auth/logout` are demo endpoints (see `server/Program.cs`). The Trace-Session-Id mechanism needs no changes once real auth is wired in.

### Backend Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/analytics/events/batch` | Analytics SDK batch upload `{ events: [...] }` |
| GET | `/api/log-query/analytics` | Paginated analytics event query (time/type/name filters; plus property-class filters eventTypeProp/eventCategoryProp) |
| GET | `/api/log-query/api-access` etc. | Placeholder stubs for the API-logs tab |
| GET | `/api/test/events` | Smoke test: server time + recent events |
| POST | `/api/auth/login` | Demo login (issues Trace-Session-Id response header) |
| POST | `/api/auth/logout` | Demo logout (deletes Trace-Session-Id mapping) |

### jquery-todo: using the Analytics SDK from a standalone jQuery app

`jquery-todo/` is a standalone jQuery 3 todo app that does not depend on the Angular
build chain. It demonstrates bundling the framework-agnostic Analytics SDK
(`src/analytics`) into a browser script and wiring it up in plain JS — page views,
element clicks, business events and API calls all flow through the same SDK batch
queue and are queryable in the `/logs` page.

**Bundle the SDK** (re-run after changing `src/analytics/*` to rebuild
`jquery-todo/js/analytics-sdk.js`):

```bash
npx esbuild src/analytics/bundle-entry.ts --bundle --format=iife \
  --global-name=AnalyticsSDK --target=es2020 \
  --outfile=jquery-todo/js/analytics-sdk.js
```

**Usage**: scripts load in order (jQuery CDN → SDK bundle → business modules):

| File | Role |
| --- | --- |
| `js/analytics-sdk.js` | esbuild-bundled SDK (IIFE, global `AnalyticsSDK`) |
| `js/api.js` | Backend connectivity: `getServerStatus()` probe; `request()` wrapper auto-tracks an `Api Call` event per business request (loop guard: skips `/api/analytics/events/` itself) |
| `js/analytics.js` | SDK host integration: seeds session id (`sessionStorage['analytics.session']`), creates the `Analytics` instance (endpoint = backend batch API, PageTracker + ClickTracker probes), exposes `window.todoAnalytics` |
| `js/app.js` | App logic; business events reported via `window.todoAnalytics.track('todo_add' / 'todo_toggle' / 'todo_delete' / 'todo_clear_completed', props)` |

**Event types**:

Every event automatically carries **app metadata** `appName` / `appVersion` / `appEnvironment` (injected once at `Analytics` creation, stored with every event to distinguish apps/environments; Angular injects a constant version and infers environment from hostname, jquery-todo injects demo values).

| Type | Event name | Trigger | Notes |
| --- | --- | --- | --- |
| Page view | `page` | on load / hide / unload | PageTracker probe (incl. dwell time); eventType=page / category=navigation |
| Element click | `Element Clicked` | click on an element with a `data-analytics` attribute | ClickTracker probe; eventType=click, category derived from `data-analytics` value (nav-*→navigation, todo-*→task, filter-*→filter, else→ui) |
| Business | `todo_*` | app actions | app.js → SDK `track()`; eventType=business / category=task |
| API call | `Api Call` | on completion of each business API request | api.js `request()`; eventType=api / category=api; method/url/apiEndpoint/apiVersion/status/ok/durationMs + error fields error_code/error_message/error_track_trace + page context |

**Run**:

```bash
cd server && dotnet run          # backend on 5080 (dev CORS widened, standalone pages may call it directly)
# open jquery-todo/index.html directly in a browser, or:
cd jquery-todo && python -m http.server 8000   # http://localhost:8000
```

The backend base URL can be overridden with `window.TODO_API_BASE` before page load.
When the backend is unreachable the app degrades gracefully: the status bar turns
amber, todos persist in localStorage, analytics events are dropped silently, and
the app keeps working.

### Testing & Build

```bash
npm test          # Frontend unit tests (Vitest; specs live in src/tests/)
npm run build     # Frontend production build (output: dist/)
cd server && dotnet build   # Backend compile check
```
