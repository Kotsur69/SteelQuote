// Shared types of the configurable flow / role / hierarchy model (migrations 025-029, see
// docs/flows-v2-plan.md). Pure declarations - safe to import from client components.

export type LevelKind = 'chain' | 'parallel';

export interface HierarchyLevel {
  id: number;
  code: string;
  name: string;
  kind: LevelKind;
  /** Order inside the N-chain (N0 = 0). null for parallel levels (NPR). */
  chainRank: number | null;
  sortOrder: number;
}

export const PERMISSION_KEYS = [
  'canCreateOffer',
  'canEditOwnBeforeSubmit',
  'canSubmitToValidation',
  'canApproveReject',
  'canChangePglBase',
  'canChangePriceMargin',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Record<PermissionKey, boolean>;

export const VISIBILITY_KEYS = [
  'seeOwn',
  'seeTeam',
  'seeBranch',
  'seeRegion',
  'seeAllInFlow',
  'seeAllFlows',
  'seeAwaitingMyReview',
] as const;

export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];
export type VisibilityFlags = Record<VisibilityKey, boolean>;

/** Broadest scope a visibility row grants - the sheet's "Efektywny zakres" column. */
export type EffectiveScope =
  | 'allFlows'
  | 'allInFlow'
  | 'region'
  | 'branch'
  | 'team'
  | 'own'
  | 'reviewQueueOnly'
  | 'none';

/** A role as it exists inside one flow. */
export interface FlowRole {
  flowId: number;
  roleId: number;
  roleCode: string;
  roleName: string;
  level: HierarchyLevel;
  permissions: Permissions;
}

/** One membership of the signed-in user: the flow, the role there, and what it may see. */
export interface Membership extends FlowRole {
  flowCode: string;
  flowName: string;
  visibility: VisibilityFlags;
}

export interface FlowSummary {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export type ConflictPolicy = 'escalate_next' | 'block' | 'escalate_top';
export type OrgScopeFallback = 'team' | 'flow';

/** What the browser gets from /api/auth/me - enough to render UI, never trusted by the API. */
export interface AccessSummary {
  userId: number;
  email: string;
  fullName: string | null;
  isSuperuser: boolean;
  /** May approve/reject in at least one flow (review panel, dashboard link). */
  isApprover: boolean;
  activeFlowId: number | null;
  flows: FlowSummary[];
  memberships: Membership[];
  /** Permissions in the active flow (all true for the superuser, all false without a flow). */
  activePermissions: Permissions;
  /** Role in the active flow; null for the superuser or without a membership. */
  activeRoleName: string | null;
  activeLevelCode: string | null;
}

export interface AccessContext {
  userId: number;
  email: string;
  fullName: string | null;
  isSuperuser: boolean;
  memberships: Membership[];
  /** Flow new offers are created in. null = no membership and not a superuser. */
  activeFlowId: number | null;
  /** Flows the user may switch to (memberships; every active flow for a superuser). */
  flows: FlowSummary[];
  /** Users sharing a team with this user (team_members, either direction), self excluded. */
  teamUserIds: number[];
  orgScopeFallback: OrgScopeFallback;
}
