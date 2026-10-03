using System.Collections.Concurrent;

namespace AnalyticsServer.TraceSession;

/// <summary>
/// 单实例内存实现（当前部署形态：单实例，不涉及多实例数据同步问题）。
///
/// 重启即清空映射——Trace-Session-Id 仅日志关联用途，丢失只影响后续日志
/// 关联与登出清理，可接受；TTL 由写入时的过期时间惰性兜底。
/// </summary>
public sealed class InMemoryTraceSessionStore : ITraceSessionStore
{
    private sealed record Entry(string UserId, DateTime ExpiresAtUtc);

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.OrdinalIgnoreCase);

    public Task SetAsync(
        string traceSessionId,
        string userId,
        DateTime expiresAtUtc,
        TimeSpan ttl,
        CancellationToken ct = default)
    {
        _entries[traceSessionId] = new Entry(userId, expiresAtUtc);

        // 惰性过期清理：仅在写入时顺带清掉已过期条目，防止字典无限增长。
        var now = DateTime.UtcNow;
        foreach (var kv in _entries)
        {
            if (kv.Value.ExpiresAtUtc <= now)
            {
                _entries.TryRemove(kv.Key, out _);
            }
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(string traceSessionId, CancellationToken ct = default)
    {
        _entries.TryRemove(traceSessionId, out _);
        return Task.CompletedTask;
    }
}
