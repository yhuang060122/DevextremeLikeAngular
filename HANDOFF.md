# HANDOFF — DevextremeLikeDataGrid

> 面向下一个接手者（人 / agent）的交接说明。最近更新：2026-10-06。
> 项目完整介绍见 `README.md`（中英双语）；本文聚焦"当前状态 + 最近的 Analytics SDK 接入工作"。

---

## 1. 一句话概况

Devextreme 风格数据网格 + 埋点 SDK + Trace-Session-Id 的全栈演示仓库：
前端 Angular 22（Zoneless）· 后端 .NET 10 Minimal API（SQLite）· 日志 Serilog。
近期新增一个**独立的 jQuery 待办应用**（`jquery-todo/`），把仓库自带的框架无关
Analytics SDK（`src/analytics`）打包成浏览器脚本并在原生 JS 环境接入使用。

## 2. 仓库状态（截至本次交接）

- 分支 `master`，与 `origin/master` 同步，最后提交 `816020d`
  （feat: add standalone jQuery todo app with AJAX reporting）。
- **未提交变更**（本次工作产物，待确认后 commit）：

  | 文件 | 状态 | 说明 |
  |---|---|---|
  | `jquery-todo/index.html` | M | 脚本加载顺序 + `data-analytics` 属性 |
  | `jquery-todo/js/api.js` | M | 连接状态 + `request()` 封装（Api Call 埋点） |
  | `jquery-todo/js/app.js` | M | 业务事件改走 SDK `track()` |
  | `jquery-todo/js/analytics-sdk.js` | 新增 | **esbuild 打包产物**（IIFE，全局 `AnalyticsSDK`） |
  | `jquery-todo/js/analytics.js` | 新增 | SDK 宿主集成（会话 id / 实例 / 探针） |
  | `src/analytics/bundle-entry.ts` | 新增 | SDK 浏览器打包入口（re-export） |

- `server/Program.cs` 的 CORS 放开（`AllowAnyOrigin`）已随 `816020d` 提交；
  `analytics.db`、`dist/` 均在 `.gitignore`，不会误提交。

## 3. Analytics SDK：从源码到浏览器产物

- **源码**：`src/analytics/*.ts`，框架无关、零依赖（fetch + AbortController + TextEncoder）。
  核心 API：`Analytics`（track/page/批量队列/keepalive）、`PageTracker`、`ClickTracker`。
- **打包入口**：`src/analytics/bundle-entry.ts`（re-export 公共 API；加入后不影响 Angular 构建，`tsc --noEmit` 已验证）。
- **打包命令**（修改 SDK 源码后需重建产物）：

  ```bash
  npx esbuild src/analytics/bundle-entry.ts --bundle --format=iife \
    --global-name=AnalyticsSDK --target=es2020 \
    --outfile=jquery-todo/js/analytics-sdk.js
  ```

- **产物**：`jquery-todo/js/analytics-sdk.js`（~20KB，IIFE，全局名 `AnalyticsSDK`，
  通过 `<script>` 加载，可在任意宿主使用）。

## 4. jquery-todo 里如何使用 Analytics

**脚本加载顺序**（`index.html`，顺序敏感）：

```
jquery CDN → js/analytics-sdk.js → js/api.js → js/analytics.js → js/app.js
```

**职责分工**：

| 文件 | 职责 |
|---|---|
| `js/analytics-sdk.js` | SDK 产物（全局 `AnalyticsSDK`） |
| `js/api.js` | `TodoApi.getServerStatus()`（GET /api/test/events 探活）；`request()` 通用封装，每次业务 API 完成时上报 `Api Call` 事件；**循环防护**：跳过 `/api/analytics/events/` 端点自身 |
| `js/analytics.js` | 播种会话 id（`sessionStorage['analytics.session']`，SDK 只读不写）；创建 `new AnalyticsSDK.Analytics({ endpoint, batchSize:5, flushInterval:1500, debug:true, probes:[PageTracker, ClickTracker] })` 并 `start()`；暴露 `window.todoAnalytics` |
| `js/app.js` | 业务事件经 `window.todoAnalytics.track('todo_add' / 'todo_toggle' / 'todo_delete' / 'todo_clear_completed', props)`；勾选框/删除按钮渲染时加 `data-analytics` 属性 |

**四类埋点**（事件模型与 Angular 接入一致，后端 `/logs` 页可查）：

| 类型 | 事件名 | 触发 |
|---|---|---|
| 页面浏览 | `page` | PageTracker：加载 / 切后台 / 卸载（含停留时长） |
| 元素点击 | `Element Clicked` | ClickTracker：点击带 `data-analytics` 的元素（含 element/id/name/type/label/tag/cssClass） |
| 业务事件 | `todo_*` | app.js 动作 |
| API 调用 | `Api Call` | api.js `request()`：method/url/status/ok/durationMs/页面上下文 |

**离线降级**：后端不可达时状态栏变黄（`api.js` 探活失败），业务事件跳过上报，
SDK 队列尝试发送失败后静默丢弃，应用功能与 localStorage 完全不受影响。

## 5. 运行方式

```bash
cd server && dotnet run              # 后端 http://localhost:5080（Scalar UI: /scalar/v1）
# 直接浏览器打开 jquery-todo/index.html（file:// 即可，CORS 已放开）；
# 或静态服务：cd jquery-todo && python -m http.server 8000
```

后端地址可用页面加载前的 `window.TODO_API_BASE` 覆盖。

## 6. 验证手段（接手后照做一遍）

1. **语法**：`node --check jquery-todo/js/*.js`
2. **类型**：`npx tsc --noEmit -p tsconfig.app.json`（确认 bundle-entry 不破坏 Angular 工程）
3. **端到端**（jsdom + 真后端，共 23 项断言，位于会话工作区
   `tmp/todo-sdk-test.js`，未入库）：先 `dotnet run` 起后端，再 `node tmp/todo-sdk-test.js`。
   覆盖：离线降级、在线状态、页面事件、`todo_*` 业务事件、`Element Clicked`、
   `Api Call`（逐字段校验后端入库）。
   - **注意 1**：jsdom 默认无 `fetch`（SDK 用 fetch 上报），测试脚本已注入
     `window.fetch` polyfill；
   - **注意 2**：后端刚启动后的第一个请求偶发瞬时竞态（状态栏短暂不亮），
     复跑即稳定，非应用缺陷。

## 7. 已知边界与后续建议

- 任务数据目前只存 localStorage，未做后端持久化（如需：给 server 加 `/api/todos` CRUD）。
- 状态栏无"重试连接"按钮；`flushInterval`/`batchSize` 是 demo 友好小值，生产可调大。
- SDK 的 sessionId 走 `analytics.session`（jquery-todo 独立于 Angular 的 Trace-Session-Id；
  两者各自生成，若要跨应用关联可让 `sessionIdProvider` 返回同一 id）。
- 多实例部署时 `InMemoryTraceSessionStore` 需换共享存储（见 README Trace-Session-Id 一节）。
- `server/Program.cs` CORS 为 demo 级 `AllowAnyOrigin`，上线前应收紧为明确 Origins。
