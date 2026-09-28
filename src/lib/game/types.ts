export type GameId = "secret-director" | "everybody-knows-except-you";
export type SessionPhase = "lobby" | "playing" | "guessing" | "reveal" | "results";
export interface Room {
  id: string;
  code: string;
  hostPlayerId: string;
  gameId: GameId;
  createdAt: string;
}
export interface Player {
  id: string;
  roomId: string;
  nickname: string;
  isReady: boolean;
}
export interface GameSession {
  id: string;
  roomId: string;
  gameId: GameId;
  phase: SessionPhase;
  round: number;
  startedAt: string | null;
  endsAt: string | null;
}
/** Server/recipient only before reveal. Never include in public room snapshots. */
export interface PrivateInstruction {
  id: string;
  sessionId: string;
  recipientPlayerId: string;
  text: string;
  status: "pending" | "succeeded" | "failed" | "unresolved";
}
export interface DirectorEvent {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
}
export interface Message {
  id: string;
  sessionId: string;
  playerId: string;
  text: string;
  createdAt: string;
}
export interface Vote {
  sessionId: string;
  voterPlayerId: string;
  targetPlayerId: string;
  guess: string;
}
export interface GameResult {
  sessionId: string;
  summary: string;
  mvpPlayerId: string | null;
  highlights: { messageIds: string[]; caption: string }[];
}
export interface GameDefinition {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  durationSeconds: number;
  maxDirectorEvents: number;
  rules: readonly string[];
  phases: readonly SessionPhase[];
  promptContext: string;
  resultPolicy: string;
}
