import { authClient } from "@/lib/auth/auth-client";

export const getSession = async () => {
  const data = await authClient.getSession({ fetchOptions: { throw: true } });
  return data?.session && data.user ? { session: data.session, user: data.user } : null;
};

export type SessionData = NonNullable<Awaited<ReturnType<typeof getSession>>>;
