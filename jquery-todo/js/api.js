/* ============================================================
   jQuery Todo — 后端连接模块
   依赖 jQuery 3.x；在 analytics.js 之前加载。

   后端地址默认 http://localhost:5080（仓库 server 目录 dotnet run）。
   如需覆盖，在加载本文件前设置全局变量 TODO_API_BASE，例如：
     <script>window.TODO_API_BASE = "https://api.example.com";</script>

   职责：
     TodoApi.getServerStatus() → GET /api/test/events
                                  （连接探活 + 服务器时间 + 事件总数）
     request() 封装：每次业务 API 调用完成后，经 Analytics SDK 上报一条
     "Api Call" 事件（与 Angular 侧 api-call-tracker.interceptor 语义一致）：
     method / url / apiEndpoint / apiVersion / status / ok / durationMs
     + 失败字段 error_code / error_message / error_track_trace（成功为 null）。

   循环防护：不上报 analytics 上报端点自身（/api/analytics/events/），
   避免 "上报 Api Call → 新事件 → 再上报" 的自激循环。
   ============================================================ */
(function (window, $) {
  "use strict";

  var BASE_URL = window.TODO_API_BASE || "http://localhost:5080";

  /** 从请求 URL 提取 API 端点：去掉 query string / hash 的路径。 */
  function readApiEndpoint(url) {
    try {
      return new URL(url, "http://localhost").pathname;
    } catch (e) {
      return String(url).split(/[?#]/)[0] || url;
    }
  }

  /** 从 URL 提取 API 版本号（/api/v1/xxx 或 /api/v1.2/xxx）；无版本段返回 null。 */
  function readApiVersion(url) {
    var m = String(url).match(/\/api\/v(\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
  }

  /** 截断超长文本（错误体可能很长），避免整个进入事件。 */
  function clamp(text, max) {
    max = max || 200;
    text = String(text);
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  /** 失败时收集"错误追踪信息"：优先后端错误响应体，其次 statusText。 */
  function readErrorTrackTrace(jqXHR) {
    if (jqXHR && jqXHR.responseText) {
      var body = String(jqXHR.responseText).trim();
      if (body) return clamp(body);
    }
    if (jqXHR && jqXHR.statusText) return clamp(jqXHR.statusText);
    return null;
  }

  function trackApiCall(method, url, outcome) {
    // 循环防护：analytics 上报端点自身不埋点（SDK 上报走原生 fetch 不经
    // 本模块，此判断是双保险）
    if (url.indexOf("/api/analytics/events/") !== -1) return;

    if (!window.todoAnalytics || typeof window.todoAnalytics.track !== "function") {
      return;
    }

    window.todoAnalytics.track("Api Call", $.extend({
      pagePath: window.location.pathname,
      pageUrl: window.location.href,
      pageTitle: window.document.title,
      method: method,
      url: url,
      apiEndpoint: readApiEndpoint(url),
      apiVersion: readApiVersion(url),
      // 分析层分类：type=api（API 调用），category=api（接口域）
      eventType: "api",
      eventCategory: "api",
      status: outcome.status,
      ok: outcome.ok,
      durationMs: outcome.durationMs,
      // 错误字段：成功时为 null，schema 不随成败变化
      error_code: outcome.error_code == null ? null : outcome.error_code,
      error_message: outcome.error_message == null ? null : outcome.error_message,
      error_track_trace: outcome.error_track_trace == null ? null : outcome.error_track_trace
    }, outcome));
  }

  /**
   * 通用 API 请求封装：发请求并在完成（成功/失败）后上报 "Api Call" 埋点。
   * 返回 jQuery jqXHR（可继续 .done/.fail 链式调用）。
   */
  function request(options) {
    var started = performance.now();
    var method = options.method || "GET";
    var url = options.url;

    return $.ajax(options)
      .done(function (data, textStatus, jqXHR) {
        trackApiCall(method, url, {
          status: jqXHR.status,
          ok: true,
          durationMs: Math.round(performance.now() - started)
        });
      })
      .fail(function (jqXHR, textStatus, errorThrown) {
        var errorMessage = textStatus + (errorThrown ? ": " + errorThrown : "");
        trackApiCall(method, url, {
          status: jqXHR.status,
          ok: false,
          error: errorMessage,
          error_code: jqXHR.status,
          error_message: errorMessage,
          error_track_trace: readErrorTrackTrace(jqXHR),
          durationMs: Math.round(performance.now() - started)
        });
      });
  }

  var api = {
    baseUrl: BASE_URL,

    /**
     * GET /api/test/events
     * 成功 resolve { serverTimeUtc, total, items }；失败 reject(jqXHR)
     */
    getServerStatus: function () {
      return request({
        url: BASE_URL + "/api/test/events",
        method: "GET",
        dataType: "json",
        timeout: 4000
      });
    }
  };

  window.TodoApi = api;
})(window, jQuery);
