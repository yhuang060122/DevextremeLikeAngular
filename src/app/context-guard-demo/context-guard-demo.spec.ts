import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FundTableComponent } from './fund-table.component';
import { GenericGridComponent } from './generic-grid.component';
import { FundRow, FundRowTplDirective } from './fund-row-tpl.directive';
import { GridRowTplDirective } from './grid-row-tpl.directive';

/**
 * 运行时测试：验证插槽行为（类型安全由 type-asserts.ts + ng build 的 strictTemplates 保证）。
 *  1. 表格每行都通过插槽渲染一次 —— 上下文是单行记录（不是数组）；
 *  2. rowIndex 从 0 开始递增；
 *  3. passAllRows=true 时插槽能拿到完整数组；
 *  4. 泛型指令复用第二种行类型正常。
 */

@Component({
  selector: 'app-host-fund',
  standalone: true,
  imports: [FundTableComponent, FundRowTplDirective],
  template: `
    <app-fund-table [data]="rows()" [passAllRows]="passAllRows">
      <ng-template appFundRowTpl let-fund let-idx="rowIndex" let-all="allRows">
        <span class="slot-code">{{ fund.fundCode }}</span>
        <span class="slot-idx">{{ idx }}</span>
        <span class="slot-all">{{ all?.length ?? 'none' }}</span>
      </ng-template>
    </app-fund-table>
  `,
})
class HostFund {
  rows = signal<FundRow[]>([
    { id: 'f1', fundCode: '110022', fundName: '测试基金A', nav: 3.21 },
    { id: 'f2', fundCode: '005827', fundName: '测试基金B', nav: 1.87 },
  ]);
  passAllRows = false;
}

@Component({
  selector: 'app-host-generic',
  standalone: true,
  imports: [GenericGridComponent, GridRowTplDirective],
  template: `
    <app-generic-grid [data]="rows">
      <ng-template appGridRowTpl let-tx let-idx="rowIndex">
        <span class="slot-tx">{{ tx.fundCode }}·{{ tx.action }}</span>
        <span class="slot-tx-idx">{{ idx }}</span>
      </ng-template>
    </app-generic-grid>
  `,
})
class HostGeneric {
  rows = [
    { id: 't1', fundCode: '110022', action: '申购', amount: 5000, fee: 7.5 },
    { id: 't2', fundCode: '005827', action: '赎回', amount: 12000, fee: 18 },
  ];
}

describe('FundTableComponent 行插槽', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostFund] }).compileComponents();
  });

  it('插槽按行数执行 N 次，上下文是单行记录 + 递增 rowIndex', () => {
    const fixture = TestBed.createComponent(HostFund);
    fixture.detectChanges();

    const codes = [...fixture.nativeElement.querySelectorAll('.slot-code')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(codes).toEqual(['110022', '005827']);

    const idxs = [...fixture.nativeElement.querySelectorAll('.slot-idx')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(idxs).toEqual(['0', '1']);
  });

  it('默认不传 allRows（可选字段与运行时对齐）', () => {
    const fixture = TestBed.createComponent(HostFund);
    fixture.detectChanges();
    const alls = [...fixture.nativeElement.querySelectorAll('.slot-all')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(alls).toEqual(['none', 'none']);
  });

  it('passAllRows=true 时插槽拿到完整数组', () => {
    const fixture = TestBed.createComponent(HostFund);
    fixture.componentInstance.passAllRows = true;
    fixture.detectChanges();
    const alls = [...fixture.nativeElement.querySelectorAll('.slot-all')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(alls).toEqual(['2', '2']);
  });

  it('行数变化后插槽重新渲染（@for track 生效）', () => {
    const fixture = TestBed.createComponent(HostFund);
    fixture.detectChanges();
    fixture.componentInstance.rows.set([
      ...fixture.componentInstance.rows(),
      { id: 'f3', fundCode: '161725', fundName: '测试基金C', nav: 0.94 },
    ]);
    fixture.detectChanges();
    const codes = [...fixture.nativeElement.querySelectorAll('.slot-code')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(codes).toEqual(['110022', '005827', '161725']);
  });
});

describe('GenericGridComponent 泛型插槽', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostGeneric] }).compileComponents();
  });

  it('同一泛型指令复用第二种行类型 Transaction', () => {
    const fixture = TestBed.createComponent(HostGeneric);
    fixture.detectChanges();

    const txns = [...fixture.nativeElement.querySelectorAll('.slot-tx')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(txns).toEqual(['110022·申购', '005827·赎回']);

    const idxs = [...fixture.nativeElement.querySelectorAll('.slot-tx-idx')].map(
      (e) => (e as HTMLElement).textContent,
    );
    expect(idxs).toEqual(['0', '1']);
  });
});
