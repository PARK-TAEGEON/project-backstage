import "server-only";
import { createMockProvider } from "./mock";
import type { AIProvider } from "./provider";

export function getAIProvider(mockFixture: unknown): AIProvider {
  const provider = process.env.AI_PROVIDER || "mock";
  if (provider === "mock") return createMockProvider(mockFixture);
  throw new Error(`AI provider '${provider}' is not implemented. Add a server-side adapter before enabling it.`);
}
