import { QueryClient, QueryClientProvider, useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "bun:test";
import type { ReactNode } from "react";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import DungeonEditor from "@/app/[shell]/manual/dungeon/page";
import * as ContentBox from "@/layout/ContentBox";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../setup-dom.mjs";
import { dungeonContent } from "../setup/dungeon";

type SaveInput = RouterInputs["dungeon"]["save"];
type SaveResult = RouterOutputs["dungeon"]["save"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["success", "error"])("keeps the saved draft selected until a pending save settles with %s", async (outcome) => {
  ensureDom();
  const definitions = [
    { id: "A", content: { ...dungeonContent(), name: "Dungeon A" } },
    { id: "B", content: { ...dungeonContent(), name: "Dungeon B" } },
  ];
  let resolveSave!: (result: SaveResult) => void;
  let rejectSave!: (error: Error) => void;
  const save = vi.fn((_input: SaveInput) => new Promise<SaveResult>((resolve, reject) => {
    resolveSave = resolve;
    rejectSave = reject;
  }));
  const refetch = vi.fn(async () => undefined);
  const invalidate = vi.fn(async () => undefined);
  Object.assign(vi.spyOn(client, "api" as never), {
    useUtils: () => ({ dungeon: { getAvailable: { invalidate } } }),
    dungeon: {
      getAll: { useQuery: () => ({ data: definitions, refetch }) },
      save: { useMutation: (options: UseMutationOptions<SaveResult, Error, SaveInput>) => useMutation({ ...options, mutationFn: save }) },
    },
    profile: { getAllAiNames: { useQuery: () => ({ data: [{ userId: "enemy", username: "Enemy" }] }) } },
    item: { getAllNames: { useQuery: () => ({ data: [] }) } },
    jutsu: { getAllNames: { useQuery: () => ({ data: [] }) } },
  });
  vi.spyOn(UserContext, "useUserData").mockReturnValue({ data: { role: "CONTENT-ADMIN" } } as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }: { children: ReactNode }) => <div>{children}</div>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={queryClient}><DungeonEditor /></QueryClientProvider>);
  const select = view.getByRole("combobox", { name: "Edit existing dungeon" }) as HTMLSelectElement;
  const newButton = view.getByRole("button", { name: "New dungeon" }) as HTMLButtonElement;
  fireEvent.change(select, { target: { value: "A" } });
  fireEvent.click(view.getByRole("button", { name: "Save dungeon" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toMatchObject({ id: "A", content: { name: "Dungeon A" } });
  expect(select.disabled).toBe(true);
  expect(newButton.disabled).toBe(true);
  fireEvent.click(newButton);
  expect(select.value).toBe("A");
  expect((view.getByLabelText("Name") as HTMLInputElement).value).toBe("Dungeon A");

  await act(async () => {
    if (outcome === "success") resolveSave({ success: true, message: "Dungeon saved.", id: "A" });
    else rejectSave(new Error("Save failed. Try again."));
  });
  await waitFor(() => expect(select.disabled).toBe(false));
  expect(newButton.disabled).toBe(false);
  expect(view.getByRole("status").textContent).toBe(outcome === "success" ? "Dungeon saved." : "Save failed. Try again.");
  expect(refetch).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
  expect(invalidate).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
  fireEvent.change(select, { target: { value: "B" } });
  fireEvent.click(view.getByRole("button", { name: "Save dungeon" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]?.[0]).toMatchObject({ id: "B", content: { name: "Dungeon B" } });
  await act(async () => { resolveSave({ success: true, message: "Dungeon saved.", id: "B" }); });
  await waitFor(() => expect(newButton.disabled).toBe(false));
  fireEvent.click(newButton);
  expect(select.value).toBe("");
  expect((view.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  queryClient.clear();
});
