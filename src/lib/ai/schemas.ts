import { z } from "zod";

export const missionBatchSchema = z.object({
  instructions: z.array(z.object({
    recipientPlayerId: z.string().min(1),
    text: z.string().min(1).max(300),
  }).strict()).min(1).max(8),
}).strict();
export const directorEventSchema = z.object({ text: z.string().min(1).max(240) }).strict();
export const refereeSchema = z.object({
  status: z.enum(["succeeded", "failed", "unresolved"]),
  evidenceMessageIds: z.array(z.string().min(1)).max(20),
  reason: z.string().min(1).max(500),
}).strict();
export const editorSchema = z.object({
  summary: z.string().min(1).max(1000),
  mvpPlayerId: z.string().min(1).nullable(),
  highlights: z.array(z.object({
    messageIds: z.array(z.string().min(1)).min(1).max(10),
    caption: z.string().min(1).max(240),
  }).strict()).max(5),
}).strict();
export const socialAnalysisSchema = z.object({ stalled: z.boolean(), suggestion: z.string().max(240) }).strict();
