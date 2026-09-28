import type { z } from "zod";

export type AIRole = "director" | "mission" | "referee" | "social-analyst" | "editor";
export interface AIRequest<T> {
  role: AIRole;
  systemPrompt: string;
  input: Record<string, unknown>;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}
/** Adapters return untrusted JSON. The shared boundary validates every response. */
export interface AIProvider {
  readonly name: string;
  generateJSON(request: Omit<AIRequest<unknown>, "schema"> & { jsonSchema: Record<string, unknown> }): Promise<unknown>;
}
