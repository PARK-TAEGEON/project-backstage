/**
 * 게임 등록부. 새 게임은 여기 한 줄만 추가하면 로비 목록·방 설정·관리자 통계에 자동으로 나타난다.
 * 웹 화면 쪽은 apps/web/src/games/registry.tsx 에 같은 id로 화면을 등록한다.
 */
import type { GameMeta } from '@backstage/shared';
import type { ServerGame } from './types.js';
import { nunchi } from './nunchi/index.js';
import { forbes } from './forbes/index.js';
import { kkt } from './kkt/index.js';
import { word } from './word/index.js';
import { ban } from './ban/index.js';

export const GAMES: ServerGame[] = [nunchi, forbes, kkt, word, ban];

export const GAME_METAS: GameMeta[] = GAMES.map((g) => g.meta);

export function getGame(id: string): ServerGame | undefined {
  return GAMES.find((g) => g.meta.id === id);
}
