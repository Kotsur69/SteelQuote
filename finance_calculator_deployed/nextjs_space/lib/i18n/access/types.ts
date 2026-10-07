// UI strings of the v2.0 flow / role / hierarchy model, kept apart from lib/translations.ts
// (already 3.6k lines). One file per language implements this shape; useAccessT() picks the
// active one.

import type { AccessErrorCode } from '@/lib/access/errors';
import type { Criterion } from '@/lib/access/ruleEngine';
import type { EffectiveScope, PermissionKey, VisibilityKey } from '@/lib/access/types';

export interface AccessTexts {
  flow: string;
  flows: string;
  role: string;
  level: string;
  superuser: string;
  noFlow: string;
  activeFlow: string;
  switchFlow: string;
  allFlows: string;
  allCreators: string;
  save: string;
  saved: string;
  add: string;
  remove: string;
  delete: string;
  cancel: string;
  active: string;
  inactive: string;
  name: string;
  code: string;
  none: string;
  loadFailed: string;

  nav: {
    access: string;
    reviewQueue: string;
  };

  tabs: {
    flows: string;
    roles: string;
    rules: string;
    simulator: string;
    visibility: string;
  };

  flowsPanel: {
    title: string;
    addFlow: string;
    members: string;
    addMember: string;
    pickUser: string;
    pickRole: string;
    moveToRole: string;
    noMembers: string;
    deactivateHint: string;
  };

  rolesPanel: {
    title: string;
    catalogTitle: string;
    addRole: string;
    addToFlow: string;
    removeFromFlow: string;
    levelsTitle: string;
    addLevel: string;
    kind: string;
    kindChain: string;
    kindParallel: string;
    rank: string;
    sortOrder: string;
    permissions: Record<PermissionKey, string>;
    memberCount: string;
  };

  rulesPanel: {
    title: string;
    addRule: string;
    criterion: string;
    condition: string;
    operator: string;
    threshold: string;
    reference: string;
    unit: string;
    priority: string;
    targetLevel: string;
    appliesTo: string;
    criteria: Record<Criterion, string>;
    completenessTitle: string;
    completenessOk: string;
    unconfigured: string;
    noChainTop: (flow: string, level: string) => string;
    policyTitle: string;
    policies: { escalate_next: string; block: string; escalate_top: string };
    orgScopeTitle: string;
    orgScopes: { team: string; flow: string };
    confirmDelete: string;
  };

  simulator: {
    title: string;
    intro: string;
    creatorRole: string;
    offerMargin: string;
    pglReductionPct: string;
    paymentTermDays: string;
    validFrom: string;
    validTo: string;
    offerValue: string;
    perCriterion: string;
    noValidation: string;
    finalLevel: string;
    approvers: string;
    status: string;
    statusNone: string;
    statusRequired: string;
    statusEscalated: (required: string, resolved: string) => string;
    statusBlocked: string;
    autoSatisfied: string;
    testCases: string;
    run: string;
  };

  visibilityPanel: {
    title: string;
    intro: string;
    columns: Record<VisibilityKey, string>;
    effective: string;
    scopes: Record<EffectiveScope, string>;
    note: string;
    superuserRow: string;
  };

  pyramid: {
    tableView: string;
    pyramidView: string;
    parallel: string;
    outside: string;
    approvesFor: (levels: string) => string;
    empty: string;
    membershipsTitle: string;
    addToFlow: string;
  };

  workflow: {
    awaitingLevels: (levels: string) => string;
    escalated: (required: string, resolved: string) => string;
    approveAndSend: string;
    sentOnBehalf: string;
    noValidationNeeded: string;
    fieldLocked: string;
  };

  errors: Record<AccessErrorCode, string>;
}
