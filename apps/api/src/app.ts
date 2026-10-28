import { Hono } from "hono";
import type { Deps, Env, Vars } from "./env";
import { authenticate, enforceEmailVerification } from "./middleware/auth";
import { csrfGuard, errorHandler, notFoundHandler, requestContext } from "./middleware/core";
import { enforcePlatformAvailability } from "./middleware/maintenance";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { customerRoutes } from "./routes/customers";
import { hotelRoutes } from "./routes/hotels";
import { optimisationRoutes } from "./routes/optimisation";
import { orgRoutes } from "./routes/organization";
import { planningRoutes } from "./routes/planning";
import { publicRoutes } from "./routes/public";
import { quoteRoutes } from "./routes/quotes";
import { reportRoutes } from "./routes/reports";
import { tripRoutes } from "./routes/trips";
import { defaultBuildLlm, defaultBuildProviders } from "./services/providers";
import { API_VERSION } from "./lib/version";

export { API_VERSION };

export function defaultDeps(schedule: Deps["schedule"]): Deps {
  return {
    now: () => new Date(),
    schedule,
    buildProviders: defaultBuildProviders,
    buildLlm: defaultBuildLlm,
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    pbkdf2Iterations: 100_000,
  };
}

/**
 * Builds the Hono application. Collaborators (clock, providers, LLM, fetch, scheduler) are injectable
 * so the whole API can be exercised in tests with deterministic fixtures and no live services.
 */
export function createApp(overrides: Partial<Deps> = {}) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();
  app.use("*", requestContext((scheduler) => ({ ...defaultDeps(scheduler), ...overrides, schedule: overrides.schedule ?? scheduler })));
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  const v1 = new Hono<{ Bindings: Env; Variables: Vars }>();
  v1.get("/health", (c) => c.json({ status: "ok", version: API_VERSION, environment: c.env.ENVIRONMENT }));
  v1.get("/health/ready", async (c) => {
    try {
      await c.env.DB.prepare("SELECT 1").first();
      return c.json({ status: "ready", database: "ok", storage: c.env.MEDIA ? "configured" : "missing", queue: c.env.JOBS ? "configured" : "inline", workflow: c.env.OPTIMISATION_WORKFLOW ? "configured" : "inline" });
    } catch {
      return c.json({ status: "unavailable", database: "error" }, 503);
    }
  });

  v1.use("*", csrfGuard, authenticate, enforceEmailVerification);
  v1.use("*", enforcePlatformAvailability);
  v1.route("/auth", authRoutes);
  v1.route("/public", publicRoutes);
  v1.route("/admin", adminRoutes);
  v1.route("/customers", customerRoutes);
  v1.route("/", orgRoutes);
  v1.route("/", hotelRoutes);
  v1.route("/", tripRoutes);
  v1.route("/", optimisationRoutes);
  v1.route("/", planningRoutes);
  v1.route("/", quoteRoutes);
  v1.route("/", reportRoutes);
  app.route("/api/v1", v1);
  return app;
}

export type AppType = ReturnType<typeof createApp>;
