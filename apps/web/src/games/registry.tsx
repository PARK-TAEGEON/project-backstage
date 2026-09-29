/**
 * 웹 쪽 게임 화면 등록부. 서버 registry와 같은 id로 화면 컴포넌트를 등록한다.
 * 새 게임 추가: games/<id>/View.tsx를 만들고 여기 한 줄 추가.
 */
import type { ComponentType } from 'react';
import type { PlayerPublic, RoomView } from '@backstage/shared';
import { NunchiView } from './nunchi/View';
import { ForbesView } from './forbes/View';
import { KktView } from './kkt/View';
import { WordView } from './word/View';
import { BanView } from './ban/View';

export interface GameViewProps<V = unknown> {
  view: V;
  /** view를 받은 시각 (performance.now) — 남은 시간 계산용 */
  receivedAt: number;
  room: RoomView;
  meId: string;
  players: PlayerPublic[];
  sendAction: (action: unknown) => void;
}

export interface WebGame {
  View: ComponentType<GameViewProps<any>>;
  /** 채팅이 게임 입력인가 (눈치게임) — 채팅 입력칸을 강조한다 */
  chatIsInput?: boolean;
  chatHint?: string;
}

export const WEB_GAMES: Record<string, WebGame> = {
  nunchi: { View: NunchiView, chatIsInput: true, chatHint: '숫자 입력 (1~8)' },
  forbes: { View: ForbesView },
  kkt: { View: KktView },
  word: { View: WordView, chatIsInput: true, chatHint: '평소처럼 채팅하면서 내 단어를 몰래…' },
  ban: { View: BanView, chatIsInput: true, chatHint: '말조심! 내 금지어는 나만 몰라요' },
};
