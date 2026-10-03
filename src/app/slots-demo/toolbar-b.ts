import { Component, Input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * 版本B：TemplateRef 模板插槽 —— 拿到的是"渲染蓝图"。
 *
 * 调用方用 <ng-template #xxx> 定义内容，组件通过 @Input 接收 TemplateRef，
 * 需要的时候（甚至多次、换个容器）用 ngTemplateOutlet 渲染。
 * 这是"晚点再渲染 / 渲染多遍 / 挪去溢出菜单"的基础。
 */
@Component({
  selector: 'my-toolbar-b',
  imports: [NgTemplateOutlet],
  template: `
    <div class="flex w-full min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <div class="flex items-center gap-2">
        <ng-container *ngTemplateOutlet="beforeTpl"></ng-container>
      </div>
      <div class="flex-1"></div>
      <div class="flex items-center gap-2">
        <ng-container *ngTemplateOutlet="afterTpl"></ng-container>
      </div>
    </div>
  `,
})
export class MyToolbarB {
  @Input() beforeTpl!: TemplateRef<void>;
  @Input() afterTpl!: TemplateRef<void>;
}
