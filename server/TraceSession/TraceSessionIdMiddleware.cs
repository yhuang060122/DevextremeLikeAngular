using System.Security.Claims;
using Microsoft.Extensions.Options;
using Serilog.Context;
using Serilog.Core;
using Serilog.Events;

namespace AnalyticsServer.TraceSession;

/// <summary>
/// 登录会话级追踪 ID 中间件（方案 A：后端主控）。
///
/// 职责（对齐 handoff）：
/// 1. 入站请求带 X-Trace-Session-Id → 把值推入 Serilog 日志作用域，
///    本请求内所有日志都带 TraceSessionId 字段，支持按 id 检索一次登录会话的全部日志；
/// 2. 入站请求不带 → 先放行；响应完成后若命中「登录成功」（POST {LoginPath} 且 200），
///    生成新的 Guid 写入存储（TTL 与 access token 有效期对齐）并附加到响应头；
/// 3. 校验规则：即使入站 Trace-Session-Id 无效 / 被篡改也不拒绝请求（仅日志用途，非鉴权）。
///    缺失 / 无效时日志属性 TraceSessionId 为 null。
///
/// 中间件顺序（Program.cs）：Logging → TraceSessionIdMiddleware → Authentication → Routing。
/// </summary>
public sealed class TraceSessionIdMiddleware
{
    public const string HeaderName = "X-Trace-Session-Id";

    private readonly RequestDelegate _next;
    private readonly ITraceSessionStore _store;
    private readonly TraceSessionOptions _options;
    private readonly ILogger<TraceSessionIdMiddleware> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public TraceSessionIdMiddleware(
        RequestDelegate next,
        ITraceSessionStore store,
        IOptions<TraceSessionOptions> options,
        ILogger<TraceSessionIdMiddleware> logger,
        IHttpContextAccessor httpContextAccessor)
    {
        _next = next;
        _store = store;
        _options = options.Value;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = Guid.NewGuid().ToString();
        var traceSessionId = context.Request.Headers.TryGetValue(HeaderName, out var incomingId)
            ? incomingId.ToString()
            : null;

        // 作用域覆盖整个请求：所有日志统一携带 RequestId / TraceSessionId；
        // UserId 用写时求值的 enricher（登录端点在本请求内设置身份，写日志时才能读到）。
        using (LogContext.PushProperty("RequestId", requestId))
        using (LogContext.PushProperty("TraceSessionId", traceSessionId))
        using (LogContext.Push(new HttpContextUserIdEnricher(_httpContextAccessor)))
        {
            // 请求自带会话 id：职责只有「进日志作用域」，无需再签发。
            if (traceSessionId is null)
            {
                // 登录成功签发不能用「_next 之后直接写响应头」：
                // minimal API 的 Results.Ok(...) 会在 _next 内部把响应写出（HasStarted=true），
                // 之后再写头会抛 "Headers are read-only, response has already started"。
                // 因此改为注册 OnStarting 回调——它在响应头真正写出前执行，天然保证未 started，
                // 语义仍与 handoff 一致：仅「登录成功」（登录路径 + 200）签发。
                context.Response.OnStarting(async () =>
                {
                    if (!context.Request.Path.Equals(_options.LoginPath, StringComparison.OrdinalIgnoreCase))
                    {
                        return;
                    }
                    if (context.Response.StatusCode != StatusCodes.Status200OK)
                    {
                        return;
                    }

                    var newTraceSessionId = Guid.NewGuid().ToString();
                    var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";

                    var ttl = TimeSpan.FromMinutes(Math.Max(1, _options.TtlMinutes));
                    await _store.SetAsync(newTraceSessionId, userId, DateTime.UtcNow.Add(ttl), ttl);

                    context.Response.Headers[HeaderName] = newTraceSessionId;

                    _logger.LogInformation(
                        "Issued new TraceSessionId {TraceSessionId} for user {UserId}, TTL {TtlMinutes} min",
                        newTraceSessionId, userId, _options.TtlMinutes);
                });
            }

            await _next(context);
        }
    }

    /// <summary>写日志时从 HttpContext.User 提取 UserId，保证登录请求自身的日志也能带上。</summary>
    private sealed class HttpContextUserIdEnricher(IHttpContextAccessor accessor) : ILogEventEnricher
    {
        public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
        {
            var userId = accessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.IsNullOrWhiteSpace(userId))
            {
                logEvent.AddPropertyIfAbsent(propertyFactory.CreateProperty("UserId", userId));
            }
        }
    }
}
