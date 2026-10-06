/* ============================================================
   jQuery Todo List — 应用逻辑（依赖 jQuery 3.x）
   ============================================================ */
$(function () {
  "use strict";

  /* ---- 常量与状态 ---- */
  var STORAGE_KEY = "jquery-todo.items";

  var state = {
    todos: loadTodos(), // [{ id, text, completed }]
    filter: "all",      // all | active | completed
    online: null,       // null=检查中  true=已连接后端  false=后端不可达
    nextId: 1
  };

  // 初次加载后，把 nextId 推到已存在 id 之后
  state.todos.forEach(function (todo) {
    if (todo.id >= state.nextId) {
      state.nextId = todo.id + 1;
    }
  });

  /* ---- 本地存储 ---- */
  function loadTodos() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveTodos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  }

  /* ---- 渲染 ---- */
  function render() {
    var $list = $("#todo-list");
    var visible = state.todos.filter(function (todo) {
      if (state.filter === "active") return !todo.completed;
      if (state.filter === "completed") return todo.completed;
      return true;
    });

    $list.empty();

    visible.forEach(function (todo) {
      var $li = $("<li>")
        .addClass("todo-item" + (todo.completed ? " is-completed" : ""))
        .attr("data-id", todo.id)
        .append(
          $("<input>")
            .attr("type", "checkbox")
            .addClass("todo-item__checkbox")
            .attr("data-analytics", "todo-toggle")
            .prop("checked", todo.completed),
          $("<span>").addClass("todo-item__text").text(todo.text),
          $("<button>")
            .attr("type", "button")
            .addClass("todo-item__delete")
            .attr("data-analytics", "todo-delete")
            .attr("aria-label", "删除任务")
            .html("&times;")
        );
      $list.append($li);
    });

    // 空状态
    $("#empty-state").toggleClass("is-visible", visible.length === 0);

    // 剩余计数
    var remaining = state.todos.filter(function (t) { return !t.completed; }).length;
    $("#items-left").text(remaining + " 项待办");

    // 清除已完成按钮：无已完成项时禁用
    var hasCompleted = state.todos.some(function (t) { return t.completed; });
    $("#clear-completed").prop("disabled", !hasCompleted).css("opacity", hasCompleted ? 1 : 0.4);

    // 过滤按钮高亮
    $(".filter-btn").each(function () {
      $(this).toggleClass("is-active", $(this).data("filter") === state.filter);
    });
  }

  /* ---- AJAX：后端连接状态 ---- */
  function setStatus(mode, text) {
    $("#api-status")
      .removeClass("is-online is-offline")
      .addClass(mode === "online" ? "is-online" : mode === "offline" ? "is-offline" : "")
      .find(".api-status__text").text(text);
  }

  function refreshServerStatus() {
    setStatus("checking", "正在检查后端连接…");

    TodoApi.getServerStatus()
      .done(function (data) {
        state.online = true;
        var d = new Date(data.serverTimeUtc);
        var hh = ("0" + d.getHours()).slice(-2);
        var mm = ("0" + d.getMinutes()).slice(-2);
        setStatus("online", "已连接后端 · 服务器时间 " + hh + ":" + mm + " · 共 " + data.total + " 条事件");
      })
      .fail(function () {
        state.online = false;
        setStatus("offline", "后端未连接，数据保存在本地");
      });
  }

  // 后端可达时通过 Analytics SDK 上报；不可达时静默跳过（不打断本地操作）
  function track(name, properties) {
    if (state.online !== true) return;
    if (!window.todoAnalytics) return;
    window.todoAnalytics.track(name, properties);
  }

  /* ---- 操作 ---- */
  function addTodo(text) {
    text = $.trim(text);
    if (!text) return;

    var todo = {
      id: state.nextId++,
      text: text,
      completed: false
    };
    state.todos.push(todo);
    saveTodos();
    render();
    track("todo_add", { id: todo.id, text: todo.text });
  }

  function deleteTodo(id) {
    var removed = state.todos.filter(function (t) { return t.id === id; })[0];
    state.todos = state.todos.filter(function (t) { return t.id !== id; });
    saveTodos();
    render();
    if (removed) track("todo_delete", { id: id, text: removed.text });
  }

  function toggleTodo(id) {
    var target = null;
    state.todos.forEach(function (t) {
      if (t.id === id) {
        t.completed = !t.completed;
        target = t;
      }
    });
    saveTodos();
    render();
    if (target) track("todo_toggle", { id: id, completed: target.completed });
  }

  function clearCompleted() {
    var cleared = state.todos.filter(function (t) { return t.completed; }).length;
    state.todos = state.todos.filter(function (t) { return !t.completed; });
    saveTodos();
    render();
    if (cleared > 0) track("todo_clear_completed", { count: cleared });
  }

  /* ---- 事件绑定 ---- */
  // 新增（表单提交 = 按钮点击 / 回车）
  $("#add-form").on("submit", function (e) {
    e.preventDefault();
    addTodo($("#new-todo").val());
    $("#new-todo").val("").trigger("focus");
  });

  // 勾选 / 取消勾选（事件委托，覆盖新渲染出的元素）
  $("#todo-list").on("change", ".todo-item__checkbox", function () {
    toggleTodo(Number($(this).closest(".todo-item").data("id")));
  });

  // 删除
  $("#todo-list").on("click", ".todo-item__delete", function () {
    deleteTodo(Number($(this).closest(".todo-item").data("id")));
  });

  // 过滤
  $(".app__filters").on("click", ".filter-btn", function () {
    state.filter = $(this).data("filter");
    render();
  });

  // 清除已完成
  $("#clear-completed").on("click", clearCompleted);

  /* ---- 启动 ---- */
  render();
  refreshServerStatus(); // 异步探活，不阻塞本地使用
});
