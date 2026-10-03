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

/// <summary>分页结果：对齐前端 PagedResult&lt;T&gt;。</summary>
public sealed class PagedResult<T>
{
    public List<T> Items { get; set; } = [];

    public int Total { get; set; }

    public int PageNumber { get; set; }

    public int PageSize { get; set; }

    public int TotalPages { get; set; }
}
