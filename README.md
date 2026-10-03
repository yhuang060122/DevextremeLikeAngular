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

- 后端：`server/TraceSession/TraceSessionIdMiddleware.cs` + `ITraceSessionStore`（当前单实例用内存实现；若多实例部署，新增共享存储实现并在 DI 切换即可）；
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
| GET | `/api/log-query/analytics` | analytics 事件分页查询（时间/类型/名称筛选） |
| GET | `/api/log-query/api-access` 等 | API 日志 tab 的占位 stub |
| GET | `/api/test/events` | 联调测试：服务器时间 + 最近事件 |
| POST | `/api/auth/login` | demo 登录（成功时签发 Trace-Session-Id 响应头） |
| POST | `/api/auth/logout` | demo 登出（删除 Trace-Session-Id 映射） |

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

- Backend: `server/TraceSession/TraceSessionIdMiddleware.cs` + `ITraceSessionStore` (in-memory for single instance; swap to a shared store when going multi-instance);
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
| GET | `/api/log-query/analytics` | Paginated analytics event query (time/type/name filters) |
| GET | `/api/log-query/api-access` etc. | Placeholder stubs for the API-logs tab |
| GET | `/api/test/events` | Smoke test: server time + recent events |
| POST | `/api/auth/login` | Demo login (issues Trace-Session-Id response header) |
| POST | `/api/auth/logout` | Demo logout (deletes Trace-Session-Id mapping) |

### Testing & Build

```bash
npm test          # Frontend unit tests (Vitest; specs live in src/tests/)
npm run build     # Frontend production build (output: dist/)
cd server && dotnet build   # Backend compile check
```
