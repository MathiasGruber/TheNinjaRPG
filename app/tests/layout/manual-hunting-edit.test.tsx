import { QueryClient, QueryClientProvider, useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "bun:test";
import type { ReactNode } from "react";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import HuntingEditor from "@/app/[shell]/manual/hunting/page";
import * as ContentBox from "@/layout/ContentBox";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../setup-dom.mjs";
import { huntingHabitatContent } from "../setup/hunting";

type SaveInput = RouterInputs["hunting"]["save"];
type SaveResult = RouterOutputs["hunting"]["save"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("uses server-assigned contract IDs when saving the habitat draft again", async () => {
  ensureDom();
  const content = { ...huntingHabitatContent(), contracts: [] };
  const refetch = vi.fn(async () => undefined);
  const save = vi.fn(async (input: SaveInput): Promise<SaveResult> => ({
    success: true, message: "Habitat saved.", id: "forest",
    content: { ...input.content, contracts: input.content.contracts.map((c) => ({ ...c, id: "saved-contract" })) },
  }));
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({ hunting: { getBoard: { invalidate: async () => undefined } } }),
    hunting: {
      getAll: { useQuery: () => ({ data: [{ id: "forest", content }], refetch }) },
      save: { useMutation: (options: UseMutationOptions<SaveResult, Error, SaveInput>) => useMutation({ ...options, mutationFn: save }) },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    profile: { getAllAiNames: { useQuery: () => ({ data: [{ userId: "enemy", username: "Enemy" }] }) } },
    item: { getAllNames: { useQuery: () => ({ data: [{ id: "hide", name: "Boar hide", canBeHunted: true }] }) } },
  });
  vi.spyOn(UserContext, "useUserData").mockReturnValue({ data: { role: "CONTENT-ADMIN" } } as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }: { children: ReactNode }) => <div>{children}</div>);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={queryClient}><HuntingEditor /></QueryClientProvider>);
  fireEvent.change(view.getByRole("combobox", { name: "Edit existing habitat" }), { target: { value: "forest" } });
  fireEvent.click(view.getByRole("button", { name: "Add creature contract" }));
  for (const [label, value] of [["Contract name", "Boar"], ["Creature", "enemy"], ["Combat difficulty", "Easy"], ["Material", "hide"]]) {
    fireEvent.change(view.getByLabelText(label!), { target: { value } });
  }
  const button = view.getByRole("button", { name: "Save habitat" }) as HTMLButtonElement;
  fireEvent.click(button);
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(save.mock.calls[0]![0].content.contracts[0]!.id).not.toBe("saved-contract");
  fireEvent.click(button);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]![0]).toMatchObject({ id: "forest", content: { contracts: [{ id: "saved-contract" }] } });
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
  queryClient.clear();
});
