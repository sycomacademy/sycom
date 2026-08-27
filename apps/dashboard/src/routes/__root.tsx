import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AppRouter } from "server/trpc/routers/_app";
import { AnchoredToastProvider, ToastProvider } from "@sycom/ui/components/toast";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  type RegisteredRouter,
} from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { LazyMotion, domAnimation } from "motion/react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@sycom/ui/components/tooltip";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import GlobalError from "@/components/layout/global-error";
import { RootLoader } from "@/components/layout/loader";

type RouterAppContext = {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
  router: RegisteredRouter;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Sycom",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
  pendingComponent: RootLoader,
  component: RootComponent,
  errorComponent: RootError,
});

function RootComponent() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import("react-grab");
    }
  }, []);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <>
      {createPortal(<HeadContent />, document.head)}
      <LazyMotion features={domAnimation} strict>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <ToastProvider>
              <AnchoredToastProvider>
                {children}
                {/* <TanStackRouterDevtools position="bottom-left" />
                <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" /> */}
              </AnchoredToastProvider>
            </ToastProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LazyMotion>
    </>
  );
}

function RootError() {
  return (
    <RootDocument>
      <GlobalError />
    </RootDocument>
  );
}
