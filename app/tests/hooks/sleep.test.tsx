import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import type { ContextType, ReactNode } from "react";
import superjson from "superjson";
import { api } from "@/app/_trpc/client";
import { useSleepToggle } from "@/hooks/sleep";
import { UserContext } from "@/utils/UserContext";
import { prepareUserUpdate, updateUserCache } from "@/utils/userCache";
import type { UserWithRelations } from "@/server/api/routers/profile";

afterEach(cleanup);

it("reconciles a delayed sleep response instead of replacing a newer hospitalization", async () => {
  const key = ["profile"];
  const profile = (status: "AWAKE" | "ASLEEP" | "HOSPITALIZED") => ({ userData: { status } as NonNullable<UserWithRelations> });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(key, profile("AWAKE"));
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn: async () => profile("HOSPITALIZED") });
  const unsubscribe = observer.subscribe(() => {});
  let finish!: () => void;
  let started!: () => void;
  const dispatched = new Promise<void>((resolve) => { started = resolve; });
  const trpc = api.createClient({ links: [httpBatchLink({
    url: "http://localhost/api/trpc", transformer: superjson,
    fetch: async () => {
      started();
      await new Promise<void>((resolve) => { finish = resolve; });
      return Response.json([{ result: { data: superjson.serialize({ success: true, message: "Asleep", newStatus: "ASLEEP" }) } }]);
    },
  })] });
  const user = {
    prepareUserUpdate: () => prepareUserUpdate(client, key),
    updateUser: (patch, mutation) => updateUserCache(client, key, patch, mutation),
  } as ContextType<typeof UserContext>;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <api.Provider client={trpc} queryClient={client}>
      <QueryClientProvider client={client}><UserContext value={user}>{children}</UserContext></QueryClientProvider>
    </api.Provider>
  );
  const { result } = renderHook(() => useSleepToggle(), { wrapper });
  act(() => result.current.toggleSleep());
  await dispatched;
  client.setQueryData(key, profile("HOSPITALIZED"));
  await act(async () => finish());
  await waitFor(() => expect(result.current.isTogglingSleep).toBe(false));
  expect(client.getQueryData<ReturnType<typeof profile>>(key)).toEqual(profile("HOSPITALIZED"));
  unsubscribe();
  client.clear();
});
