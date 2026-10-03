import { Directive, TemplateRef } from '@angular/core';

/** 泛型模板上下文：任何行类型都能复用 */
export type GridRowTemplateContext<TRow> = {
  $implicit: TRow;
  rowIndex: number;
};

/**
 * 泛型通用版标记指令 —— 推荐。
 * 表格行插槽统一使用它，可复用任意行类型；
 * DevExtreme 自定义单元格模板（dxCellTemplate）采用完全相同的模式。
 */
@Directive({
  selector: '[appGridRowTpl]',
  standalone: true,
})
export class GridRowTplDirective<TRow> {
  constructor(public readonly template: TemplateRef<GridRowTemplateContext<TRow>>) {}

  /** ⚠️ 守卫的泛型参数必须和指令泛型保持同一个 TRow，否则类型推断失效 */
  static ngTemplateContextGuard<TRow>(
    _dir: GridRowTplDirective<TRow>,
    ctx: GridRowTemplateContext<TRow>,
  ): ctx is GridRowTemplateContext<TRow> {
    return true;
  }
}
