import { Directive, TemplateRef } from '@angular/core';

/** 单行基金记录 */
export interface FundRow {
  id: string;
  fundCode: string;
  fundName: string;
  nav: number;
}

/**
 * 模板上下文类型：传给 <ng-template> 的数据结构。
 * $implicit 是上下文对象内置特殊属性：
 *   let-fund        ←→ 等价 let-fund = $implicit（拿到单行基金记录）
 *   let-idx="rowIndex" ←→ 显式映射上下文其他字段
 */
export type FundRowTemplateContext = {
  $implicit: FundRow;
  rowIndex: number;
  /** 完整数组（可选）：仅当表格开启 passAllRows 时才存在。类型必须与运行时对齐。 */
  allRows?: FundRow[];
};

/**
 * 标记指令（行业标准做法）：只作模板占位标记，不渲染任何 DOM。
 *
 * 为什么必须有它？
 *  ngTemplateContextGuard 只能挂在 Directive 上，不能直接写在 Component 上；
 *  没有标记指令，TS 无法推断模板上下文类型，let-fund 会变成 any。
 *
 * 模板蓝图从哪来？
 *  指令绑在 <ng-template> 上时，Angular 会通过依赖注入把该模板的
 *  TemplateRef 注入进来（和 @Input 变体二选一，见 FAQ）。
 */
@Directive({
  selector: '[appFundRowTpl]',
  standalone: true,
})
export class FundRowTplDirective {
  constructor(public readonly template: TemplateRef<FundRowTemplateContext>) {}

  /**
   * 核心：ngTemplateContextGuard —— 编译期类型守卫函数。
   * 运行时不会执行，打包后直接被擦除；
   * return true 是固定写法，函数体不要写任何业务逻辑。
   * 作用：告诉 TS 编译器 <ng-template> 渲染时上下文对象的准确类型，消除 any。
   */
  static ngTemplateContextGuard(
    _dir: FundRowTplDirective,
    ctx: FundRowTemplateContext,
  ): ctx is FundRowTemplateContext {
    return true;
  }
}
