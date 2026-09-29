/**
 * 전광판 — 게임이 바뀔 때 게임 이름·주제를 크게 띄우는 공통 부품 (08-UI-NOTES).
 * 당선 발표, 최종 순위 등 “발표” 연출에도 같은 부품을 쓴다.
 */
import type { ReactNode } from 'react';
import s from './Marquee.module.css';

export function Marquee({ kicker, title, subtitle, children, size = 'lg' }: { kicker?: string; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <section className={`${s.board} ${size === 'md' ? s.md : ''} pop-in`} aria-live="polite">
      <div className={s.bulbs} aria-hidden />
      <div className={s.inner}>
        {kicker && <div className={s.kicker}>{kicker}</div>}
        <h1 className={`${s.title} display`}>{title}</h1>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

/** 화면 중앙 3·2·1 카운트다운 */
export function Countdown({ ms }: { ms: number }) {
  const n = Math.ceil(ms / 1000);
  if (n <= 0) return null;
  return (
    <div className={s.countdown} role="timer" aria-live="assertive">
      <span key={n} className={`${s.count} display pop-in`}>
        {n}
      </span>
    </div>
  );
}

/** 남은 시간 막대 */
export function TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const urgent = remainingMs < 3000;
  return (
    <div className={s.timer} role="progressbar" aria-valuenow={Math.ceil(remainingMs / 1000)} aria-valuemin={0} aria-valuemax={Math.ceil(totalMs / 1000)}>
      <div className={`${s.timerFill} ${urgent ? s.urgent : ''}`} style={{ width: `${pct}%` }} />
      <span className={s.timerText}>{Math.ceil(remainingMs / 1000)}초</span>
    </div>
  );
}
