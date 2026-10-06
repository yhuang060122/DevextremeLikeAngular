/* ============================================================
   jQuery Todo — Analytics SDK 宿主集成
   依赖 js/analytics-sdk.js（esbuild 打包的 Analytics SDK，IIFE，
   全局名 AnalyticsSDK）；在 app.js 之前加载。

   职责：
   1. 播种会话 id（SDK 只读 sessionStorage['analytics.session']，
      由宿主在启动时写入；F5 续用同一 id）；
   2. 创建 Analytics 实例（批量队列 + keepalive 兜底）：
      - endpoint 复用 TodoApi.baseUrl，指向 /api/analytics/events/batch；
      - 注册 PageTracker（页面浏览 + 停留时长）与 ClickTracker
        （data-analytics 元素点击）；
   3. 暴露 window.todoAnalytics 供 app.js 上报业务事件。
   ============================================================ */
(function (window) {
  "use strict";

  var BASE_URL = window.TODO_API_BASE || "http://localhost:5080";
  var SESSION_KEY = "analytics.session";

  // 1) 播种会话 id（若宿主未写入）
  try {
    if (!window.sessionStorage.getItem(SESSION_KEY)) {
      window.sessionStorage.setItem(
        SESSION_KEY,
        "todo-" + Date.now().toString(36) + "-" +
          Math.random().toString(36).slice(2, 10)
      );
    }
  } catch (e) {
    // sessionStorage 不可用时事件自动带 sessionId: null（SDK 容错）
  }

  // 2) 创建 Analytics 实例
  var SDK = window.AnalyticsSDK;

  var analytics = new SDK.Analytics({
    endpoint: BASE_URL + "/api/analytics/events/batch",

    // 应用元数据：随每个事件自动携带 appName / appVersion / appEnvironment，
    // 与 Angular 宿主各自注入，后端 /logs 页可按此区分应用与环境
    app: {
      name: "jquery-todo",
      version: "1.0.0",
      environment: "development"
    },

    // demo 友好：小批量、短间隔，方便观察批量上报
    batchSize: 5,
    flushInterval: 1500,

    timeoutMs: 4000,

    // 打开控制台可看到 created/queued/flushing/sent/failed 流水
    debug: true,

    probes: [
      function (recorder) { return new SDK.PageTracker(recorder); },
      function (recorder) { return new SDK.ClickTracker(recorder); }
    ]
  });

  analytics.start();

  // 3) 暴露给 app.js
  window.todoAnalytics = analytics;
})(window);
