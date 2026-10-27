export interface AdminOverview {
  totals: {
    organizations: number;
    activeOrganizations: number;
    pendingOrganizations: number;
    suspendedOrganizations: number;
    users: number;
    activeUsers: number;
    platformAdmins: number;
    trips: number;
    quotes: number;
    properties: number;
    customers: number;
    jobs: number;
    pendingEmails: number;
    failedEmails: number;
    documents: number;
    announcements: number;
    activeGrants: number;
  };
  growth: { organizations: number; users: number; trips: number; quotes: number; jobs: number };
  activity: { date: string; organizations: number; users: number; trips: number; quotes: number; jobs: number; auditEvents: number }[];
  jobsByStatus: { status: string; n: number }[];
  quotesByStatus: { status: string; n: number }[];
  organizationsByTypeStatus: { type: string; status: string; n: number }[];
  recentOrganizations: AdminOrganizationRow[];
  recentAudit: AdminAuditRow[];
  attention: AdminJobRow[];
  attentionTotal: number;
  providerHealth: ProviderHealth[];
  email: { pending: number; sent: number; failed: number };
  plans: { plan: string; status: string; n: number }[];
  settings: { signupsEnabled: boolean; maintenanceMode: boolean; supportEmail: string };
  system: SystemInfo;
  alerts: { tone: "info" | "success" | "warning" | "danger"; title: string; body: string; href?: string }[];
  generatedAt: string;
}

export interface SystemInfo {
  apiVersion: string;
  environment: string;
  appBaseUrl: string;
  bindings: { database: boolean; media: boolean; kv: boolean; queue: boolean; workflow: boolean; workersAi: boolean };
  integrations: {
    emailProvider: string;
    emailFrom: string | null;
    emailConfigured: boolean;
    routingProvider: string;
    routingConfigured: boolean;
    externalProviderAllowList: string;
    hotelbedsConfigured: boolean;
    amadeusConfigured: boolean;
    googleHotelsConfigured: boolean;
    openStreetMapEnabled: boolean;
    mockProviderAllowed: boolean;
    externalLlmConfigured: boolean;
    mfaConfigured: boolean;
    turnstileConfigured: boolean;
  };
}

export interface ProviderHealth {
  providerKey: string;
  calls: number;
  errors: number;
  avgLatencyMs: number;
  lastCallAt: string | null;
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  organizationType: "tour_operator" | "hotel_management" | string;
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  tripCount: number;
  quoteCount: number;
  propertyCount: number;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  organizationType: string;
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubscription {
  plan: string;
  status: string;
  seatLimit: number;
  monthlyOptimisationLimit: number;
  currentPeriodEnd: string | null;
}

export interface AdminMember {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  userStatus: string;
  platformRole: string | null;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  lastSeenAt: string | null;
}

export interface AdminOrganizationDetail {
  organization: AdminOrganization;
  subscription: AdminSubscription | null;
  counts: { trips: number; quotes: number; properties: number; jobs: number };
  usage: {
    trips: number;
    quotes: number;
    properties: number;
    customers: number;
    jobs: number;
    members: number;
    documents: number;
    storageBytes: number;
    pendingEmails: number;
    failedEmails: number;
    notifications: number;
    lastActivityAt: string | null;
  };
  members: AdminMember[];
  accessGrants: AccessGrant[];
  adminActions: AdminAuditRow[];
  supportAccessActive: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  platformRole: string | null;
  emailVerifiedAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  mfaEnabled: boolean;
  lastSeenAt: string | null;
  membershipCount: number;
  organizations: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  recoveryCodesRemaining: number;
  activeSessions: number;
  userAgent: string | null;
  created: { trips: number; quotes: number; jobs: number };
}

export interface AdminUserMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: string;
  organizationStatus: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface AdminSession {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  active: boolean;
}

export interface AdminUserDetailResponse {
  user: AdminUserDetail;
  memberships: AdminUserMembership[];
  sessions: AdminSession[];
  audit: AdminAuditRow[];
  ownedOrganizations: { id: string; name: string }[];
}

export interface AdminJobRow {
  id: string;
  organizationId: string;
  organizationName: string;
  tripRequestId: string;
  tripTitle: string | null;
  status: string;
  progress: number;
  stage: string | null;
  attempt: number;
  errorCode: string | null;
  errorSummary: string | null;
  algorithmVersion: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
}

export interface AdminJobDetail extends AdminJobRow {
  itineraryId: string;
  request: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  scoring: Record<string, unknown> | null;
  resultSummary: Record<string, unknown> | null;
  fx: unknown;
  candidateCount: number;
  manuallyModifiedCount: number;
  organizationStatus: string;
  organizationSlug: string;
  tenantAccess: boolean;
}

export interface AdminAuditRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  metadataRestricted?: boolean;
  requestId: string | null;
  createdAt: string;
}

export interface AdminEmailRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  toEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning" | "danger";
  status: "draft" | "active" | "archived";
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessGrant {
  id: string;
  platformUserId: string;
  platformUserName: string | null;
  platformUserEmail: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface PlatformSettings {
  signupsEnabled: boolean;
  maintenanceMode: boolean;
  supportEmail: string;
  defaultSeatLimit: number;
  defaultOptimisationLimit: number;
  announcementBannerEnabled: boolean;
}

export interface PlatformSettingsResponse {
  settings: PlatformSettings;
  platformAdmins: { id: string; email: string; displayName: string; status: string; lastSeenAt: string | null }[];
  tableCounts: { table: string; rows: number }[];
  email: { pending: number; sent: number; failed: number };
  system: SystemInfo;
}

export interface ProviderDailyUsage {
  date: string;
  providerKey: string;
  calls: number;
  errors: number;
  avgLatencyMs: number;
}

export interface AiUsageRow {
  engine: string;
  operation: string;
  calls: number;
  inputChars: number;
  outputChars: number;
  avgLatencyMs: number;
}

export interface SyncJobRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  providerKey: string;
  jobType: string;
  status: string;
  summary: Record<string, unknown>;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProvidersResponse {
  health24: ProviderHealth[];
  health7: ProviderHealth[];
  usage: ProviderDailyUsage[];
  ai: AiUsageRow[];
  syncJobs: SyncJobRow[];
  syncJobsTotal: number;
  email: { pending: number; sent: number; failed: number };
  system: SystemInfo;
}

export interface SupportSummary {
  trips: { id: string; title: string; status: string; arrivalDate: string | null; updatedAt: string }[];
  quotes: { id: string; quoteNumber: string; status: string; currency: string; currentVersion: number; updatedAt: string }[];
  jobs: AdminJobRow[];
  customers: { id: string; name: string; email: string | null; createdAt: string }[];
}

export interface AuditFacets {
  actions: string[];
  resourceTypes: string[];
  organizations: { id: string; name: string }[];
}
