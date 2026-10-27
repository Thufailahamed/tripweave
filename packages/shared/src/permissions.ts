export const ROLES = [
  "owner",
  "admin",
  "manager",
  "staff",
  "read_only",
  "hotel_portfolio_manager",
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "org:read",
  "org:manage",
  "team:manage",
  "settings:pricing",
  "settings:integrations",
  "audit:read",
  "customers:read",
  "customers:write",
  "trips:read",
  "trips:write",
  "hotels:read",
  "hotels:write",
  "rates:read",
  "rates:write",
  "inventory:write",
  "suppliers:manage",
  "agreements:manage",
  "partners:manage",
  "optimisation:run",
  "packages:write",
  "quotes:read",
  "quotes:write",
  "quotes:send",
  "quotes:approve",
  "margins:view",
  "reports:read",
  "imports:run",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const MANAGER = new Set<Permission>(
  PERMISSIONS.filter((p) => !["org:manage", "team:manage", "settings:integrations"].includes(p)),
);

const STAFF = new Set<Permission>([
  "org:read",
  "customers:read",
  "customers:write",
  "trips:read",
  "trips:write",
  "hotels:read",
  "rates:read",
  "optimisation:run",
  "packages:write",
  "quotes:read",
  "quotes:write",
  "quotes:send",
  "reports:read",
]);

const READ_ONLY = new Set<Permission>([
  "org:read",
  "customers:read",
  "trips:read",
  "hotels:read",
  "quotes:read",
  "reports:read",
]);

const HOTEL_PORTFOLIO = new Set<Permission>([
  "org:read",
  "hotels:read",
  "hotels:write",
  "rates:read",
  "rates:write",
  "inventory:write",
  "suppliers:manage",
  "agreements:manage",
  "partners:manage",
  "imports:run",
  "reports:read",
  "customers:read",
  "trips:read",
  "quotes:read",
  "margins:view",
]);

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  admin: ALL,
  manager: MANAGER,
  staff: STAFF,
  read_only: READ_ONLY,
  hotel_portfolio_manager: HOTEL_PORTFOLIO,
};

export function permissionsForRole(role: Role): Permission[] {
  return [...MATRIX[role]];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
