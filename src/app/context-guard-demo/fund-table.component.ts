import { Component, computed, contentChild, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FundRow, FundRowTemplateContext, FundRowTplDirective } from './fund-row-tpl.directive';

/**
 * app-fund-table —— 宿主表格组件。
 *
 * 谁控制运行时数据？
 *  [ngTemplateOutletContext] 在表格组件内部，决定运行时传给模板什么值；
 *  ngTemplateContextGuard 只描述类型，不控制运行时数据。
 *  ⚠️ 两者类型必须保持同步，否则「类型说谎」：TS 类型和实际运行数据不一致。
 *
 * 为什么插槽拿到单行 FundRow，不是 FundRow[]？
 *  父组件传入 FundRow[] → 表格 @for 逐行迭代取出单行 row →
 *  每次循环把单行对象放入 $implicit → 插槽被执行 N 次（数组长度 N），
 *  每次上下文是单条记录。需要完整数组时额外传 allRows（见 passAllRows）。
 */
@Component({
  selector: 'app-fund-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="bg-slate-50 text-left text-xs text-slate-500">
          <th class="px-3.5 py-2.5 font-semibold">#</th>
          <th class="px-3.5 py-2.5 font-semibold">基金代码</th>
          <th class="px-3.5 py-2.5 font-semibold">插槽渲染（调用方完全自定义，let-fund 已推断为 FundRow）</th>
        </tr>
      </thead>
      <tbody>
        @for (row of data(); track row.id) {
          <tr class="border-t border-slate-100">
            <td class="px-3.5 py-2.5 font-mono text-slate-500">{{ $index }}</td>
            <td class="px-3.5 py-2.5 font-mono text-slate-600">{{ row.fundCode }}</td>
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
      共 {{ data().length }} 行 · 表格只负责画行 + 喂上下文，单元格内容全部来自插槽
    </div>
  `,
})
export class FundTableComponent {
  /** 数据源：父组件传入 FundRow[] */
  readonly data = input.required<FundRow[]>();
  /** 测试开关：为 true 时额外把完整数组 allRows 传给插槽（类型同步演示） */
  readonly passAllRows = input(false);

  /** 从投影内容中找到标记指令，读出模板蓝图 */
  private readonly rowTplDir = contentChild(FundRowTplDirective);

  /** 返回 TemplateRef 或 null（未提供插槽时不渲染），类型与运行时对齐 */
  protected readonly rowTpl = computed(() => this.rowTplDir()?.template ?? null);

  /**
   * 构造运行时上下文对象：返回类型就是 FundRowTemplateContext，
   * 因此 TS 保证这里和 let-fund / let-idx / let-all 的类型永远同步。
   */
  protected rowContext(row: FundRow, index: number): FundRowTemplateContext {
    return this.passAllRows()
      ? { $implicit: row, rowIndex: index, allRows: this.data() }
      : { $implicit: row, rowIndex: index };
  }
}
