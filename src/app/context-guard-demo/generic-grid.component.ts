import { Component, computed, contentChild, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GridRowTemplateContext, GridRowTplDirective } from './grid-row-tpl.directive';

/**
 * app-generic-grid —— 泛型宿主表格组件。
 *
 * 同一份 GridRowTplDirective<TRow> 指令 + 同一个组件，可渲染任意行类型：
 *   <app-generic-grid [data]="txns()">
 *     <ng-template appGridRowTpl let-tx let-idx="rowIndex"> … </ng-template>
 *   </app-generic-grid>
 * 组件泛型 TRow 从 [data] 推断，模板变量 let-tx 随之获得精确类型。
 */
@Component({
  selector: 'app-generic-grid',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="bg-slate-50 text-left text-xs text-slate-500">
          <th class="px-3.5 py-2.5 font-semibold">#</th>
          <th class="px-3.5 py-2.5 font-semibold">泛型插槽渲染（同一指令复用，let-tx 已推断为 {{ rowTypeLabel() }}）</th>
        </tr>
      </thead>
      <tbody>
        @for (row of data(); track row.id) {
          <tr class="border-t border-slate-100">
            <td class="px-3.5 py-2.5 font-mono text-slate-500">{{ $index }}</td>
            <td class="px-3.5 py-2.5">
              <ng-container
                [ngTemplateOutlet]="rowTpl()"
                [ngTemplateOutletContext]="rowContext(row, $index)"
              />
            </td>
          </tr>
        }
      </tbody>
    </table>
    <div class="border-t border-slate-100 px-3.5 py-2 text-xs text-slate-400">
      共 {{ data().length }} 行 · 复用同一个 GridRowTplDirective&lt;TRow&gt;，行类型由调用方决定
    </div>
  `,
})
export class GenericGridComponent<TRow extends { id: string | number }> {
  /** 数据源：任意行类型数组，TRow 从这里推断 */
  readonly data = input.required<TRow[]>();
  /** 表头里展示的行类型名（仅演示用） */
  readonly rowTypeLabel = input('行类型');

  private readonly rowTplDir = contentChild(GridRowTplDirective<TRow>);

  protected readonly rowTpl = computed(() => this.rowTplDir()?.template ?? null);

  protected rowContext(row: TRow, index: number): GridRowTemplateContext<TRow> {
    return { $implicit: row, rowIndex: index };
  }
}
