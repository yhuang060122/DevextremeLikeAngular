import { Component, signal } from '@angular/core';
import { FundTableComponent } from './fund-table.component';
import { GenericGridComponent } from './generic-grid.component';
import { FundRow, FundRowTplDirective } from './fund-row-tpl.directive';
import { GridRowTplDirective } from './grid-row-tpl.directive';

/** 泛型复用演示的第二种行类型：交易流水 */
export interface Transaction {
  id: string;
  fundCode: string;
  action: '申购' | '赎回';
  amount: number;
  fee: number;
}

/**
 * 测试页面：ngTemplateContextGuard（Angular v21+，Standalone）。
 *
 * 验证内容：
 *  1. 普通版 —— 基金表格行插槽，let-fund 自动推断为 FundRow，消除 any；
 *  2. 泛型通用版 —— 同一指令复用任意行类型（Transaction）；
 *  3. 上下文扩展 —— allRows 可选字段，类型与运行时保持同步；
 *  4. 插槽内事件绑定正常（点击按钮写入日志）。
 */
@Component({
  selector: 'app-context-guard-demo',
  imports: [FundTableComponent, GenericGridComponent, FundRowTplDirective, GridRowTplDirective],
  templateUrl: './context-guard-demo.html',
})
export class ContextGuardDemo {
  // ---- 普通版：基金列表 ----
  protected readonly funds = signal<FundRow[]>([
    { id: 'f1', fundCode: '110022', fundName: '易方达消费行业', nav: 3.214 },
    { id: 'f2', fundCode: '005827', fundName: '易方达蓝筹精选', nav: 1.876 },
    { id: 'f3', fundCode: '161725', fundName: '招商中证白酒', nav: 0.941 },
  ]);
  protected readonly passAllRows = signal(false);

  // ---- 泛型版：交易流水（第二种行类型）----
  protected readonly txns = signal<Transaction[]>([
    { id: 't1', fundCode: '110022', action: '申购', amount: 5000, fee: 7.5 },
    { id: 't2', fundCode: '005827', action: '赎回', amount: 12000, fee: 18 },
    { id: 't3', fundCode: '161725', action: '申购', amount: 3000, fee: 4.5 },
  ]);

  // ---- 事件日志（证明插槽内事件绑定正常）----
  protected readonly log = signal<string[]>([]);

  /** 页面代码面板的源码示例（放 TS 里避免模板解析 { } / < >） */
  protected readonly code = {
    fundUsage: `<app-fund-table [data]="funds()"
               [passAllRows]="passAllRows()">
  <ng-template appFundRowTpl
               let-fund
               let-idx="rowIndex"
               let-all="allRows">
    <!-- ✅ fund 自动推断为 FundRow -->
    <div>{{ fund.fundName }} · NAV {{ fund.nav }}</div>
  </ng-template>
</app-fund-table>`,
    fundGuard: `@Directive({ selector: '[appFundRowTpl]', standalone: true })
export class FundRowTplDirective {
  // 绑在 <ng-template> 上时，Angular 注入模板蓝图
  constructor(public readonly template:
    TemplateRef<FundRowTemplateContext>) {}

  // 编译期类型守卫 —— 运行时被擦除
  static ngTemplateContextGuard(
    _dir: FundRowTplDirective,
    ctx: FundRowTemplateContext,
  ): ctx is FundRowTemplateContext {
    return true; // 固定写法
  }
}`,
    fundRender: `@for (row of data(); track row.id) {
  <ng-container
    [ngTemplateOutlet]="rowTpl()"
    [ngTemplateOutletContext]="rowContext(row, $index)" />
}
// rowContext(): FundRowTemplateContext
//   → 类型与运行时对象完全一致（同步维护）`,
    genericGuard: `export type GridRowTemplateContext<TRow> = {
  $implicit: TRow;
  rowIndex: number;
};

@Directive({ selector: '[appGridRowTpl]', standalone: true })
export class GridRowTplDirective<TRow> {
  constructor(public readonly template:
    TemplateRef<GridRowTemplateContext<TRow>>) {}

  // ⚠️ 守卫泛型与指令泛型必须同一个 TRow
  static ngTemplateContextGuard<TRow>(
    _dir: GridRowTplDirective<TRow>,
    ctx: GridRowTemplateContext<TRow>,
  ): ctx is GridRowTemplateContext<TRow> {
    return true;
  }
}`,
    genericUsage: `<app-generic-grid [data]="txns()"
                rowTypeLabel="Transaction">
  <ng-template appGridRowTpl
               let-tx
               let-idx="rowIndex">
    <!-- ✅ tx 自动推断为 Transaction -->
    <span>{{ tx.action }} {{ tx.amount }}</span>
  </ng-template>
</app-generic-grid>`,
  };

  protected addFund() {
    const next = this.funds().length + 1;
    this.funds.update((list) => [
      ...list,
      { id: `f${next}`, fundCode: `00${1000 + next}`, fundName: `演示基金 ${next}`, nav: 1 + next / 10 },
    ]);
    this.pushLog(`＋ 新增基金（当前共 ${this.funds().length} 行，插槽按新数组重新渲染）`);
  }

  /** 插槽里的按钮：参数类型是 FundRow —— 证明 let-fund 不是 any */
  protected inspect(fund: FundRow) {
    this.pushLog(`🔍 查看「${fund.fundName}」 NAV=${fund.nav.toFixed(3)}（fund 参数类型：FundRow）`);
  }

  /** 泛型插槽里的按钮：参数类型是 Transaction */
  protected cancel(tx: Transaction) {
    this.pushLog(`✕ 撤单「${tx.fundCode}」${tx.action} ¥${tx.amount.toFixed(2)}（tx 参数类型：Transaction）`);
  }

  private pushLog(line: string) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.log.update((l) => [`${time}  ${line}`, ...l].slice(0, 6));
  }
}
