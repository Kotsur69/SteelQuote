// Contract of an assistant tool (docs/ai-assistant-plan.md section 6): a strict Zod schema for
// the model's input, and a run() that executes with the ASKING USER's access context. A tool
// returns compact JSON for the model plus optional answer blocks for the panel.

import type { z } from 'zod';
import type { AccessContext } from '../../access/types';
import type { Db } from '../../access/config';
import type { AnswerBlock } from '../blocks';
import type { Lang } from '../format';

export interface ToolRuntime {
  ctx: AccessContext;
  /** YYYY-MM-DD: the database clock in production, a fixed date in the eval. */
  today: string;
  lang: Lang;
  db: Db;
}

export interface ToolOutput {
  /** What the model sees. Numbers it may quote must be in here. */
  result: Record<string, unknown>;
  /** What the panel renders next to the model's text. */
  blocks?: AnswerBlock[];
}

export interface AssistantTool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  run: (input: unknown, rt: ToolRuntime) => Promise<ToolOutput>;
}

/** Ties run()'s input type to the schema; the loop validates before calling run. */
export function defineTool<S extends z.ZodTypeAny>(tool: {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, rt: ToolRuntime) => Promise<ToolOutput>;
}): AssistantTool {
  return tool as AssistantTool;
}

export const pick = (lang: Lang, pl: string, en: string): string => (lang === 'pl' ? pl : en);
