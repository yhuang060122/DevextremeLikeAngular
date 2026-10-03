import { Component, input, signal } from '@angular/core';
import { MyToolbarC } from './toolbar-c';
import type { DxoToolbar } from './dxo-toolbar.directive';

export interface GridRow {
  id: number;
  name: string;
  status: string;
  amount: number;
}

/**
 * my-grid —— 宿主组件：grid 只负责画行、分页；toolbar 是一个"内部组件"。
 *
 * toolbar 的渲染完全由 <dxo-toolbar> 指令控制：
 *  - 没有 dxo-toolbar 注册 → 不渲染 toolbar；
 *  - dxo-toolbar 的 position / visible / items 变化 → grid 自动重排内部 toolbar。
 * 这就是"壳管布局，用户管内容"的完整形态：grid 连 toolbar 的存在与否都不写死。
 */
@Component({
  selector: 'my-grid',
  imports: [MyToolbarC],
  template: `
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      @let tb = toolbar();

      @if (tb && tb.visible() && tb.position() === 'top') {
        <div class="border-b border-slate-200 p-2">
          <my-toolbar-c [items]="tb.items()" />
        </div>
      }

      <table class="w-full text-[13px]">
        <thead>
          <tr class="bg-slate-50 text-left text-xs text-slate-500">
            <th class="px-3.5 py-2.5 font-semibold">ID</th>
            <th class="px-3.5 py-2.5 font-semibold">名称</th>
            <th class="px-3.5 py-2.5 font-semibold">状态</th>
            <th class="px-3.5 py-2.5 text-right font-semibold">金额</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.id) {
            <tr class="border-t border-slate-100">
              <td class="px-3.5 py-2.5 font-mono text-slate-500">{{ row.id }}</td>
              <td class="px-3.5 py-2.5">{{ row.name }}</td>
              <td class="px-3.5 py-2.5">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {{ row.status === '已完成' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700' }}"
                >{{ row.status }}</span>
              </td>
              <td class="px-3.5 py-2.5 text-right font-mono">¥{{ row.amount }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="border-t border-slate-100 px-3.5 py-2 text-xs text-slate-400">
        共 {{ rows().length }} 行 · grid 只负责画行，toolbar 是内部组件，由 dxo-toolbar 指令控制
      </div>

      @if (tb && tb.visible() && tb.position() === 'bottom') {
        <div class="border-t border-slate-200 p-2">
          <my-toolbar-c [items]="tb.items()" />
        </div>
      }
    </div>
  `,
})
export class MyGrid {
  readonly rows = input<GridRow[]>([]);

  protected readonly toolbar = signal<DxoToolbar | null>(null);

  registerToolbar(t: DxoToolbar) {
    this.toolbar.set(t);
  }

  unregisterToolbar() {
    this.toolbar.set(null);
  }
}
