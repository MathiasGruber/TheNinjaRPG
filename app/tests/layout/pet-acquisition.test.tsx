import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
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
import { initialPetSpecies } from "../libs/pets/helpers/species";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
const dayKey = "2026-10-16";
const options = getDailyPetOptions("owner", "NONE", initialPetSpecies, dayKey);
let owner: { status: string; reputationPoints: number; seichiSilver: number };

const browserGlobals = ["Event", "CustomEvent", "ResizeObserver"] as const;
const browserDescriptors = browserGlobals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));

beforeEach(() => {
  ensureDom();
  Object.defineProperties(globalThis, {
    Event: { configurable: true, value: window.Event },
    CustomEvent: { configurable: true, value: window.CustomEvent },
    ResizeObserver: { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } },
  });
  owner = { status: "AWAKE", reputationPoints: 1000, seichiSilver: 100 };
  Object.assign(vi.spyOn(client, "api" as never), {
    pets: testApi.pets,
    useUtils: testApi.useUtils,
  });
  vi.spyOn(UserContext, "useRequiredUserData").mockImplementation(() => ({ data: owner }) as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ children }) => <div>{children}</div>);
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ href, children }) => <a href={String(href)}>{children}</a>);
  vi.spyOn(Confirm, "default").mockImplementation(({ title, onAccept, disabled }) => <button type="button" disabled={disabled} onClick={onAccept}>Confirm {title}</button>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  browserGlobals.forEach((key, index) => {
    const descriptor = browserDescriptors[index];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
});

for (const collectionUnavailable of [false, true]) {
  it(collectionUnavailable
    ? "blocks another paid adoption until a failed collection check can recover the saved companion"
    : "recovers a parked companion after a lost adoption response and retries its image without another purchase", async () => {
    const active = { id: "active", name: "Existing", rank: 1, avatar: "/existing.webp", artRank: 1, generationStatus: "READY" };
    let claimed: (RouterInputs["pets"]["acquirePet"] & { id: string; rank: number; avatar: string | null; artRank: number; generationStatus: string }) | null = null;
    let allowCollectionRead = !collectionUnavailable;
    const currency = collectionUnavailable ? "SEICHI_SILVER" : "REPUTATION";
    const price = collectionUnavailable ? "50 Seichi Silver" : "30 reputation";
    if (collectionUnavailable) owner.reputationPoints = 0;
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
          slots: 4, maxSlots: 6, dayKey, options, optionCount: 3, replacementCost: 30, replacementSilverCost: 50, canAcquire: true,
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
      await view.findByRole("group", { name: "Species" });
      for (const field of ["speciesId", "paletteIndex", "characteristicIndex", "auraIndex"]) {
        fireEvent.click(view.container.querySelector(`input[name="pet-${field}"]`)!);
        fireEvent.click(view.getByRole("button", { name: "Continue" }));
      }
      fireEvent.change(view.getByLabelText("Companion name"), { target: { value: "Miso" } });
      if (collectionUnavailable) fireEvent.click(view.getByRole("radio", { name: "50 Seichi Silver" }));
      const confirm = view.getByRole("button", { name: `Confirm Form a new bond for ${price}?` }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(false);
      fireEvent.click(confirm);
      if (collectionUnavailable) {
        await view.findByText("Collection unavailable");
        expect(view.queryByRole("button", { name: `Confirm Form a new bond for ${price}?` })).toBeNull();
        allowCollectionRead = true;
        fireEvent.click(view.getByRole("button", { name: "Try again" }));
      }
      const profile = await view.findByRole("link", { name: "Open pet profile" });
      expect(profile.getAttribute("href")).toBe("/profile?tab=pet&petId=new-companion");
      expect(acquire).toHaveBeenCalledTimes(1);
      expect(acquire).toHaveBeenCalledWith(expect.objectContaining({ currency }));
      fireEvent.click(await view.findByRole("button", { name: "Retry appearance for free" }));
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      expect(acquire).toHaveBeenCalledTimes(1);
    } finally {
      queryClient.clear();
    }
  });
}

for (const federalStatus of ["NONE", "GOLD"] as const) {
  it(`guides ${federalStatus} accounts through one trait at a time and preserves choices when going back`, async () => {
    const dailyOptions = getDailyPetOptions("owner", federalStatus, initialPetSpecies, dayKey);
    const { view, queryClient, updateData } = renderAcquisition({
      options: dailyOptions,
      optionCount: dailyOptions.species.length,
    });
    try {
      await view.findByRole("group", { name: "Species" });
      expect(view.getAllByRole("radio")).toHaveLength(dailyOptions.species.length);
      expect(view.queryByLabelText("Companion name")).toBeNull();
      expect(view.queryByRole("button", { name: "Meet my first companion" })).toBeNull();
      expect((view.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
      expect(view.queryByText(/Regular accounts receive/)).toBeNull();
      fireEvent.click(view.getByRole("button", { name: "About your bond and daily choices" }));
      expect(view.getByText(/Regular accounts receive/)).toBeDefined();
      fireEvent.click(view.getByRole("button", { name: "About your bond and daily choices" }));

      fireEvent.click(view.getAllByRole("radio")[0]!);
      fireEvent.click(view.getByRole("button", { name: "Continue" }));
      expect(view.getByRole("group", { name: "Colour palette" })).toBeDefined();
      fireEvent.click(view.getAllByRole("radio")[0]!);
      fireEvent.click(view.getByRole("button", { name: "Back" }));
      expect((view.getAllByRole("radio")[0] as HTMLInputElement).checked).toBe(true);
      fireEvent.click(view.getByRole("button", { name: "Continue" }));
      expect((view.getAllByRole("radio")[0] as HTMLInputElement).checked).toBe(true);
      for (const title of ["Colour palette", "Defining characteristic", "Aura"]) {
        expect(view.getByRole("group", { name: title })).toBeDefined();
        expect(view.getAllByRole("radio")).toHaveLength(dailyOptions.species.length);
        fireEvent.click(view.getAllByRole("radio")[0]!);
        fireEvent.click(view.getByRole("button", { name: "Continue" }));
      }
      expect(view.queryAllByRole("radio")).toHaveLength(0);
      const meet = view.getByRole("button", { name: "Meet my first companion" }) as HTMLButtonElement;
      expect(meet.disabled).toBe(true);
      fireEvent.change(view.getByLabelText("Companion name"), { target: { value: "Miso" } });
      expect(meet.disabled).toBe(false);
      for (const entries of Object.values(dailyOptions)) {
        expect(view.getByText(new RegExp(entries[0]!.name))).toBeDefined();
      }
      expect(view.getByRole("link", { name: "Manage my collection" }).getAttribute("href")).toBe("/profile?tab=pet");

      const tomorrow = "2026-10-17";
      await updateData({ dayKey: tomorrow, options: getDailyPetOptions("owner", federalStatus, initialPetSpecies, tomorrow) });
      await view.findByText("A new UTC day has begun. Choose from today's refreshed options.");
      expect(view.getByRole("group", { name: "Species" })).toBeDefined();
      expect(view.queryByLabelText("Companion name")).toBeNull();
      expect(view.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
      expect((view.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      queryClient.clear();
    }
  });
}

it("explains the collection limit while allowing every trait to be previewed without adopting", async () => {
  const { view, queryClient, mutations } = renderAcquisition({
    pets: Array.from({ length: 6 }, (_, index) => ({ id: `pet-${index}` })),
    slots: 6,
    replacementCost: 30, replacementSilverCost: 50,
    canAcquire: false,
    unavailableReason: "Unlock another collection slot or release a companion before adopting another.",
  });
  try {
    const reason = await view.findByText("Your collection is full. Release a companion before adopting another.");
    const choices = view.getByRole("group", { name: "Species" });
    expect(reason.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(view.queryByText(/Unlock another collection slot/)).toBeNull();
    expect(view.getAllByRole("radio").every((radio) => !radio.matches(":disabled"))).toBe(true);
    for (const title of ["Species", "Colour palette", "Defining characteristic", "Aura"]) {
      expect(view.getByRole("group", { name: title })).toBeTruthy();
      fireEvent.click(view.getAllByRole("radio")[0]!);
      fireEvent.click(view.getByRole("button", { name: "Continue" }));
    }
    fireEvent.change(view.getByRole("textbox", { name: "Companion name" }), { target: { value: "Preview" } });
    const meet = view.getByRole("button", { name: "Confirm Form a new bond for 30 reputation?" }) as HTMLButtonElement;
    expect(meet.disabled).toBe(true);
    fireEvent.click(meet);
    fireEvent.submit(meet.closest("form")!);
    expect(mutations).not.toHaveBeenCalled();
  } finally {
    queryClient.clear();
  }
});

it("checks only the selected adoption currency and preserves the companion draft when changing payment", async () => {
  owner.reputationPoints = 0;
  owner.seichiSilver = 50;
  const { view, queryClient, mutations, updateData } = renderAcquisition({ replacementCost: 30, replacementSilverCost: 50 });
  try {
    await view.findByRole("group", { name: "Species" });
    for (const title of ["Species", "Colour palette", "Defining characteristic", "Aura"]) {
      fireEvent.click(view.getByRole("group", { name: title }).querySelector("input")!);
      fireEvent.click(view.getByRole("button", { name: "Continue" }));
    }
    fireEvent.change(view.getByLabelText("Companion name"), { target: { value: "Miso" } });
    let confirm = view.getByRole("button", { name: "Confirm Form a new bond for 30 reputation?" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(mutations).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("radio", { name: "50 Seichi Silver" }));
    confirm = view.getByRole("button", { name: "Confirm Form a new bond for 50 Seichi Silver?" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect((view.getByLabelText("Companion name") as HTMLInputElement).value).toBe("Miso");
    owner.seichiSilver = 49;
    await updateData({});
    await waitFor(() => expect(confirm.disabled).toBe(true));
    owner.reputationPoints = 30;
    await updateData({});
    fireEvent.click(view.getByRole("radio", { name: "30 reputation" }));
    confirm = view.getByRole("button", { name: "Confirm Form a new bond for 30 reputation?" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(mutations).toHaveBeenCalledWith("pets.acquirePet", expect.objectContaining({ name: "Miso", currency: "REPUTATION" })));
    await view.findByText("Your collection was checked and no new matching companion was found. You can try adopting again.");
    expect((view.getByLabelText("Companion name") as HTMLInputElement).value).toBe("Miso");
  } finally { queryClient.clear(); }
});

it("explains an unavailable species catalogue without an empty selection wizard", async () => {
  const message = "The Bondkeepers are not offering new companions right now. Please check back later.";
  const { view, queryClient, mutations } = renderAcquisition({
    options: { ...options, species: [] }, canAcquire: false, unavailableReason: message,
  });
  try {
    await view.findByText(message);
    expect(view.queryByRole("group", { name: "Species" })).toBeNull();
    expect(view.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(mutations).not.toHaveBeenCalled();
  } finally { queryClient.clear(); }
});

function renderAcquisition(initialData: Record<string, unknown>) {
  let data = {
    pet: null, pets: [], activePetId: null, slots: 1, maxSlots: 6,
    dayKey, options, optionCount: 3, replacementCost: 0, replacementSilverCost: 0, canAcquire: true,
    generationLimit: 3, remainingGenerations: 3, generationRetryAt: null,
    unavailableReason: null,
    ...initialData,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const mutations = vi.fn();
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    if (op.path !== "pets.getPet") {
      mutations(op.path, op.input);
      observer.error(TRPCClientError.from(new Error(`Unexpected procedure ${op.path}`)));
      return;
    }
    observer.next({ result: { data } });
    observer.complete();
  })] });
  const view = render(
    <testApi.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}><PetAcquisition /></QueryClientProvider>
    </testApi.Provider>,
  );
  return {
    view,
    queryClient,
    mutations,
    updateData: async (updated: Record<string, unknown>) => {
      data = { ...data, ...updated };
      await queryClient.invalidateQueries();
    },
  };
}
