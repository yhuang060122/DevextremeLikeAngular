import { Component, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MyToolbarA } from './toolbar-a';
import { MyToolbarB } from './toolbar-b';
import { MyToolbarC } from './toolbar-c';
import { MyToolbarItem } from './toolbar-item.directive';
import { DxoToolbar } from './dxo-toolbar.directive';
import { MyGrid, GridRow } from './my-grid';

export type FilterStatus = '全部' | '进行中' | '已完成';

/**
 * 演示页面：三种"可扩展 Toolbar"插槽方案。
 *
 * 三个 Demo 共享同一份状态（count / search / status / log），
 * 用来证明一件事：无论用哪种插槽，里面的事件绑定和组件上下文都完全正常。
 */
@Component({
  selector: 'app-slots-demo',
  imports: [NgTemplateOutlet, MyToolbarA, MyToolbarB, MyToolbarC, MyToolbarItem, DxoToolbar, MyGrid],
  templateUrl: './slots-demo.html',
})
export class SlotsDemo {
  // ---- 三个 Demo 共享的演示状态 ----
  protected readonly count = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<FilterStatus>('全部');
  protected readonly refreshing = signal(false);
  protected readonly log = signal<string[]>([]);

  // ---- Demo D（dxo 模式）：通过指令控制 Grid 的内部 toolbar ----
  protected readonly tbPosition = signal<'top' | 'bottom'>('top');
  protected readonly tbVisible = signal(true);
  protected readonly gridRows: GridRow[] = [
    { id: 1, name: '苹果', status: '已完成', amount: 128 },
    { id: 2, name: '香蕉', status: '进行中', amount: 45.5 },
    { id: 3, name: '橙子', status: '已完成', amount: 76 },
    { id: 4, name: '梨', status: '进行中', amount: 12.8 },
  ];

  // ---- 插槽里按钮/输入框触发的事件 ----
  protected add() {
    const next = this.count() + 1;
    this.count.set(next);
    this.pushLog(`＋ 新增了一条记录（当前共 ${next} 条）`);
  }

  protected batch() {
    this.pushLog(`⚡ 批量操作：对"${this.status()}"状态的数据执行（示例）`);
  }

  protected onSearch(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.search.set(value);
  }

  protected setStatus(e: Event) {
    this.status.set((e.target as HTMLSelectElement).value as FilterStatus);
  }

  protected refresh() {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    setTimeout(() => {
      this.refreshing.set(false);
      this.pushLog(`⟳ 刷新完成（筛选：${this.status()}，关键词："${this.search() || '无'}"）`);
    }, 600);
  }

  private pushLog(line: string) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.log.update((l) => [`${time}  ${line}`, ...l].slice(0, 6));
  }
}
