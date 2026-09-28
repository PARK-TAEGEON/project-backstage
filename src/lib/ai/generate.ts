import { z } from "zod";
import type { AIProvider, AIRequest } from "./provider";

export async function generateStructured<T>(provider: AIProvider, request: AIRequest<T>): Promise<T> {
  request.signal?.throwIfAborted();
  const raw = await provider.generateJSON({
    role: request.role,
    systemPrompt: request.systemPrompt,
    input: request.input,
    signal: request.signal,
    jsonSchema: z.toJSONSchema(request.schema),
  });
  request.signal?.throwIfAborted();
  return request.schema.parse(raw);
}
