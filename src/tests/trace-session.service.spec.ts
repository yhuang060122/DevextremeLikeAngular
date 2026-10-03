import { TestBed } from '@angular/core/testing';
import type { WritableSignal } from '@angular/core';
import { TraceSessionService } from '../app/trace-session/trace-session.service';

describe('TraceSessionService', () => {
  let svc: TraceSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(TraceSessionService);
  });

  it('初始为 null（未登录 / 未签发）', () => {
    expect(svc.traceSessionId()).toBeNull();
  });

  it('setTraceSessionId 写入后可读，clear 后回到 null', () => {
    svc.setTraceSessionId('sid-abc');
    expect(svc.traceSessionId()).toBe('sid-abc');

    svc.clear();
    expect(svc.traceSessionId()).toBeNull();
  });

  it('setTraceSessionId(null) 等价于清空', () => {
    svc.setTraceSessionId('sid-abc');
    svc.setTraceSessionId(null);
    expect(svc.traceSessionId()).toBeNull();
  });

  it('traceSessionId 是只读 signal：外部 set 会抛错且不改变状态', () => {
    svc.setTraceSessionId('sid-abc');

    const writable = svc.traceSessionId as unknown as WritableSignal<string | null>;
    expect(() => writable.set('hack')).toThrow();
    expect(svc.traceSessionId()).toBe('sid-abc');
  });
});
