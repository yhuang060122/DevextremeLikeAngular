// ============================================================
// Analytics SDK — 浏览器打包入口（bundle entry）
//
// 仅供 esbuild 打包为独立浏览器脚本（IIFE，全局名 AnalyticsSDK）
// 使用，例如：
//   npx esbuild src/analytics/bundle-entry.ts \
//     --bundle --format=iife --global-name=AnalyticsSDK \
//     --target=es2020 \
//     --outfile=jquery-todo/js/analytics-sdk.js
//
// 产物可在任意宿主（jQuery / 原生 JS / 其它框架）中通过
// <script> 加载后使用：window.AnalyticsSDK.Analytics / PageTracker /
// ClickTracker。
// ============================================================

export { Analytics } from './analytics';
export { PageTracker } from './page-tracker';
export { ClickTracker } from './click-tracker';

export type { AnalyticsConfig } from './config';
export type {
  EventRecorder,
  Tracker,
  ProbeFactory,
} from './tracker';
export type {
  AnalyticsContext,
  AnalyticsEvent,
  AnalyticsEventType,
} from './domain';
