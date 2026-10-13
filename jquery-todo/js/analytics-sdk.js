var AnalyticsSDK = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/analytics/bundle-entry.ts
  var bundle_entry_exports = {};
  __export(bundle_entry_exports, {
    Analytics: () => Analytics,
    ClickTracker: () => ClickTracker,
    PageTracker: () => PageTracker
  });

  // src/analytics/utils.ts
  var warned = /* @__PURE__ */ new Set();
  function isDebugEnabled() {
    return typeof window !== "undefined" && window.ANALYTICS_DEBUG === true;
  }
  function warnOnce(key, message) {
    if (typeof console === "undefined") return;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[analytics] ${message}`);
  }
  function hasDom() {
    return typeof document !== "undefined" && typeof window !== "undefined";
  }

  // src/analytics/domain.ts
  function readPageContext() {
    const scope = typeof globalThis !== "undefined" ? globalThis : void 0;
    const location = scope?.location;
    const doc = scope?.document;
    return {
      pagePath: location?.pathname ?? "",
      pageUrl: location?.href ?? "",
      pageTitle: doc?.title ?? ""
    };
  }
  var STORAGE_KEY = "analytics.session";
  var STORAGE_WARNING = "sessionStorage could not be read, so no session id is available. Events will carry sessionId: null. If the host writes a correlation id, it will be picked up on the next event.";
  function readSessionId() {
    if (typeof sessionStorage === "undefined") return null;
    let stored;
    try {
      stored = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      warnOnce("session-storage", STORAGE_WARNING);
      return null;
    }
    return stored ? stored : null;
  }

  // src/analytics/event-factory.ts
  var EventFactory = class {
    constructor(sessionIdProvider, app) {
      __publicField(this, "sessionIdProvider");
      __publicField(this, "app");
      this.sessionIdProvider = sessionIdProvider;
      this.app = app;
    }
    track(name, properties = {}) {
      const event = {
        type: "track",
        name,
        properties,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      return this.createContext(event);
    }
    page(path, properties = {}) {
      const page = readPageContext();
      const event = {
        type: "page",
        name: path ?? page.pagePath,
        properties: {
          title: page.pageTitle,
          ...properties
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      return this.createContext(event);
    }
    /**
     * 会话 id 解析：
     * - 配置了 sessionIdProvider → 用提供者实时返回值（如 Trace-Session-Id）；
     * - 未配置 → 回退到 sessionStorage 中宿主播种的 id。
     */
    resolveSessionId() {
      if (this.sessionIdProvider) {
        return this.sessionIdProvider();
      }
      return readSessionId();
    }
    createContext(event) {
      const page = readPageContext();
      const eventWithApp = this.app ? {
        ...event,
        properties: {
          ...event.properties,
          appName: this.app.name,
          appVersion: this.app.version,
          appEnvironment: this.app.environment
        }
      } : event;
      const scope = globalThis;
      const context = {
        sessionId: this.resolveSessionId(),
        url: page.pageUrl,
        referrer: scope.document?.referrer || null,
        userAgent: scope.navigator?.userAgent ?? "",
        event: eventWithApp
      };
      return context;
    }
  };

  // src/analytics/event-queue.ts
  var DEFAULT_OPTIONS = {
    batchSize: 20,
    flushInterval: 1e3
  };
  var MAX_BUFFERED_EVENTS = 500;
  var EventQueue = class {
    constructor(destination, options = {}) {
      __publicField(this, "queue", []);
      __publicField(this, "options");
      __publicField(this, "destination");
      __publicField(this, "inFlight");
      __publicField(this, "timer");
      __publicField(this, "autoFlush", true);
      __publicField(this, "handleOnline", () => {
        void this.runFlush("online");
      });
      this.destination = destination;
      this.options = {
        ...DEFAULT_OPTIONS,
        ...options
      };
      if (hasDom()) {
        window.addEventListener("online", this.handleOnline);
      }
    }
    /** event queue 调试日志：控制台执行 window.ANALYTICS_DEBUG = true 后输出 */
    log(message) {
      if (!isDebugEnabled()) return;
      console.log(`[analytics][queue] ${message}`);
    }
    enqueue(context) {
      if (this.queue.length >= MAX_BUFFERED_EVENTS) {
        const dropped = this.queue.shift();
        this.log(
          `enqueue \u961F\u5217\u6EA2\u51FA\uFF08>${MAX_BUFFERED_EVENTS}\uFF09\uFF0C\u4E22\u5F03\u6700\u65E9 1 \u6761\uFF08${dropped.event.name}\uFF09\uFF0C\u961F\u5217\u4ECD\u4E3A ${this.queue.length} \u6761`
        );
      }
      this.queue.push(context);
      this.log(`enqueue +1\uFF08${context.event.name}\uFF09\u2192 \u961F\u5217 ${this.queue.length} \u6761`);
      if (this.queue.length >= this.options.batchSize) {
        this.log(`enqueue \u961F\u5217\u8FBE\u5230 batchSize(${this.options.batchSize})\uFF0C\u89E6\u53D1 flush[batch]`);
        void this.runFlush("batch");
        return;
      }
      this.scheduleFlush();
    }
    /** 外部触发的 flush（页面隐藏 / 卸载 / 业务显式调用等），来源记为 manual */
    flush(options) {
      return this.runFlush("manual", options);
    }
    runFlush(source, options) {
      if (this.inFlight) {
        this.log(`flush[${source}]\uFF1A\u5DF2\u6709\u53D1\u9001\u8FDB\u884C\u4E2D\uFF0C\u8DF3\u8FC7\u672C\u6B21`);
        return this.inFlight;
      }
      if (this.queue.length === 0) {
        this.log(`flush[${source}]\uFF1A\u961F\u5217 0 \u6761 \u2192 \u65E0\u6570\u636E\uFF0C\u8DF3\u8FC7`);
        return Promise.resolve();
      }
      this.log(`flush[${source}]\uFF1A\u961F\u5217 ${this.queue.length} \u6761 \u2192 \u5F00\u59CB\u53D1\u9001`);
      const run = this.drain(source, options).finally(() => {
        this.inFlight = void 0;
      });
      this.inFlight = run;
      return run;
    }
    async drain(source, options) {
      this.clearTimer();
      while (this.queue.length > 0) {
        const batch = this.queue.slice(
          0,
          this.options.batchSize
        );
        let error;
        try {
          await this.destination.send(batch, options);
        } catch (caught) {
          error = caught;
        }
        if (!error) {
          this.queue.splice(0, batch.length);
          this.log(`flush[${source}]\uFF1A\u5DF2\u53D1\u9001 ${batch.length} \u6761\uFF0C\u961F\u5217\u5269\u4F59 ${this.queue.length} \u6761`);
          continue;
        }
        this.drop(batch, error);
        this.log(
          `flush[${source}]\uFF1A\u53D1\u9001\u5931\u8D25\uFF0C\u4E22\u5F03 ${batch.length} \u6761\uFF08${String(error)}\uFF09\uFF0C\u961F\u5217\u5269\u4F59 ${this.queue.length} \u6761`
        );
      }
    }
    stop() {
      this.autoFlush = false;
      this.clearTimer();
      if (hasDom()) {
        window.removeEventListener("online", this.handleOnline);
      }
    }
    get size() {
      return this.queue.length;
    }
    drop(batch, error) {
      this.queue.splice(0, batch.length);
    }
    scheduleFlush() {
      if (!this.autoFlush) return;
      if (this.timer) return;
      this.timer = window.setTimeout(() => {
        this.timer = void 0;
        void this.runFlush("schedule");
      }, this.options.flushInterval);
    }
    clearTimer() {
      if (!this.timer) return;
      clearTimeout(this.timer);
      this.timer = void 0;
    }
  };

  // src/analytics/http-destination.ts
  var DEFAULT_TIMEOUT_MS = 1e4;
  var KEEPALIVE_BODY_LIMIT = 6e4;
  function byteLength(body) {
    if (typeof TextEncoder === "undefined") return body.length;
    return new TextEncoder().encode(body).length;
  }
  var HttpDestination = class {
    constructor(options) {
      __publicField(this, "options");
      this.options = options;
    }
    async send(events, options = {}) {
      if (events.length === 0) return;
      const body = JSON.stringify({ events });
      const keepalive = this.allowKeepalive(body, options.keepalive === true);
      let timedOut = false;
      try {
        const response = await this.post(body, keepalive, () => timedOut = true);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const failure = timedOut ? {
          reason: "timeout",
          message: `no response after ${timeoutMs} ms`
        } : {
          reason: "transport-error",
          message: String(error)
        };
        throw timedOut ? new Error(failure.message) : error;
      }
    }
    buildHeaders() {
      return {
        "Content-Type": "application/json",
        ...this.options.headers
      };
    }
    buildInit(body, keepalive) {
      return {
        method: "POST",
        headers: this.buildHeaders(),
        body,
        keepalive
      };
    }
    allowKeepalive(body, requested) {
      if (!requested) return false;
      return byteLength(body) <= KEEPALIVE_BODY_LIMIT;
    }
    async post(body, keepalive, onTimeout) {
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const init = this.buildInit(body, keepalive);
      if (typeof AbortController === "undefined" || timeoutMs <= 0) {
        return fetch(this.options.endpoint, init);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        onTimeout();
        controller.abort();
      }, timeoutMs);
      try {
        return await fetch(this.options.endpoint, {
          ...init,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
    }
  };

  // src/analytics/analytics.ts
  var Analytics = class {
    constructor(config) {
      __publicField(this, "trackers", []);
      __publicField(this, "factory");
      __publicField(this, "queue");
      __publicField(this, "destroyed", false);
      __publicField(this, "handleVisibility", () => {
        if (document.visibilityState !== "hidden") return;
        void this.flush({ keepalive: true });
      });
      __publicField(this, "handleUnload", () => {
        void this.flush({ keepalive: true });
      });
      const destination = new HttpDestination(
        {
          endpoint: config.endpoint,
          headers: config.headers,
          timeoutMs: config.timeoutMs
        }
      );
      this.queue = new EventQueue(
        destination,
        {
          batchSize: config.batchSize,
          flushInterval: config.flushInterval
        }
      );
      this.factory = new EventFactory(
        config.sessionIdProvider,
        config.app
      );
      this.wireProbes(config.probes);
      this.registerLifecycle();
    }
    wireProbes(factories = []) {
      for (const build of factories) {
        try {
          this.registerTracker(build(this));
        } catch (error) {
          warnOnce(
            "probe-factory-failed",
            `a probe factory threw while wiring the SDK; that probe was skipped and the rest were registered (${String(error)})`
          );
        }
      }
    }
    /**
     * Tear everything down: probes, lifecycle listeners, timers,
     * then one last best-effort flush.
     *
     * Idempotent — a second call does nothing.
     */
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.unregisterAll();
      this.removeLifecycle();
      this.queue.stop();
      void this.flush();
    }
    /**
     * Awaitable teardown: waits for the buffered events to be
     * shipped (or to fail) before stopping the queue. Unlike
     * `destroy()` it does not leave a request in flight.
     */
    async close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.unregisterAll();
      this.removeLifecycle();
      await this.flush();
      this.queue.stop();
    }
    get isDestroyed() {
      return this.destroyed;
    }
    registerTracker(tracker) {
      this.trackers.push(tracker);
    }
    start() {
      for (const tracker of this.trackers) {
        tracker.start();
      }
    }
    unregisterTracker(tracker) {
      const index = this.trackers.indexOf(tracker);
      if (index === -1) return;
      this.trackers.splice(index, 1);
      tracker.stop();
    }
    unregisterAll() {
      this.trackers.splice(0).forEach((tracker) => tracker.stop());
    }
    record(build) {
      if (this.destroyed) return;
      try {
        this.queue.enqueue(build());
      } catch (error) {
        warnOnce(
          "record-failed",
          `could not record an event; it was dropped. The host app was not affected (${String(error)})`
        );
      }
    }
    track(name, properties = {}) {
      this.record(() => this.factory.track(name, properties));
    }
    page(path, properties = {}) {
      this.record(() => this.factory.page(path, properties));
    }
    flush(options) {
      return this.queue.flush(options);
    }
    get pending() {
      return this.queue.size;
    }
    registerLifecycle() {
      if (!hasDom()) return;
      document.addEventListener(
        "visibilitychange",
        this.handleVisibility
      );
      window.addEventListener(
        "beforeunload",
        this.handleUnload
      );
    }
    removeLifecycle() {
      if (!hasDom()) return;
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibility
      );
      window.removeEventListener(
        "beforeunload",
        this.handleUnload
      );
    }
  };

  // src/analytics/tracker.ts
  var BaseTracker = class {
    constructor() {
      __publicField(this, "running", false);
    }
    start() {
      if (this.running) return;
      if (!this.canStart()) return;
      this.running = true;
      this.onStart();
    }
    stop() {
      if (!this.running) return;
      this.running = false;
      this.onStop();
    }
    get isRunning() {
      return this.running;
    }
    /**
     * Return false to skip starting. The tracker stays stopped,
     * so a later `start()` can still succeed once the runtime
     * appears.
     */
    canStart() {
      return true;
    }
  };

  // src/analytics/page-tracker.ts
  var PageTracker = class extends BaseTracker {
    constructor(recorder) {
      super();
      __publicField(this, "recorder");
      __publicField(this, "currentPath", "");
      __publicField(this, "enteredAt", 0);
      __publicField(this, "handleVisibility", () => {
        if (document.visibilityState === "hidden") {
          this.trackDuration();
        }
      });
      __publicField(this, "handleUnload", () => {
        this.trackDuration();
      });
      this.recorder = recorder;
    }
    /**
     * Start browser page tracking.
     */
    canStart() {
      return hasDom();
    }
    onStart() {
      this.currentPath = window.location.pathname;
      this.trackPage();
      this.enteredAt = performance.now();
      document.addEventListener(
        "visibilitychange",
        this.handleVisibility
      );
      window.addEventListener(
        "beforeunload",
        this.handleUnload
      );
    }
    onStop() {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibility
      );
      window.removeEventListener(
        "beforeunload",
        this.handleUnload
      );
    }
    trackPage(path = this.currentPath) {
      this.recorder.page(
        path,
        {
          title: document.title,
          eventType: "page",
          eventCategory: "navigation"
        }
      );
    }
    trackDuration() {
      const duration = Math.round(
        performance.now() - this.enteredAt
      );
      this.recorder.track(
        "Page Duration",
        {
          // The shared reader, so these three keys cannot drift
          // from the ones on an `Element Clicked`. This file used
          // to read `document.title` itself, which is the exact
          // duplication the read-then-spread form exists to stop.
          ...readPageContext(),
          eventType: "page",
          eventCategory: "navigation",
          durationMs: duration
        }
      );
    }
  };

  // src/analytics/click-tracker.ts
  var TEXT_ATTRIBUTE = "data-analytics-text";
  var LABEL_MAX_LENGTH = 200;
  function readElementLabel(element) {
    const ariaLabel = element.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const firstRef = labelledBy.trim().split(/\s+/)[0];
      const refText = firstRef ? document.getElementById(firstRef)?.textContent?.trim() : null;
      if (refText) return refText.slice(0, LABEL_MAX_LENGTH);
    }
    const labels = element.labels;
    const labelText = labels?.[0]?.textContent?.trim();
    if (labelText) return labelText.slice(0, LABEL_MAX_LENGTH);
    const ownText = element.textContent?.trim();
    return ownText ? ownText.slice(0, LABEL_MAX_LENGTH) : null;
  }
  function readCategory(analyticsName) {
    if (analyticsName.includes("filter")) return "filter";
    if (analyticsName.startsWith("nav-")) return "navigation";
    if (analyticsName.startsWith("todo-")) return "task";
    return "ui";
  }
  var ClickTracker = class extends BaseTracker {
    constructor(recorder, options = {}) {
      super();
      __publicField(this, "recorder");
      __publicField(this, "attribute");
      __publicField(this, "handleClick", (event) => {
        const selector = `[${this.attribute}]`;
        const element = event.target?.closest(selector);
        if (!element) {
          return;
        }
        const name = element.getAttribute(this.attribute);
        if (!name) {
          return;
        }
        this.recorder.track("Element Clicked", {
          element: name,
          tag: element.tagName,
          // 分析层分类：type=来源机制，category=业务域（见设计文档）
          eventType: "click",
          eventCategory: readCategory(name),
          // 元素标识四件套：id / name / type / label
          id: element.id || null,
          name: element.getAttribute("name") || null,
          type: element.getAttribute("type") || null,
          label: readElementLabel(element),
          text: element.hasAttribute(TEXT_ATTRIBUTE) ? element.textContent?.trim() ?? null : null,
          // `getAttribute`, not `.className`: on an SVG element
          // `className` is an `SVGAnimatedString` object, so the
          // one non-JSON value in the payload came from here.
          // The attribute is a plain string for every element, and
          // an absent class stays null either way.
          cssClass: element.getAttribute("class") || null,
          ...readPageContext()
        });
      });
      this.recorder = recorder;
      this.attribute = options.attribute ?? "data-analytics";
    }
    /**
     * False without a DOM, so `start()` leaves the probe stopped
     * instead of throwing. Server-side rendering constructs the
     * whole probe chain; it just has nothing to listen to.
     */
    canStart() {
      return hasDom();
    }
    onStart() {
      document.addEventListener("click", this.handleClick, true);
    }
    onStop() {
      document.removeEventListener("click", this.handleClick, true);
    }
  };
  return __toCommonJS(bundle_entry_exports);
})();
