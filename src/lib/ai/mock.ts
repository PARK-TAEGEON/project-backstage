import type { AIProvider } from "./provider";

/** Fixtures only: this adapter does not pretend to infer. */
export function createMockProvider(fixture: unknown): AIProvider {
  return {
    name: "mock",
    async generateJSON(request) {
      request.signal?.throwIfAborted();
      return structuredClone(fixture);
    },
  };
}
