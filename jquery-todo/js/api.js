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
     "Api Call" 事件（与 Angular 侧 api-call-tracker.interceptor 语义一致：
     method / url / status / ok / durationMs / 页面上下文）。

   循环防护：不上报 analytics 上报端点自身（/api/analytics/events/），
   避免 "上报 Api Call → 新事件 → 再上报" 的自激循环。
   ============================================================ */
(function (window, $) {
  "use strict";

  var BASE_URL = window.TODO_API_BASE || "http://localhost:5080";

  function trackApiCall(method, url, props) {
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
      url: url
    }, props));
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
        trackApiCall(method, url, {
          status: jqXHR.status,
          ok: false,
          error: textStatus + (errorThrown ? ": " + errorThrown : ""),
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
