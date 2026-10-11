import { readFileSync } from "node:fs";
import { join } from "node:path";
import { waitFor } from "@testing-library/react";
import { InfiniteQueryObserver, QueryClient, type InfiniteData, type InfiniteQueryObserverOptions } from "@tanstack/react-query";
import { describe, expect, it } from "bun:test";

type ChatPage = {
  data: string[];
  convo: { id: string } | null;
  restrictionMessage: string | null;
  nextCursor: undefined;
};

const sourceRoot = join(import.meta.dirname, "../../src");
const provider = readFileSync(join(sourceRoot, "app/_trpc/Provider.tsx"), "utf8");
const staleTimeExpression = provider.match(/\bstaleTime:\s*([^,\n]+)/)?.[1];
if (!staleTimeExpression) throw new Error("Provider query staleTime was not found");
const staleTime = new Function(`return (${staleTimeExpression});`)() as number;

// Use the hooks' actual options so removing a lifecycle refresh fails the behavior test.
const chatOptions = (file: string) => {
  const source = readFileSync(join(sourceRoot, "layout", file), "utf8");
  const expression = source.match(/api\.comments\.getConversationComments\.useInfiniteQuery\(queryKey,\s*(\{[\s\S]*?\})\)/)?.[1];
  if (!expression) throw new Error(`Chat query options were not found in ${file}`);
  return new Function("props", "conversationId", `return (${expression});`)(
    { convo_id: "chat" }, "chat",
  ) as Omit<InfiniteQueryObserverOptions<ChatPage, Error, InfiniteData<ChatPage>>, "queryKey" | "queryFn" | "initialPageParam">;
};

describe("cached conversation remounts", () => {
  for (const file of ["Conversation.tsx", "RaidBrowser.tsx"]) {
    it(`${file} refreshes missed parental restrictions and recovers when reopened`, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { staleTime, retry: false } } });
      const queryKey = [["comments", "getConversationComments"], { convo_id: "chat", type: "infinite" }];
      let restricted = false;
      let reads = 0;
      const mount = () => new InfiniteQueryObserver(client, {
        ...chatOptions(file),
        queryKey,
        initialPageParam: null,
        queryFn: async (): Promise<ChatPage> => {
          reads++;
          return {
            data: restricted ? [] : ["Permitted chat history"],
            convo: restricted ? null : { id: "chat" },
            restrictionMessage: restricted ? "Private messages are disabled by parental controls." : null,
            nextCursor: undefined,
          };
        },
      });
      let observer = mount();
      let unsubscribe = observer.subscribe(() => {});
      try {
        await waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
        expect(reads).toBe(1);
        expect(observer.getCurrentResult().data?.pages[0]?.data).toEqual(["Permitted chat history"]);
        unsubscribe();
        restricted = true;

        observer = mount();
        unsubscribe = observer.subscribe(() => {});
        await waitFor(() => expect(observer.getCurrentResult().data?.pages[0]?.restrictionMessage).toBe("Private messages are disabled by parental controls."));
        expect(reads).toBe(2);
        expect(observer.getCurrentResult().data?.pages[0]?.data).toEqual([]);
        expect(observer.getCurrentResult().data?.pages[0]?.convo).toBeNull();
        unsubscribe();
        restricted = false;

        observer = mount();
        unsubscribe = observer.subscribe(() => {});
        await waitFor(() => expect(observer.getCurrentResult().data?.pages[0]?.restrictionMessage).toBeNull());
        expect(reads).toBe(3);
        expect(observer.getCurrentResult().data?.pages[0]?.data).toEqual(["Permitted chat history"]);
      } finally {
        unsubscribe();
        client.clear();
      }
    });
  }
});
