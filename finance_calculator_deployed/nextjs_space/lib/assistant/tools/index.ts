// Registry of the assistant's tools: read tools (plan section 6) and the propose_* action tools
// (section 7), which only store a pending action and show a confirmation card.

import { proposeOfferDraft } from './actions/draft';
import { proposeOfferEdit } from './actions/edit';
import { STATUS_TOOLS } from './actions/status';
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
  proposeOfferDraft,
  proposeOfferEdit,
  ...STATUS_TOOLS,
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function toolByName(name: string): AssistantTool | undefined {
  return BY_NAME.get(name);
}
