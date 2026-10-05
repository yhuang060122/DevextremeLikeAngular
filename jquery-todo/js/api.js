/* ============================================================
   jQuery Todo — AJAX 模块（对接本仓库 .NET 后端）
   依赖 jQuery 3.x；在 app.js 之前加载。

   后端地址默认 http://localhost:5080（仓库 server 目录 dotnet run）。
   如需覆盖，在加载本文件前设置全局变量 TODO_API_BASE，例如：
     <script>window.TODO_API_BASE = "https://api.example.com";</script>

   两个调用：
     TodoApi.getServerStatus()  → GET  /api/test/events   （连接探活 + 服务器信息）
     TodoApi.track(type, name, properties)
                                 → POST /api/analytics/events/batch （埋点上报）
   均为 jQuery Promise，超时 4 秒，失败由调用方处理。
   ============================================================ */
(function (window, $) {
  "use strict";

  var BASE_URL = window.TODO_API_BASE || "http://localhost:5080";

  // 每个浏览器 tab 一个会话 id（sessionStorage 持久化，F5 续用；
  // 与仓库 trace-session 约定一致：不写 localStorage）。
  var SESSION_KEY = "jquery-todo.sessionId";
  var sessionId = (function () {
    try {
      var existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var id = "todo-" + Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (e) {
      return "todo-" + Date.now().toString(36);
    }
  })();

  var api = {
    baseUrl: BASE_URL,

    /**
     * GET /api/test/events
     * 成功 resolve { serverTimeUtc, total, items }；失败 reject(jqXHR)
     */
    getServerStatus: function () {
      return $.ajax({
        url: BASE_URL + "/api/test/events",
        method: "GET",
        dataType: "json",
        timeout: 4000
      });
    },

    /**
     * POST /api/analytics/events/batch —— 上报一条埋点事件
     * @param {string} type  事件类型，默认 "todo_action"
     * @param {string} name  事件名，如 "todo_add"
     * @param {Object} properties 附加属性
     */
    track: function (type, name, properties) {
      var payload = {
        events: [
          {
            sessionId: sessionId,
            url: window.location.href,
            referrer: window.document.referrer || null,
            userAgent: window.navigator.userAgent,
            event: {
              type: type || "todo_action",
              name: name,
              properties: properties || {}
            }
          }
        ]
      };

      return $.ajax({
        url: BASE_URL + "/api/analytics/events/batch",
        method: "POST",
        dataType: "json",
        contentType: "application/json",
        data: JSON.stringify(payload),
        timeout: 4000
      });
    }
  };

  window.TodoApi = api;
})(window, jQuery);
