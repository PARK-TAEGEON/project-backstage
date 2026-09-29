import { useRoom } from '../state/RoomProvider';

export function Toasts() {
  const { toasts } = useRoom();
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 60,
        width: 'min(92vw, 420px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rise"
          style={{
            background: 'var(--c-text)',
            color: 'var(--c-bg)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            textAlign: 'center',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
