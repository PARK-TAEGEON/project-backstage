/**
 * 시계 추상화. 실제 서버는 단조 증가 시계(performance.now)를 쓰고,
 * 테스트는 FakeClock으로 시간을 직접 움직인다 (09-ENGINE-RULES 1절: 판정은 서버 단조 시계 기준).
 */
export type TimerId = number;

export interface Clock {
  /** 단조 증가 ms (소수점 포함) */
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
}

export class RealClock implements Clock {
  private seq = 0;
  private handles = new Map<TimerId, NodeJS.Timeout>();
  now(): number {
    return performance.now();
  }
  setTimeout(fn: () => void, ms: number): TimerId {
    const id = ++this.seq;
    const h = setTimeout(() => {
      this.handles.delete(id);
      fn();
    }, Math.max(0, ms));
    this.handles.set(id, h);
    return id;
  }
  clearTimeout(id: TimerId): void {
    const h = this.handles.get(id);
    if (h) clearTimeout(h);
    this.handles.delete(id);
  }
}

/** 테스트용: advance(ms)로 시간을 옮기면 그 사이 타이머가 순서대로 실행된다. */
export class FakeClock implements Clock {
  private t = 0;
  private seq = 0;
  private timers = new Map<TimerId, { at: number; fn: () => void }>();
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): TimerId {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(id: TimerId): void {
    this.timers.delete(id);
  }
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      let next: [TimerId, { at: number; fn: () => void }] | undefined;
      for (const e of this.timers) if (e[1].at <= target && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = target;
  }
}
