import type { MiddlewareHandler } from "hono";
import { AppError } from "@tripweave/shared";
import type { Env, Vars } from "../env";
import { platformSettings } from "../services/platform";

type Bindings = { Bindings: Env; Variables: Vars };

/**
 * Maintenance mode blocks every tenant/public endpoint while leaving sign-in/out, health checks and
 * the admin portal reachable so operators can communicate and switch it off again.
 */
export const enforcePlatformAvailability: MiddlewareHandler<Bindings> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const alwaysAllowed =
    path.startsWith("/api/v1/admin") ||
    path.startsWith("/api/v1/auth") ||
    path.startsWith("/api/v1/health") ||
    path === "/api/v1/public/platform";
  if (alwaysAllowed) return next();
  const settings = await platformSettings(c.get("db"), c.get("deps").now().getTime());
  if (settings.maintenanceMode) {
    throw new AppError("maintenance", "TripWeave is undergoing scheduled maintenance. Please try again shortly.", {
      supportEmail: settings.supportEmail || undefined,
    });
  }
  return next();
};
