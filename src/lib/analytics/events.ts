import type { GameId } from "@/lib/game/types";

export type AnalyticsEventName =
  | "room_created" | "player_joined" | "game_started" | "game_completed"
  | "play_again_clicked" | "invite_link_copied" | "game_abandoned" | "result_shared";

export interface AnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  occurredAt: string;
  context: { roomId: string; sessionId?: string; gameId?: GameId; playerCount?: number };
}
export type AnalyticsSink = (event: AnalyticsEvent) => void;

/** Inject persistence later. Never record nicknames, chat text or secret instructions here. */
export function createAnalytics(sink: AnalyticsSink) {
  return (name: AnalyticsEventName, context: AnalyticsEvent["context"]) => {
    sink({ id: crypto.randomUUID(), name, occurredAt: new Date().toISOString(), context });
  };
}
