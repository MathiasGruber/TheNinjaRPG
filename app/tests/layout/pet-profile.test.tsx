import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import * as navigation from "next/navigation";
import type { AppRouter } from "@/api/root";
import * as client from "@/app/_trpc/client";
import type { RouterInputs, RouterOutputs } from "@/app/_trpc/client";
import PetProfilePage from "@/app/[shell]/profile/pet/page";
import { MAP_WAKE_ISLAND_SECTOR, PET_BATTLE_CONFIG, PET_FEED_COOLDOWN_HOURS } from "@/drizzle/constants";
import * as SectorVillage from "@/hooks/useSectorVillage";
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as ItemWithEffects from "@/layout/ItemWithEffects";
import * as Link from "@/layout/Link";
import { PetProfile } from "@/layout/PetProfile";
import * as StatsDistributionForm from "@/layout/StatsDistributionForm";
import { getPetAbilityCapacity } from "@/libs/pets/abilities";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { initialPetSpecies } from "../libs/pets/helpers/species";
import { petJutsuFixture, petSkillFixture } from "../libs/pets/helpers/abilities";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
type PetView = RouterOutputs["pets"]["getPet"];
let owner: {
  userId: string; role: string; status: string; rank: string; reputationPoints: number;
  sector: number; battleId: string | null; isOutlaw: boolean;
  village: { name: string; type: string; sector: number; structures: { route: string }[]; relationshipA: []; relationshipB: [] };
};
let queryClient: QueryClient;
let data: PetView;
let requestedPetId: string | null;
let update: ReturnType<typeof vi.fn>;
let saveAbilities: ReturnType<typeof vi.fn>;
let feed: ReturnType<typeof vi.fn>;
let saveAi: ReturnType<typeof vi.fn>;
let getPet: ReturnType<typeof vi.fn>;
let timeDiff: number;

beforeEach(() => {
  ensureDom();
  timeDiff = 0;
  requestedPetId = "companion";
  owner = {
    userId: "owner", role: "USER", status: "AWAKE", rank: "JONIN", reputationPoints: 1000,
    sector: 1, battleId: null, isOutlaw: false,
    village: { name: "Horizon", type: "VILLAGE", sector: 1, structures: [{ route: "/home" }], relationshipA: [], relationshipB: [] },
  };
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const pet = {
    id: "companion", name: "Miso", rank: 7, experience: 0, storedExperience: 0,
    speciesId: "pet-species-0", species: initialPetSpecies[0]!, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
    generationStatus: "READY", avatar: "/miso.webp", artRank: 7, battleEnabled: true,
    spawnPosition: "BEHIND", abilitySlots: 3, jutsuIds: [], skillIds: [],
    aiRules: [], includeDefaultRules: false, lastFedAt: null,
    offence: 10, defence: 10, strength: 10, speed: 10, intelligence: 10, willpower: 10,
  };
  data = {
    pet, pets: [pet], activePetId: pet.id, slots: 6, maxSlots: 6, maxRank: 7,
    nextRank: null, canRankUp: false, remainingGenerations: 3, generationLimit: 3,
    generationRetryAt: null, unusedExperience: 100, feedExperience: 25, dayKey: "2026-10-16",
    canFeed: true, feedAvailableAt: null, feedMeals: [{ id: "meal", name: "Rice", quantity: 2 }],
    abilityCapacity: getPetAbilityCapacity(pet), abilitySlotCost: 100,
    abilities: {
      jutsus: Array.from({ length: 12 }, (_, i) => petJutsuFixture({ id: `jutsu-${i}`, name: `Strike ${i}` })),
      skills: Array.from({ length: 6 }, (_, i) => petSkillFixture({ id: `skill-${i}`, name: `Skill ${i}` })),
    },
  } as unknown as PetView;
  update = vi.fn((input: RouterInputs["pets"]["updatePet"]) => {
    if (input.name === "Rejected") return { success: false, message: "This companion cannot be renamed right now." };
    data = { ...data, pet: { ...data.pet!, ...input } };
    return { success: true, message: "Updated" };
  });
  saveAbilities = vi.fn((input: RouterInputs["pets"]["updateAbilities"]) => {
    data = { ...data, pet: { ...data.pet!, ...input } };
    return { success: true, message: "Abilities saved" };
  });
  feed = vi.fn(() => ({ success: true, message: "Fed" }));
  saveAi = vi.fn(() => ({ success: true, message: "Rules saved" }));
  getPet = vi.fn(() => data);
  Object.assign(vi.spyOn(client, "api" as never), { pets: testApi.pets, ai: testApi.ai, useUtils: testApi.useUtils });
  vi.spyOn(navigation, "useSearchParams").mockImplementation(() => new URLSearchParams(requestedPetId ? { petId: requestedPetId } : {}) as never);
  vi.spyOn(UserContext, "useRequiredUserData").mockImplementation(() => ({ data: owner, timeDiff }) as never);
  vi.spyOn(SectorVillage, "useSectorVillage").mockImplementation(() => ({
    sectorVillage: owner.sector === owner.village.sector || owner.isOutlaw ? owner.village : null,
    isLoading: false,
  }) as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ title, subtitle, children }) => <section aria-label={title}><p>{subtitle}</p>{children}</section>);
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ href, children }) => <a href={String(href)}>{children}</a>);
  vi.spyOn(ItemWithEffects, "default").mockImplementation(({ item }) => <p>{"description" in item ? String(item.description) : item.name}</p>);
  vi.spyOn(StatsDistributionForm, "default").mockImplementation(({ disabled, availableStats }) => <p>{availableStats} training points {disabled ? "unavailable" : "available"}</p>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  PET_BATTLE_CONFIG.enabled = false;
  vi.restoreAllMocks();
});

const mount = () => {
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    const respond = async () => {
      if (op.path === "pets.getPet") {
        expect(op.input).toEqual({ petId: "companion" });
        return getPet();
      }
      if (op.path === "pets.updatePet") return update(op.input);
      if (op.path === "pets.updateAbilities") return saveAbilities(op.input);
      if (op.path === "pets.feedPet") return feed(op.input);
      if (op.path === "pets.updateAiConfig") return saveAi(op.input);
      throw new Error(`Unexpected procedure ${op.path}`);
    };
    void respond().then((value) => { observer.next({ result: { data: value } }); observer.complete(); }, (error) => observer.error(error));
  })] });
  return render(<testApi.Provider client={trpcClient} queryClient={queryClient}><QueryClientProvider client={queryClient}><PetProfile /></QueryClientProvider></testApi.Provider>);
};
const selectTab = (view: ReturnType<typeof mount>, name: string) => fireEvent.mouseDown(view.getByRole("tab", { name }), { button: 0, ctrlKey: false });

it.each([false, true])("keeps companion combat off and unavailable for a saved preference of %s", async (battleEnabled) => {
  data.pet!.battleEnabled = battleEnabled;
  const view = mount();
  await view.findByRole("tab", { name: "Battle" });
  selectTab(view, "Battle");
  const toggle = view.getByRole("switch", { name: "Join me in battle" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect((toggle as HTMLButtonElement).disabled).toBe(true);
  expect(document.getElementById(toggle.getAttribute("aria-describedby")!)?.textContent).toBe("Companion battles are not available yet.");
  expect(view.getByText("Unavailable")).toBeTruthy();
  expect(view.queryByText("Joining battle")).toBeNull();
  fireEvent.click(toggle);
  expect(update).not.toHaveBeenCalled();
});

it("shows focused activities and preserves an AI draft while switching tabs", async () => {
  const view = mount();
  await view.findByRole("tablist", { name: "Companion activities" });
  expect(view.getAllByRole("tabpanel")).toHaveLength(1);
  const care = view.getByRole("tab", { name: /^Care$/ });
  const carePanel = view.getByRole("tabpanel", { name: /^Care$/ });
  expect(carePanel.getAttribute("aria-labelledby")).toBe(care.id);
  expect(carePanel.textContent).toContain("Feed one meal");
  expect(carePanel.textContent).not.toContain("training points available");
  expect(carePanel.textContent).not.toContain("final evolution");
  const stats = view.getAllByRole("definition")[0]!.closest("dl")!;
  expect(stats.getAttribute("aria-label")).toBe("Companion stats");
  expect(stats.closest("section")?.getAttribute("aria-label")).toBe("Miso");
  expect(stats.closest('[role="tabpanel"]')).toBeNull();
  act(() => care.focus());
  fireEvent.keyDown(care, { key: "ArrowRight" });
  await waitFor(() => expect(view.getByRole("tabpanel", { name: "Training" })).toBeTruthy());
  expect(view.getByText("100 training points available")).toBeTruthy();
  expect(view.getByText("Your companion has reached its final evolution.")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Feed one meal" })).toBeNull();
  fireEvent.keyDown(view.getByRole("tab", { name: "Training" }), { key: "ArrowRight" });
  await waitFor(() => expect(view.getByRole("tabpanel", { name: "Abilities" })).toBeTruthy());
  expect(document.activeElement).toBe(view.getByRole("tab", { name: "Abilities" }));
  expect(view.queryByRole("button", { name: "Save Profile" })).toBeNull();
  selectTab(view, "Battle");
  fireEvent.click(view.getByRole("button", { name: "Add Rule" }));
  expect(view.getByRole("button", { name: /Rule 1:/ })).toBeTruthy();
  selectTab(view, "Abilities");
  expect(view.queryByRole("button", { name: /Rule 1:/ })).toBeNull();
  selectTab(view, "Battle");
  fireEvent.click(view.getByRole("button", { name: "Save Profile" }));
  await waitFor(() => expect(saveAi).toHaveBeenCalledTimes(1));
  expect(saveAi.mock.calls[0]?.[0]).toMatchObject({ petId: "companion", includeDefaultRules: false });
  expect(saveAi.mock.calls[0]?.[0].rules).toHaveLength(1);
});

it("associates a friendly blank-name error with the field and preserves backend rejection messages", async () => {
  const view = mount();
  await view.findByRole("tab", { name: "Settings" });
  selectTab(view, "Settings");
  const name = view.getByRole("textbox", { name: "Companion name" });
  fireEvent.change(name, { target: { value: " " } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  const error = await view.findByRole("alert");
  expect(error.textContent).toBe("Enter a companion name.");
  expect(name.getAttribute("aria-describedby")).toContain(error.id);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(name);
  expect(update).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: "Rejected" } });
  expect(view.queryByRole("alert")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await view.findByText("This companion cannot be renamed right now.");
  expect((view.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(name, { target: { value: "Sora" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(data.pet?.name).toBe("Sora"));
});

it("keeps the selected loadout and save action before compact searchable choices and enforces shared slots", async () => {
  const view = mount();
  await view.findByRole("tab", { name: "Abilities" });
  selectTab(view, "Abilities");
  const choices = view.getByRole("group", { name: "Available companion abilities" });
  const save = view.getByRole("button", { name: "Save abilities" });
  expect(save.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(choices).getAllByRole("checkbox")).toHaveLength(18);
  fireEvent.click(view.getByRole("checkbox", { name: /Strike 0 Jutsu/ }));
  fireEvent.click(view.getByRole("checkbox", { name: /Strike 1 Jutsu/ }));
  fireEvent.click(view.getByRole("checkbox", { name: /Skill 0 Skill/ }));
  expect((view.getByRole("checkbox", { name: /Strike 2 Jutsu/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole("checkbox", { name: /Strike 0 Jutsu/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(view.getAllByText("This loadout exceeds your pet's purchased or rank-limited ability slots.").every((message) => message.closest("details")?.open === false)).toBe(true);
  fireEvent.change(view.getByRole("textbox", { name: "Find an ability" }), { target: { value: "Strike 0" } });
  expect(within(choices).getAllByRole("checkbox")).toHaveLength(1);
  selectTab(view, "Care");
  selectTab(view, "Abilities");
  fireEvent.click(view.getByRole("button", { name: "Save abilities" }));
  await waitFor(() => expect(saveAbilities).toHaveBeenCalledWith({ petId: "companion", jutsuIds: ["jutsu-0", "jutsu-1"], skillIds: ["skill-0"] }));
  await waitFor(() => expect((view.getByRole("button", { name: "Save abilities" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(view.getByRole("button", { name: "Clear selection" }));
  expect(view.getByText("No abilities selected.")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Save abilities" }));
  await waitFor(() => expect(saveAbilities).toHaveBeenLastCalledWith({ petId: "companion", jutsuIds: [], skillIds: [] }));
});

it.each([false, true])("shows the feeding cadence with combat enabled %s and feeds using the displayed inventory snapshot", async (enabled) => {
  PET_BATTLE_CONFIG.enabled = enabled;
  const view = mount();
  fireEvent.click(await view.findByRole("button", { name: "Feed one meal" }));
  expect(view.getByText(enabled ? "Share a meal once each UTC day" : `Share a meal every ${PET_FEED_COOLDOWN_HOURS} hours`)).toBeTruthy();
  await waitFor(() => expect(feed).toHaveBeenCalledWith({ petId: "companion", userItemId: "meal", expectedQuantity: 2 }));
  expect(view.getByRole("tabpanel", { name: /^Care$/ }).textContent).not.toContain("training points");
  selectTab(view, "Training");
  expect(view.getByText("100 training points available")).toBeTruthy();
});

it("keeps feeding unavailable until the server-time countdown expires and refreshes eligibility in place", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  timeDiff = 5000;
  data = { ...data, canFeed: false, feedAvailableAt: new Date(now - 3000) };
  const view = mount();
  await view.findByText(/Next meal available in/);
  expect(view.queryByRole("button", { name: "Feed one meal" })).toBeNull();
  expect(feed).not.toHaveBeenCalled();
  now += 1999;
  await view.findByText("0 seconds");
  expect(getPet).toHaveBeenCalledTimes(1);
  expect(view.queryByRole("button", { name: "Feed one meal" })).toBeNull();
  data = { ...data, canFeed: true, feedAvailableAt: null };
  now += 1;
  const action = await view.findByRole("button", { name: "Feed one meal" });
  expect(getPet).toHaveBeenCalledTimes(2);
  expect((action as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(action);
  await waitFor(() => expect(feed).toHaveBeenCalledTimes(1));
});

it.each([
  [1, "/travel?sector=" + MAP_WAKE_ISLAND_SECTOR, "Travel to Wake Island"],
  [MAP_WAKE_ISLAND_SECTOR, "/pets", "Open sanctuary"],
])("offers a reachable sanctuary destination from sector %s", async (sector, href, label) => {
  owner.sector = Number(sector);
  const view = mount();
  expect((await view.findByRole("link", { name: String(label) })).getAttribute("href")).toBe(href);
  expect(view.queryByRole("link", { name: "Visit the sanctuary" })).toBeNull();
});

it("offers one targeted sanctuary action for an empty collection", async () => {
  data = { ...data, pet: null, pets: [], activePetId: null };
  const view = mount();
  const action = await view.findByRole("link", { name: "Travel to Wake Island" });
  expect(action.getAttribute("href")).toBe(`/travel?sector=${MAP_WAKE_ISLAND_SECTOR}`);
  expect(view.queryByRole("link", { name: "Open sanctuary" })).toBeNull();
});

it("opens the existing home kitchen directly when the owner is at home", async () => {
  data = { ...data, feedMeals: [] };
  const view = mount();
  expect((await view.findByRole("link", { name: "Open kitchen" })).getAttribute("href")).toBe("/home?panel=kitchen");
});

it("opens the owner kitchen for a roaming outlaw whose resolved village is the Syndicate", async () => {
  owner.isOutlaw = true;
  owner.sector = 2;
  data = { ...data, feedMeals: [] };
  const view = mount();
  expect((await view.findByRole("link", { name: "Open kitchen" })).getAttribute("href")).toBe("/home?panel=kitchen");
  expect(view.queryByRole("link", { name: "Travel home to cook" })).toBeNull();
});

it("targets the owner's home village when cooking is elsewhere", async () => {
  owner.sector = MAP_WAKE_ISLAND_SECTOR;
  data = { ...data, feedMeals: [] };
  const view = mount();
  expect((await view.findByRole("link", { name: "Travel home to cook" })).getAttribute("href")).toBe("/travel?sector=1");
  expect(view.getByText(/home kitchen in Horizon/)).toBeTruthy();
  expect(view.queryByRole("link", { name: "Open kitchen" })).toBeNull();
});

it.each(["ASLEEP", "BATTLE"])("explains unavailable travel without leaving a working link while %s", async (status) => {
  owner.status = status;
  owner.sector = 2;
  data = { ...data, feedMeals: [] };
  const view = mount();
  expect((await view.findByRole("button", { name: "Travel to Wake Island" }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole("button", { name: "Travel home to cook" }) as HTMLButtonElement).disabled).toBe(true);
  expect(view.queryByRole("link", { name: /Travel/ })).toBeNull();
  expect(view.getAllByText(/awake state outside battle to travel/)).toHaveLength(2);
});

it("explains missing home kitchens without sending the player to an inaccessible home", async () => {
  owner.village.structures = [];
  data = { ...data, feedMeals: [] };
  const view = mount();
  await view.findByText("Your current village does not have a home kitchen.");
  expect(view.queryByRole("link", { name: /kitchen|cook/ })).toBeNull();
});

it.each([
  [{}, "/profile?tab=pet"],
  [{ petId: "pet / one" }, "/profile?tab=pet&petId=pet+%2F+one"],
  [{ petId: ["selected", "ignored"] }, "/profile?tab=pet&petId=selected"],
] as const)("redirects the standalone profile with canonical pet selection %j", async (params, expected) => {
  const redirect = vi.spyOn(navigation, "redirect").mockImplementation((url) => { throw new Error(String(url)); });
  await expect(PetProfilePage({ searchParams: Promise.resolve(params as { petId?: string | string[] }) })).rejects.toThrow(expected);
  expect(redirect).toHaveBeenCalledWith(expected);
});
