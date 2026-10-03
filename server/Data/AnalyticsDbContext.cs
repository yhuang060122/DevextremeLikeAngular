using Microsoft.EntityFrameworkCore;

namespace AnalyticsServer.Data;

/// <summary>
/// analytics 事件表（方案一：直写数据库，无队列/Worker）。
/// 结构对齐前端 src/app/logs/log-query.service.ts 的 AnalyticsEventLogListItem。
/// </summary>
public class AnalyticsEvent
{
    public long Id { get; set; }

    /// <summary>服务端收到时间（浏览器时间可被篡改，统一以收到为准）。</summary>
    public DateTime ReceivedAtUtc { get; set; }

    public string? SessionId { get; set; }

    /// <summary>track / page</summary>
    public string EventType { get; set; } = "";

    /// <summary>track → 事件名；page → 页面路径</summary>
    public string EventName { get; set; } = "";

    public string? Url { get; set; }

    public string? Referrer { get; set; }

    public string? UserAgent { get; set; }

    public string? Title { get; set; }

    /// <summary>事件完整属性 JSON（接收时原文序列化保存）。</summary>
    public string? PropertiesJson { get; set; }
}

public class AnalyticsDbContext(DbContextOptions<AnalyticsDbContext> options) : DbContext(options)
{
    public DbSet<AnalyticsEvent> AnalyticsEvents => Set<AnalyticsEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AnalyticsEvent>(e =>
        {
            e.ToTable("analytics_events");
            e.HasIndex(x => new { x.EventType, x.EventName });
            e.HasIndex(x => x.ReceivedAtUtc);
        });
    }
}
