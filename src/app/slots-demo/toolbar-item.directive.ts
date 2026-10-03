import { Directive, Input, Optional, TemplateRef } from '@angular/core';
import { ToolbarRegistry } from './toolbar-registry';

export type ToolbarSlot = 'before' | 'center' | 'after';

/**
 * 版本C 的核心：一个"轻注册指令"。
 *
 * 它只做两件事：
 *  1. 把自己宿主元素（ng-template）的 TemplateRef「蓝图」暴露给外部；
 *  2. 在构造时把自己上报给"最近的注册中心"（ToolbarRegistry），销毁时注销。
 *
 * 注册中心是谁由宿主位置决定：
 *  - 直接放在 <my-toolbar-c> 里 → toolbar-c 自身收集；
 *  - 放在 <dxo-toolbar> 里 → dxo-toolbar 收集，再由宿主组件注入内部 toolbar。
 *
 * 不决定任何渲染细节 —— 渲染完全由收集方用 ngTemplateOutlet 完成。
 */
@Directive({
  selector: '[myToolbarItem]',
})
export class MyToolbarItem {
  /** 位置标记：before | center | after */
  @Input() myToolbarItem!: ToolbarSlot;

  constructor(
    public readonly tpl: TemplateRef<unknown>,
    @Optional() private readonly registry?: ToolbarRegistry,
  ) {
    this.registry?.register(this);
  }

  ngOnDestroy() {
    this.registry?.unregister(this);
  }
}
