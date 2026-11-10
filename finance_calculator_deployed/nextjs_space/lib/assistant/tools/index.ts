// Registry of the assistant's tools. Phase 1 = read tools only; the propose_* action tools
// (docs/ai-assistant-plan.md section 7) join here in phase 3.

import { findClients, findPeople } from './directory';
import { getOffer, myQueue, searchOffers } from './offers';
import { calculateTransport, priceItem } from './pricing';
import { queryMetrics } from './queryMetrics';
import { getApprovalRules, getMyContext, getPgl, listLostReasons } from './reference';
import type { AssistantTool } from './types';

export const TOOLS: readonly AssistantTool[] = [
  getMyContext,
  findPeople,
  findClients,
  queryMetrics,
  searchOffers,
  getOffer,
  myQueue,
  priceItem,
  calculateTransport,
  getPgl,
  listLostReasons,
  getApprovalRules,
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function toolByName(name: string): AssistantTool | undefined {
  return BY_NAME.get(name);
}
