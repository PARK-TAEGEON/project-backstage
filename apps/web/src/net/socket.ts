/** 소켓 연결과 브라우저 저장값(세션·프로필). 저장소 접근은 실패해도 앱이 동작하도록 감싼다. */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, Profile, ServerToClient, SessionInfo } from '@backstage/shared';

export type AppSocket = Socket<ServerToClient, ClientToServer>;

export const socket: AppSocket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

const KEY_SESSION = 'backstage.session';
const KEY_PROFILE = 'backstage.profile';

function read<T>(key: string, store: Storage | undefined): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown, store: Storage | undefined) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경 — 무시 */
  }
}
const session = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
const local = () => (typeof localStorage !== 'undefined' ? localStorage : undefined);

/** 방 세션은 탭 단위(sessionStorage) — 같은 브라우저에서 탭 여러 개로 테스트할 수 있게 */
export const savedSession = {
  get: () => read<SessionInfo>(KEY_SESSION, session()),
  set: (s: SessionInfo | null) => write(KEY_SESSION, s, session()),
};

/** 닉네임·캐릭터는 브라우저에 기억 */
export const savedProfile = {
  get: () => read<Profile>(KEY_PROFILE, local()),
  set: (p: Profile) => write(KEY_PROFILE, p, local()),
};

let seq = 0;
export const newRequestId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
