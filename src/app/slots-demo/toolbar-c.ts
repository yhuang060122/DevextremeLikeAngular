import { Component, computed, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MyToolbarItem } from './toolbar-item.directive';
import { ToolbarRegistry } from './toolbar-registry';

/**
 * 版本C：自动收集"不限数量、带位置标记"的插槽 —— dxi-data-grid-item 的极简原型。
 *
 * 两种工作模式：
 *  1. 直接使用：调用方把 <ng-template myToolbarItem> 放在本组件内部，指令构造时自动注册；
 *  2. dxo 模式：作为宿主组件（如 my-grid）的"内部组件"，通过 @Input items 接收
 *     dxo-toolbar 收集好的项，本组件只负责按位置遍历、用 ngTemplateOutlet 画出来。
 */
@Component({
  selector: 'my-toolbar-c',
  imports: [NgTemplateOutlet],
  providers: [{ provide: ToolbarRegistry, useExisting: MyToolbarC }],
  template: `
    <div class="flex w-full min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <div class="flex items-center gap-2">
        @for (item of itemsBefore(); track item) {
          <ng-container [ngTemplateOutlet]="item.tpl"></ng-container>
        }
      </div>
      <div class="flex-1"></div>
      <div class="mx-3 flex items-center gap-2">
        @for (item of itemsCenter(); track item) {
          <ng-container [ngTemplateOutlet]="item.tpl"></ng-container>
        }
      </div>
      <div class="flex items-center gap-2">
        @for (item of itemsAfter(); track item) {
          <ng-container [ngTemplateOutlet]="item.tpl"></ng-container>
        }
      </div>
    </div>
  `,
})
export class MyToolbarC implements ToolbarRegistry {
  /** dxo 模式：外部（宿主组件经 dxo-toolbar）注入的项；为 null 时退回自注册收集 */
  readonly items = input<MyToolbarItem[] | null>(null);

  private readonly self = signal<MyToolbarItem[]>([]);

  readonly itemsBefore = computed(() => this.effective().filter((i) => i.myToolbarItem === 'before'));
  readonly itemsCenter = computed(() => this.effective().filter((i) => i.myToolbarItem === 'center'));
  readonly itemsAfter = computed(() => this.effective().filter((i) => i.myToolbarItem === 'after'));

  private effective(): MyToolbarItem[] {
    return this.items() ?? this.self();
  }

  register(item: MyToolbarItem) {
    this.self.update((list) => [...list, item]);
  }

  unregister(item: MyToolbarItem) {
    this.self.update((list) => list.filter((x) => x !== item));
  }
}
