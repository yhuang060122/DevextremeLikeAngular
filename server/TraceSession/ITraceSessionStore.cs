namespace AnalyticsServer.TraceSession;

/// <summary>
/// Trace-Session-Id ↔ UserId 映射存储。
///
/// 当前为单实例部署，由内存实现承载；若未来上多实例，可新增共享存储
/// （如 Redis）实现并在 DI 中切换——中间件只依赖本接口，无需改动。
/// 该映射仅用于日志关联，不做任何鉴权。
/// </summary>
public interface ITraceSessionStore
{
    /// <summary>写入映射，TTL 与 access token 有效期对齐；到期后视为会话追踪失效。</summary>
    Task SetAsync(
        string traceSessionId,
        string userId,
        DateTime expiresAtUtc,
        TimeSpan ttl,
        CancellationToken ct = default);

    /// <summary>删除映射（登出时按入站 X-Trace-Session-Id 调用）。</summary>
    Task DeleteAsync(string traceSessionId, CancellationToken ct = default);
}
