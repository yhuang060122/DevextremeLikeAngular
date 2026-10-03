using System.Text.Json;
using AnalyticsServer.Data;
using AnalyticsServer.Models;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

// ============================================================
// 简单 analytics 后端（方案一：直写 SQLite，无队列 / Worker）
//
// 前端配套：
//   - SDK 上报   → POST /api/analytics/events/batch
//   - /logs 查询 → GET  /api/log-query/analytics
//   - /logs 的 API 日志 tab 目前没有真实数据源，以下接口为
//     “让页面不报错”的最小 stub，后续接入真实 API 日志即可替换。
//
// 接口调试：启动后访问 http://localhost:5080/scalar/v1（Scalar UI）
// ============================================================

var builder = WebApplication.CreateBuilder(args);

// 固定端口，配合前端 ng serve 的 proxy.conf.json（/api → localhost:5080）
builder.WebHost.UseUrls("http://localhost:5080");

var dbPath = Path.Combine(builder.Environment.ContentRootPath, "analytics.db");
builder.Services.AddDbContext<AnalyticsDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// 允许 Angular dev server 跨域（若走前端 proxy 则同源，此配置仅为直连场景兜底）
builder.Services.AddCors(options =>
    options.AddPolicy("dev", policy => policy
        .WithOrigins("http://localhost:4200")
        .AllowAnyHeader()
        .AllowAnyMethod()));

// OpenAPI 文档（Scalar UI 依赖）
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseCors("dev");

// Scalar API 调试面板：http://localhost:5080/scalar/v1
app.MapScalarApiReference();
app.MapOpenApi();

// 根路径直接跳到 Scalar 面板
app.MapGet("/", () => Results.Redirect("/scalar/v1"));

// 启动时自动建库（demo 级：不引入 EF 迁移；模型变更后删除 analytics.db 即可重建）
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AnalyticsDbContext>();
    await db.Database.EnsureCreatedAsync();
}

// ------------------------------------------------------------
// Analytics SDK 上报：接收 { events: [...] }，直写数据库
// ------------------------------------------------------------
app.MapPost("/api/analytics/events/batch", async (AnalyticsBatchPayload payload, AnalyticsDbContext db) =>
{
    if (payload.Events.Count == 0)
    {
        return Results.NoContent();
    }

    var receivedAt = DateTime.UtcNow;

    var rows = payload.Events.Select(e =>
    {
        // System.Text.Json 会把 object? 值反序列化为 JsonElement，
        // 不能直接用 is string 判断，统一走字符串提取。
        var properties = e.Event.Properties ?? new Dictionary<string, object?>();

        return new AnalyticsEvent
        {
            ReceivedAtUtc = receivedAt,
            SessionId = e.SessionId,
            EventType = e.Event.Type,
            EventName = e.Event.Name,
            Url = e.Url,
            Referrer = e.Referrer,
            UserAgent = e.UserAgent,
            Title = ExtractString(properties, "title"),
            PropertiesJson = JsonSerializer.Serialize(properties),
        };
    }).ToList();

    db.AnalyticsEvents.AddRange(rows);
    await db.SaveChangesAsync();

    return Results.Ok(new { received = rows.Count });
});

/// <summary>从反序列化后的属性字典中安全提取字符串值（兼容 JsonElement）。</summary>
static string? ExtractString(Dictionary<string, object?> props, string key)
{
    if (!props.TryGetValue(key, out var value) || value is null) return null;

    if (value is string s)
    {
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }

    if (value is JsonElement element && element.ValueKind == JsonValueKind.String)
    {
        return element.GetString();
    }

    return null;
}

// ------------------------------------------------------------
// /logs 页面 Analytics tab：分页 + 筛选查询
// ------------------------------------------------------------
app.MapGet("/api/log-query/analytics", async (
    AnalyticsDbContext db,
    string? fromUtc,
    string? toUtc,
    string? eventType,
    string? eventNameContains,
    int pageNumber = 1,
    int pageSize = 25) =>
{
    pageNumber = Math.Max(1, pageNumber);
    pageSize = Math.Clamp(pageSize, 1, 200);

    var query = db.AnalyticsEvents.AsNoTracking();

    if (DateTime.TryParse(fromUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var from))
    {
        query = query.Where(x => x.ReceivedAtUtc >= from);
    }
    if (DateTime.TryParse(toUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal, out var to))
    {
        query = query.Where(x => x.ReceivedAtUtc <= to);
    }
    if (!string.IsNullOrWhiteSpace(eventType))
    {
        query = query.Where(x => x.EventType == eventType);
    }
    if (!string.IsNullOrWhiteSpace(eventNameContains))
    {
        query = query.Where(x => x.EventName.Contains(eventNameContains));
    }

    var total = await query.CountAsync();

    var items = await query
        .OrderByDescending(x => x.ReceivedAtUtc)
        .ThenByDescending(x => x.Id)
        .Skip((pageNumber - 1) * pageSize)
        .Take(pageSize)
        .Select(x => new AnalyticsEventLogListItem
        {
            Id = x.Id,
            // SQLite 读出 Kind=Unspecified，显式标为 UTC 再输出 "o"，保证带 Z
            ReceivedAtUtc = DateTime.SpecifyKind(x.ReceivedAtUtc, DateTimeKind.Utc).ToString("o"),
            SessionId = x.SessionId,
            EventType = x.EventType,
            EventName = x.EventName,
            Url = x.Url,
            Referrer = x.Referrer,
            UserAgent = x.UserAgent,
            Title = x.Title,
            PropertiesJson = x.PropertiesJson,
        })
        .ToListAsync();

    return Results.Ok(new PagedResult<AnalyticsEventLogListItem>
    {
        Items = items,
        Total = total,
        PageNumber = pageNumber,
        PageSize = pageSize,
        TotalPages = (int)Math.Ceiling(total / (double)pageSize),
    });
});

// ------------------------------------------------------------
// 测试 API：前端 /test 页面（search 按钮）调用，
// 返回服务器时间 + 最近 50 条 analytics 事件 + 总数
// ------------------------------------------------------------
app.MapGet("/api/test/events", async (AnalyticsDbContext db) =>
{
    var items = await db.AnalyticsEvents
        .AsNoTracking()
        .OrderByDescending(x => x.ReceivedAtUtc)
        .ThenByDescending(x => x.Id)
        .Take(50)
        .Select(x => new
        {
            x.Id,
            ReceivedAtUtc = DateTime.SpecifyKind(x.ReceivedAtUtc, DateTimeKind.Utc).ToString("o"),
            x.EventType,
            x.EventName,
            x.SessionId,
            x.Title,
        })
        .ToListAsync();

    return Results.Ok(new
    {
        serverTimeUtc = DateTime.UtcNow.ToString("o"),
        total = await db.AnalyticsEvents.CountAsync(),
        items,
    });
});

// ------------------------------------------------------------
// Stub：/logs 页面 API 日志 tab 暂无真实数据源（返回空/健康态）
// ------------------------------------------------------------
app.MapGet("/api/log-query/api-access", () =>
    Results.Ok(new PagedResult<object> { Total = 0, PageNumber = 1, PageSize = 25, TotalPages = 0 }));

app.MapGet("/api/log-query/api-access/{id:long}", (long id) =>
    Results.NotFound());

app.MapGet("/api/log-query/correlate-nearby", () =>
    Results.Ok(new { apiLogs = Array.Empty<object>() }));

app.MapGet("/api/log-query/pipeline-status", () =>
    Results.Ok(new
    {
        snapshotAtUtc = DateTime.UtcNow.ToString("o"),
        apiPending = 0,
        apiErrors = 0,
        apiWorkerStaleSec = 0,
        apiLastSuccessAgeSec = 0,
    }));

app.Run();
