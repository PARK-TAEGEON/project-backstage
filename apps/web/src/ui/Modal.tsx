/** 작은 팝업 창. 배경을 누르거나 Esc를 누르면 닫힌다. */
import { useEffect, useRef, type ReactNode } from 'react';
import s from './Modal.module.css';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${s.box} pop-in`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className={s.head}>
          <h2 className="display">{title}</h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>
  );
}
