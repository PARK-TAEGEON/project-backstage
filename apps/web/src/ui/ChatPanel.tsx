import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, PlayerPublic } from '@backstage/shared';
import { Avatar } from './Avatar';
import { T } from '../content/ko';
import s from './ChatPanel.module.css';

/** 채팅. 눈치게임처럼 채팅이 곧 게임 입력인 경우 emphasize로 입력칸을 강조한다. */
export function ChatPanel({
  messages,
  players,
  meId,
  onSend,
  emphasize = false,
  hint,
}: {
  messages: ChatMessage[];
  players: PlayerPublic[];
  meId: string;
  onSend: (text: string) => void;
  emphasize?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = new Map(players.map((p) => [p.id, p]));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (emphasize) inputRef.current?.focus();
  }, [emphasize]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <section className={`${s.panel} ${emphasize ? s.emph : ''}`} aria-label="채팅">
      <div className={s.list} ref={listRef} aria-live="polite">
        {messages.map((m) => {
          if (m.kind !== 'user') {
            return (
              <div key={m.id} className={`${s.sys} ${m.kind === 'game' ? s.game : ''}`}>
                {m.text}
              </div>
            );
          }
          const p = m.from ? byId.get(m.from) : undefined;
          const mine = m.from === meId;
          return (
            <div key={m.id} className={`${s.msg} ${mine ? s.mine : ''}`}>
              {!mine && p && <Avatar avatar={p.avatar} size={26} />}
              <div className={s.bubbleWrap}>
                {!mine && <span className={s.name}>{p?.nickname ?? '나간 사람'}</span>}
                <span className={`${s.bubble} ${/^[1-8]$/.test(m.text) ? s.num : ''}`}>{m.text}</span>
              </div>
            </div>
          );
        })}
      </div>
      <form className={s.form} onSubmit={submit}>
        <input
          ref={inputRef}
          className="input"
          value={text}
          maxLength={200}
          placeholder={hint ?? T.chat.placeholder}
          onChange={(e) => setText(e.target.value)}
          aria-label={T.chat.placeholder}
          enterKeyHint="send"
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          {T.chat.send}
        </button>
      </form>
    </section>
  );
}
