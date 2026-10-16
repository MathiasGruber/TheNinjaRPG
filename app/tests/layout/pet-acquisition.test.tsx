import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs } from "@/app/_trpc/client";
import * as Confirm from "@/layout/Confirm";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as Link from "@/layout/Link";
import { PetAcquisition } from "@/layout/PetAcquisition";
import { getDailyPetOptions } from "@/libs/pets/catalogue";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
const dayKey = "2026-10-16";
const options = getDailyPetOptions("owner", "NONE", dayKey);

beforeEach(() => {
  ensureDom();
  Object.assign(vi.spyOn(client, "api" as never), {
    pets: testApi.pets,
    useUtils: testApi.useUtils,
  });
  vi.spyOn(UserContext, "useRequiredUserData").mockReturnValue({ data: { status: "AWAKE" } } as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }) => <div>{children}</div>);
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ href, children }) => <a href={String(href)}>{children}</a>);
  vi.spyOn(Confirm, "default").mockImplementation(({ title, onAccept, disabled }) => <button type="button" disabled={disabled} onClick={onAccept}>Confirm {title}</button>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

for (const collectionUnavailable of [false, true]) {
  it(collectionUnavailable
    ? "blocks another paid adoption until a failed collection check can recover the saved companion"
    : "recovers a parked companion after a lost adoption response and retries its image without another purchase", async () => {
    const active = { id: "active", name: "Existing", rank: 1, avatar: "/existing.webp", artRank: 1, generationStatus: "READY" };
    let claimed: (RouterInputs["pets"]["acquirePet"] & { id: string; rank: number; avatar: string | null; artRank: number; generationStatus: string }) | null = null;
    let allowCollectionRead = !collectionUnavailable;
    const acquire = vi.fn((input: RouterInputs["pets"]["acquirePet"]) => {
      claimed = { ...input, id: "new-companion", rank: 1, avatar: null, artRank: 0, generationStatus: "PENDING" };
      throw new Error("Adoption response interrupted");
    });
    const generate = vi.fn((input: RouterInputs["pets"]["generateAppearance"]) => {
      expect(input).toEqual({ petId: "new-companion" });
      claimed = { ...claimed!, avatar: "/new-companion.webp", artRank: 1, generationStatus: "READY" };
      return { success: true, message: "Appearance ready" };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
      const respond = async () => {
        if (op.path === "pets.acquirePet") return acquire(op.input as RouterInputs["pets"]["acquirePet"]);
        if (op.path === "pets.generateAppearance") return generate(op.input as RouterInputs["pets"]["generateAppearance"]);
        if (op.path !== "pets.getPet") throw new Error(`Unexpected procedure ${op.path}`);
        if (claimed && !allowCollectionRead) throw new Error("Collection unavailable");
        const selected = claimed && (op.input as RouterInputs["pets"]["getPet"])?.petId === claimed.id ? claimed : active;
        return {
          pet: selected, pets: [active, ...(claimed ? [claimed] : [])], activePetId: active.id,
          slots: 4, dayKey, options, optionCount: 3, replacementCost: 100, canAcquire: true,
          generationLimit: 3, remainingGenerations: selected === active ? 0 : 3, generationRetryAt: null,
        };
      };
      void respond().then((data) => { observer.next({ result: { data } }); observer.complete(); }, (error) => observer.error(error));
    })] });
    try {
      const view = render(
        <testApi.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}><PetAcquisition /></QueryClientProvider>
        </testApi.Provider>,
      );
      fireEvent.change(await view.findByLabelText("Companion name"), { target: { value: "Miso" } });
      for (const field of ["speciesIndex", "paletteIndex", "characteristicIndex", "auraIndex"]) {
        fireEvent.click(view.container.querySelector(`input[name="pet-${field}"]`)!);
      }
      const confirm = view.getByRole("button", { name: "Confirm Form a new bond for 100 reputation?" }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(false);
      fireEvent.click(confirm);
      if (collectionUnavailable) {
        await view.findByText("Collection unavailable");
        expect(view.queryByRole("button", { name: "Confirm Form a new bond for 100 reputation?" })).toBeNull();
        allowCollectionRead = true;
        fireEvent.click(view.getByRole("button", { name: "Try again" }));
      }
      const profile = await view.findByRole("link", { name: "Open pet profile" });
      expect(profile.getAttribute("href")).toBe("/profile/pet?petId=new-companion");
      expect(acquire).toHaveBeenCalledTimes(1);
      fireEvent.click(await view.findByRole("button", { name: "Retry appearance for free" }));
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      expect(acquire).toHaveBeenCalledTimes(1);
    } finally {
      queryClient.clear();
    }
  });
}
