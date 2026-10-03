import { Component } from '@angular/core';

/**
 * 版本A：ng-content 多插槽（静态投影）—— 拿来就能用。
 *
 * 组件只负责给壳、给布局、给位置；不决定里面是什么。
 * 调用方把任意 HTML / 组件丢进带 [before] / [after] 属性的元素里即可。
 */
@Component({
  selector: 'my-toolbar-a',
  template: `
    <div class="flex w-full min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <div class="flex items-center gap-2">
        <ng-content select="[before]"></ng-content>
      </div>
      <div class="flex-1"></div>
      <div class="flex items-center gap-2">
        <ng-content select="[after]"></ng-content>
      </div>
    </div>
  `,
})
export class MyToolbarA {}
