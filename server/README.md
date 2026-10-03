# AnalyticsServer

简单 analytics 后端（方案一：直写 SQLite，无队列 / Worker）。供前端
`devextreme-like-data-grid` 的 analytics SDK 上报与 `/logs` 页面查询。

## 运行

```bash
dotnet run
```

- 监听：`http://localhost:5080`（固定端口，配合前端 `proxy.conf.json` 的 `/api` 转发）
- 数据库：首次启动自动创建 `analytics.db`（`EnsureCreated`，无 EF 迁移；
  模型变更后删除该文件重启即可重建）
- 端口被占用时：修改 `server/Program.cs` 的 `UseUrls` 与前端
  `proxy.conf.json` 的 `target` 保持一致

## 接口调试（Scalar）

启动后访问 **http://localhost:5080/** 会自动跳到
**http://localhost:5080/scalar/v1**（根路径 302 重定向）：图形化查看
全部接口、在线调试（填参数发请求、看响应），OpenAPI 文档源为
`/openapi/v1.json`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/analytics/events/batch` | 接收 SDK 上报 `{ events: [...] }`，批量入库 |
| GET | `/api/log-query/analytics` | 分页 + 筛选查询（`fromUtc/toUtc/eventType/eventNameContains/pageNumber/pageSize`） |
| GET | `/api/test/events` | 测试 API：服务器时间 + 最近 50 条事件 + 总数（前端 `/test` 页面使用） |
| GET | `/api/log-query/api-access` | **stub**：API 访问日志暂无数据源，返回空分页（仅让页面不报错） |
| GET | `/api/log-query/api-access/{id}` | **stub**：返回 404 |
| GET | `/api/log-query/correlate-nearby` | **stub**：返回 `{ apiLogs: [] }` |
| GET | `/api/log-query/pipeline-status` | **stub**：返回健康快照 |

`/api/log-query/*` 的 stub 接口对应前端 `/logs` 页面中「API 访问日志」
tab，接入真实服务端 API 日志后可替换。

## 前端联调

1. 启动本后端：`dotnet run`
2. 启动前端：`npm start`（`ng serve` 通过 `proxy.conf.json` 将 `/api`
   代理到 `http://localhost:5080`）
3. 打开 `http://localhost:4200/logs` → 切到「Analytics 事件」tab

上报示例见 `test-payload.json`：

```bash
curl -X POST http://localhost:5080/api/analytics/events/batch \
  -H "Content-Type: application/json" \
  --data-binary "@test-payload.json"
```
