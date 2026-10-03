namespace AnalyticsServer.TraceSession;

/// <summary>Trace-Session-Id 配置（对应 appsettings.json 的 "TraceSession" 节）。</summary>
public sealed class TraceSessionOptions
{
    /// <summary>登录成功后签发的 Trace-Session-Id 的 TTL（分钟），应与 access token 有效期对齐。</summary>
    public int TtlMinutes { get; set; } = 60;

    /// <summary>登录端点路径：只有该路径的 200 响应会触发签发 Trace-Session-Id。</summary>
    public string LoginPath { get; set; } = "/api/auth/login";
}
