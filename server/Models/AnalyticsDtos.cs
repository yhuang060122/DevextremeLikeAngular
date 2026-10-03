namespace AnalyticsServer.Models;

/// <summary>接收体：前端 SDK POST 的 { events: [...] }，结构对齐 AnalyticsContext。</summary>
public sealed class AnalyticsBatchPayload
{
    public List<AnalyticsEventPayload> Events { get; set; } = [];
}

public sealed class AnalyticsEventPayload
{
    public string? SessionId { get; set; }

    public string? Url { get; set; }

    public string? Referrer { get; set; }

    public string? UserAgent { get; set; }

    public AnalyticsInnerEvent Event { get; set; } = new();
}

public sealed class AnalyticsInnerEvent
{
    public string Type { get; set; } = "";

    public string Name { get; set; } = "";

    public Dictionary<string, object?>? Properties { get; set; }
}

/// <summary>查询列表项：对齐前端 AnalyticsEventLogListItem。</summary>
public sealed class AnalyticsEventLogListItem
{
    public long Id { get; set; }

    public string ReceivedAtUtc { get; set; } = "";

    public string? SessionId { get; set; }

    public string EventType { get; set; } = "";

    public string EventName { get; set; } = "";

    public string? Url { get; set; }

    public string? Referrer { get; set; }

    public string? UserAgent { get; set; }

    public string? Title { get; set; }

    public string? PropertiesJson { get; set; }
}

// ------------------------------------------------------------
// Demo 级登录 / 登出 DTO（仅为演示 Trace-Session-Id 全链路。
// 真实系统请替换为 JWT 认证 DTO；X-Trace-Session-Id 只做日志关联，不做鉴权）
// ------------------------------------------------------------

/// <summary>Demo 登录请求体。</summary>
public sealed record LoginRequest(string Username, string Password);

/// <summary>Demo 登录响应：Token 为占位（非真实 JWT），Trace-Session-Id 由响应头下发。</summary>
public sealed record LoginResponse(string Token, string UserId);

/// <summary>Demo 登出响应：返回本次按入站头删除的 Trace-Session-Id。</summary>
public sealed record LogoutResponse(string? TraceSessionId, bool Deleted);

/// <summary>分页结果：对齐前端 PagedResult&lt;T&gt;。</summary>
public sealed class PagedResult<T>
{
    public List<T> Items { get; set; } = [];

    public int Total { get; set; }

    public int PageNumber { get; set; }

    public int PageSize { get; set; }

    public int TotalPages { get; set; }
}
