import type { GameDefinition, Player, SessionPhase } from "./types";

export function getStartBlocker(players: readonly Player[], game: GameDefinition): string | null {
  if (players.length < game.minPlayers) return `${game.minPlayers}명 이상 모이면 시작할 수 있어요.`;
  if (players.length > game.maxPlayers) return `최대 ${game.maxPlayers}명까지 함께할 수 있어요.`;
  if (new Set(players.map((player) => player.id)).size !== players.length) return "중복된 플레이어가 있어요.";
  if (!players.every((player) => player.isReady)) return "모두 준비를 마쳐야 해요.";
  return null;
}

/** Pure transition helper; authoritative commands/auth/time checks are a later milestone. */
export function nextPhase(game: GameDefinition, current: SessionPhase): SessionPhase | null {
  const index = game.phases.indexOf(current);
  if (index === -1) throw new Error(`Unsupported phase: ${current}`);
  return game.phases[index + 1] ?? null;
}
