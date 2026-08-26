import type { AppRouter } from "server/trpc/routers/_app";
import { env } from "@sycom/env/web";

import "./index.css";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { logSycomConsoleBanner } from "@sycom/ui/lib/console-banner";
import { toastManager } from "@sycom/ui/components/toast";
import superjson from "superjson";

import Loader from "./components/layout/loader";
import NotFound from "./components/layout/not-found";
import RouteError from "./components/layout/route-error";
import { TRPCProvider } from "./lib/trpc/client";
import { routeTree, type FileRoutesByTo } from "./routeTree.gen";

logSycomConsoleBanner();
/**
 * Type for the routes in the dashboard.
 */
export type TRoutes = keyof FileRoutesByTo;

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toastManager.add({
          id: `query-error:${query.queryHash}`,
          title: error.message,
          type: "error",
          actionProps: {
            children: "Retry",
            onClick: () => {
              void query.invalidate();
              void window.location.reload();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 3 * 60 * 1000 } },
  });

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${env.VITE_SERVER_URL}/trpc`,
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });

  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  let router!: ReturnType<typeof createTanStackRouter>;

  router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
    context: {
      trpc,
      queryClient,
      get router() {
        return router;
      },
    },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: ({ error, reset }) => (
      <RouteError error={error} mode="container" reset={reset} />
    ),
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    ),
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
