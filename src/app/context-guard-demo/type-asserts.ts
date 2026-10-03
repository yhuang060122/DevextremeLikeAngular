/**
 * 编译期类型测试 —— 由 tsc 在每次 ng build 时执行，零运行时开销。
 *
 * 如果 ngTemplateContextGuard / 上下文类型被改坏（例如有人把 rowIndex 改成 string、
 * 把 $implicit 换成 FundRow[]），下面这些断言会让构建直接失败。
 * 这是「消除 any」的可机器验证部分：上下文类型不可能是 any，
 * 模板变量 let-fund / let-idx 的类型由 Angular strictTemplates + 守卫在构建期推导。
 */
import { FundRowTplDirective } from './fund-row-tpl.directive';
import { GridRowTplDirective } from './grid-row-tpl.directive';
import type { FundRow, FundRowTemplateContext } from './fund-row-tpl.directive';
import type { GridRowTemplateContext } from './grid-row-tpl.directive';

// ---- 1) $implicit 必须是单行 FundRow（let-fund 拿到的值）----
declare const ctx: FundRowTemplateContext;
const row: FundRow = ctx.$implicit;

// ---- 2) rowIndex 是 number（let-idx="rowIndex" 的类型）----
const idx: number = ctx.rowIndex;

// ---- 3) 类型错误必须被捕获：若有人把 rowIndex 改坏，下一行会报错 ----
// @ts-expect-error —— rowIndex 是 number，赋值给 string 必须报错
const wrongIndex: string = ctx.rowIndex;

// ---- 4) allRows 是可选字段：传了就一定是 FundRow[] ----
const allRows: FundRow[] | undefined = ctx.allRows;

// ---- 5) 泛型上下文：任意行类型都能精确取到属性 ----
declare const gctx: GridRowTemplateContext<{ id: string; price: number }>;
const price: number = gctx.$implicit.price;
const gidx: number = gctx.rowIndex;

// ---- 6) 泛型守卫的收窄能力：收窄后不再允许访问不存在的属性 ----
declare const dir: GridRowTplDirective<{ id: string; price: number }>;
declare const unknownCtx: unknown;
if (GridRowTplDirective.ngTemplateContextGuard(dir, unknownCtx as GridRowTemplateContext<{ id: string; price: number }>)) {
  // @ts-expect-error —— $implicit 上没有 notExist 属性（若守卫失效、类型退化 any，此行不报错）
  const bad = unknownCtx.$implicit.notExist;
  void bad;
}

// ---- 7) 普通版守卫的收窄能力同理 ----
declare const fdir: FundRowTplDirective;
if (FundRowTplDirective.ngTemplateContextGuard(fdir, ctx)) {
  const nav: number = ctx.$implicit.nav;
  void nav;
}

// 防止未使用告警（文件只贡献类型）
export type { FundRow, FundRowTemplateContext };
