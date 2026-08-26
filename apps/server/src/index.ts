import { trpcServer } from "@hono/trpc-server";
import { serve } from "@hono/node-server";
import { auth } from "@sycom/auth";
import { env } from "@sycom/env/server";
import { createLoggerWithContext } from "@sycom/logger";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createContext } from "./trpc/context";
import { appRouter } from "./trpc/routers/_app";
import { httpLogger } from "@/utils/http-logger";
import { byIp, createRateLimitMiddleware } from "@/utils/rate-limit";
import { consoleText } from "@sycom/ui/lib/constants";
import { csrf } from "hono/csrf";
import { readFile } from "node:fs/promises";

const honoLogger = createLoggerWithContext("hono");
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

const app = new Hono();
const authRateLimiter = createRateLimitMiddleware({
  windowMs: 60_000,
  limit: 60,
  keyFn: byIp,
  name: "auth",
  message: "Too many authentication attempts. Please try again in a minute.",
});
const trpcRateLimiter = createRateLimitMiddleware({
  windowMs: 60_000,
  limit: 120,
});

app.use(secureHeaders());
app.use("*", httpLogger());
app.use(csrf({ origin: env.CORS_ORIGIN }));

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "x-trpc-source", "trpc-accept"],
    exposeHeaders: ["Content-Length", "Content-Type", "Cache-Control"],
    maxAge: 60 * 60 * 1000, // 1 hour
  }),
);

app.use("/api/auth/*", authRateLimiter);
app.use("/trpc/*", trpcRateLimiter);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => createContext({ context }),
    onError: ({ error, path }) => {
      honoLogger.error(`[tRPC] ${path ?? "unknown"}`, {
        code: error.code,
        message: error.message,
      });
    },
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) => {
  return c.text(consoleText);
});

if (env.NODE_ENV !== "production") {
  const faviconPath = new URL("../public/favicon.svg", import.meta.url);
  const loadFavicon = async () => readFile(faviconPath);
  const faviconHref = "/favicon.svg";
  const faviconHeaders = {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  };

  app.get(
    "/favicon.svg",
    async () => new Response(await loadFavicon(), { headers: faviconHeaders }),
  );

  app.get(
    "/favicon.ico",
    async () => new Response(await loadFavicon(), { headers: faviconHeaders }),
  );

  app.get("/docs", async (c) => {
    const { renderTrpcPanel } = await import("trpc-ui-zod4");
    const origin = new URL(c.req.url).origin;
    const trpcPanelHtml = renderTrpcPanel(appRouter, {
      url: `${origin}/trpc`,
      transformer: "superjson",
    }).replace(
      "</head>",
      `<link rel="icon" href="${faviconHref}" sizes="any" type="image/svg+xml" /></head>`,
    );
    return c.html(trpcPanelHtml);
  });
}

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  honoLogger.error(`[Hono] ${c.req.method} ${c.req.path}`, {
    message: err.message,
    stack: err.stack,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

const shutdown = async (signal: string) => {
  honoLogger.info(`Received ${signal}, starting graceful shutdown...`);

  const SHUTDOWN_TIMEOUT = 10_000; // 10s

  const shutdownPromise = (async () => {
    try {
      honoLogger.info("Graceful shutdown complete");
    } catch (error) {
      honoLogger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      honoLogger.warn("Shutdown timeout reached, forcing exit");
      resolve();
    }, SHUTDOWN_TIMEOUT);
  });

  await Promise.race([shutdownPromise, timeoutPromise]);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? "0.0.0.0",
    port,
  },
  (info) => {
    honoLogger.info(`Server listening on http://${info.address}:${info.port}`);
  },
);
