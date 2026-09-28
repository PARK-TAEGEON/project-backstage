import { secretDirector } from "./secret-director";
import { everybodyKnows } from "./everybody-knows-except-you";
import type { GameDefinition, GameId } from "@/lib/game/types";

export const games: Record<GameId, GameDefinition> = {
  "secret-director": secretDirector,
  "everybody-knows-except-you": everybodyKnows,
};
