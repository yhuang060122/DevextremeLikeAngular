import type { MyToolbarItem } from './toolbar-item.directive';

/**
 * 可扩展 toolbar 的"注册中心"抽象。
 *
 * myToolbarItem 指令不再写死注册到某个组件，而是注入"最近的注册中心"：
 *  - 直接放在 <my-toolbar-c> 里 → 注册到 toolbar-c 自身；
 *  - 放在 <dxo-toolbar> 里（grid 内部组件场景）→ 注册到 dxo-toolbar。
 * 这就是 dxo-* 配置指令能"收集子项"的基础。
 */
export abstract class ToolbarRegistry {
  abstract register(item: MyToolbarItem): void;
  abstract unregister(item: MyToolbarItem): void;
}
