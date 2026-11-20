// Shared offer service (docs/ai-assistant-plan.md 7.1): the business rules of every offer
// write, used by the /api/offers routes AND by the assistant's confirmation endpoint, so a
// confirmed assistant action can never follow different rules than the same button in the UI.
//
// Every function takes an open transaction; wrap calls in inTransaction().

export { createOffer, duplicateOffer, offerNameOf, type CreateInput, type DuplicateOverrides, type OfferData } from './create';
export { updateOffer, deepEqual, type UpdateInput } from './update';
export {
  approveComment, approveOffer, recordDecision, rejectOffer, sendOffer, submitOffer,
  MAX_APPROVE_COMMENT_LENGTH, type DecisionInput,
} from './transitions';
export { inTransaction, type ServiceError, type ServiceResult } from './result';
