import { Directive, Host, Optional, computed, input, signal } from '@angular/core';
import { ToolbarRegistry } from './toolbar-registry';
import type { MyToolbarItem } from './toolbar-item.directive';
import { MyGrid } from './my-grid';

/**
 * dxo-toolbar —— DevExtreme 式"配置指令"（dxo- 前缀 = option）。
 *
 * 它不渲染任何 DOM（styles.css 中 display:none），只做两件事：
 *  1. 提供配置：position（toolbar 在宿主内部放哪）、visible（是否显示）；
 *  2. 作为 ToolbarRegistry：收集自己内部 <ng-template myToolbarItem> 上报的项。
 *
 * 然后把"配置 + 项"一起注册给宿主组件（my-grid），由宿主在内部渲染真正的 toolbar。
 * 这正是 DevExtreme <dxo-toolbar> 的原生 Angular 版。
 */
@Directive({
  selector: 'dxo-toolbar',
  providers: [{ provide: ToolbarRegistry, useExisting: DxoToolbar }],
})
export class DxoToolbar implements ToolbarRegistry {
  /** toolbar 在宿主内部的位置 */
  readonly position = input<'top' | 'bottom'>('top');
  /** 是否显示 toolbar */
  readonly visible = input(true);

  private readonly all = signal<MyToolbarItem[]>([]);
  readonly items = computed(() => this.all());

  constructor(@Optional() @Host() private readonly grid?: MyGrid) {
    this.grid?.registerToolbar(this);
  }

  ngOnDestroy() {
    this.grid?.unregisterToolbar();
  }

  register(item: MyToolbarItem) {
    this.all.update((list) => [...list, item]);
  }

  unregister(item: MyToolbarItem) {
    this.all.update((list) => list.filter((x) => x !== item));
  }
}
