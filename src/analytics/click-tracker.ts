import { BaseTracker } from './tracker';
import type { EventRecorder } from './tracker';
import { hasDom } from './utils';
import { readPageContext } from './domain';

export interface ClickTrackerOptions {
  /**
   * HTML attribute used to identify trackable elements.
   * Default: data-analytics
   */
  attribute?: string;
}

/**
 * Marks an element whose text may be reported.
 *
 * `element.textContent` is the one property that routinely
 * carries personal data — a "Hi Sarah" greeting, a message
 * preview, a price with the customer's name next to it — so
 * it is opt-in per element rather than sent for every click.
 * The key stays present (as null) so the property schema
 * does not depend on which element was clicked.
 */
const TEXT_ATTRIBUTE = 'data-analytics-text';

/**
 * 元素可见文本的上限长度，防止超长内容（消息正文等）整体进入事件。
 */
const LABEL_MAX_LENGTH = 200;

/**
 * 元素的人类可读标签，用于日志 / 热力图分析时快速识别"用户点了什么"。
 *
 * 采集优先级：
 *  1. `aria-label` 属性
 *  2. `aria-labelledby` 指向的元素文本
 *  3. 关联 `<label>` 元素文本（checkbox / input 等可标记元素）
 *  4. 元素自身可见文本（trim，截断 LABEL_MAX_LENGTH）
 *
 * 与 `text` 字段的区别：`text` 必须由 `data-analytics-text` 显式开启
 * （隐私 opt-in）；`label` 自动采集"标识文本"，但仅对显式标记了
 * `data-analytics` 的元素生效。涉及个人数据的文本，建议改用
 * `aria-label` / 关联 `<label>` 提供受控标签。
 */
function readElementLabel(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const firstRef = labelledBy.trim().split(/\s+/)[0];
    const refText = firstRef ? document.getElementById(firstRef)?.textContent?.trim() : null;
    if (refText) return refText.slice(0, LABEL_MAX_LENGTH);
  }

  const labels = (element as Element & { labels?: NodeListOf<HTMLLabelElement> }).labels;
  const labelText = labels?.[0]?.textContent?.trim();
  if (labelText) return labelText.slice(0, LABEL_MAX_LENGTH);

  const ownText = element.textContent?.trim();
  return ownText ? ownText.slice(0, LABEL_MAX_LENGTH) : null;
}

/**
 * 从 data-analytics 标记值推导业务类别（eventCategory）。
 *
 * 约定：标记值以业务域前缀开头，`{domain}-{action}`。
 *   filter*   → filter（筛选/视图切换，如 todo-filter-active）
 *   nav-*     → navigation（导航链接，如 nav-logs）
 *   todo-*    → task（任务管理，如 todo-add-btn / todo-toggle）
 *   其它      → ui（界面组件交互，默认）
 */
function readCategory(analyticsName: string): string {
  if (analyticsName.includes('filter')) return 'filter';
  if (analyticsName.startsWith('nav-')) return 'navigation';
  if (analyticsName.startsWith('todo-')) return 'task';
  return 'ui';
}

export class ClickTracker extends BaseTracker {
  private readonly recorder: EventRecorder;
  private readonly attribute: string;

  constructor(recorder: EventRecorder, options: ClickTrackerOptions = {}) {
    super();

    this.recorder = recorder;
    this.attribute = options.attribute ?? 'data-analytics';
  }

  /**
   * False without a DOM, so `start()` leaves the probe stopped
   * instead of throwing. Server-side rendering constructs the
   * whole probe chain; it just has nothing to listen to.
   */
  protected override canStart(): boolean {
    return hasDom();
  }

  protected onStart(): void {
    document.addEventListener('click', this.handleClick, true);
  }

  protected onStop(): void {
    document.removeEventListener('click', this.handleClick, true);
  }

  private handleClick = (event: MouseEvent): void => {
    const selector = `[${this.attribute}]`;

    const element = (event.target as HTMLElement)?.closest(selector);

    if (!element) {
      return;
    }

    const name = element.getAttribute(this.attribute);

    if (!name) {
      return;
    }

    this.recorder.track('Element Clicked', {
      element: name,

      tag: element.tagName,

      // 分析层分类：type=来源机制，category=业务域（见设计文档）
      eventType: 'click',

      eventCategory: readCategory(name),

      // 元素标识四件套：id / name / type / label
      id: element.id || null,

      name: element.getAttribute('name') || null,

      type: element.getAttribute('type') || null,

      label: readElementLabel(element),

      text: element.hasAttribute(TEXT_ATTRIBUTE) ? (element.textContent?.trim() ?? null) : null,

      // `getAttribute`, not `.className`: on an SVG element
      // `className` is an `SVGAnimatedString` object, so the
      // one non-JSON value in the payload came from here.
      // The attribute is a plain string for every element, and
      // an absent class stays null either way.
      cssClass: element.getAttribute('class') || null,

      ...readPageContext(),
    });
  };
}
