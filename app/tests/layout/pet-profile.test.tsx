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
import * as ContentBox from "@/layout/ContentBox";
import * as Image from "@/layout/Image";
import * as ItemWithEffects from "@/layout/ItemWithEffects";
import * as Link from "@/layout/Link";
import { PetProfile } from "@/layout/PetProfile";
import * as StatsDistributionForm from "@/layout/StatsDistributionForm";
import { getPetAbilityCapacity } from "@/libs/pets/abilities";
import * as toast from "@/libs/toast";
import * as UserContext from "@/utils/UserContext";
import { petJutsuFixture, petSkillFixture } from "../libs/pets/helpers/abilities";
import { ensureDom } from "../setup-dom.mjs";

const testApi = createTRPCReact<AppRouter>();
type PetView = RouterOutputs["pets"]["getPet"];
const owner = { userId: "owner", role: "USER", status: "AWAKE", rank: "JONIN", reputationPoints: 1000 };
let queryClient: QueryClient;
let data: PetView;
let requestedPetId: string | null;
let update: ReturnType<typeof vi.fn>;
let saveAbilities: ReturnType<typeof vi.fn>;
let feed: ReturnType<typeof vi.fn>;
let saveAi: ReturnType<typeof vi.fn>;

beforeEach(() => {
  ensureDom();
  requestedPetId = "companion";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const pet = {
    id: "companion", name: "Miso", rank: 7, experience: 0, storedExperience: 0,
    speciesIndex: 0, paletteIndex: 0, characteristicIndex: 0, auraIndex: 0,
    generationStatus: "READY", avatar: "/miso.webp", artRank: 7, battleEnabled: true,
    spawnPosition: "BEHIND", abilitySlots: 3, jutsuIds: [], skillIds: [],
    aiRules: [], includeDefaultRules: false, feedDay: null,
    offence: 10, defence: 10, strength: 10, speed: 10, intelligence: 10, willpower: 10,
  };
  data = {
    pet, pets: [pet], activePetId: pet.id, slots: 6, maxSlots: 6, maxRank: 7,
    nextRank: null, canRankUp: false, remainingGenerations: 3, generationLimit: 3,
    generationRetryAt: null, unusedExperience: 100, feedExperience: 25, dayKey: "2026-10-16",
    canFeed: true, feedMeals: [{ id: "meal", name: "Rice", quantity: 2 }],
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
  Object.assign(vi.spyOn(client, "api" as never), { pets: testApi.pets, ai: testApi.ai, useUtils: testApi.useUtils });
  vi.spyOn(navigation, "useSearchParams").mockImplementation(() => new URLSearchParams(requestedPetId ? { petId: requestedPetId } : {}) as never);
  vi.spyOn(UserContext, "useRequiredUserData").mockReturnValue({ data: owner } as never);
  vi.spyOn(ContentBox, "default").mockImplementation(({ title, children }) => <section aria-label={title}>{children}</section>);
  vi.spyOn(Image, "default").mockImplementation(({ alt }) => <img alt={alt} />);
  vi.spyOn(Link, "default").mockImplementation(({ href, children }) => <a href={String(href)}>{children}</a>);
  vi.spyOn(ItemWithEffects, "default").mockImplementation(({ item }) => <p>{"description" in item ? String(item.description) : item.name}</p>);
  vi.spyOn(StatsDistributionForm, "default").mockImplementation(({ disabled, availableStats }) => <p>{availableStats} training points {disabled ? "unavailable" : "available"}</p>);
  vi.spyOn(toast, "showMutationToast").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
});

const mount = () => {
  const trpcClient = testApi.createClient({ links: [() => ({ op }) => observable((observer) => {
    const respond = async () => {
      if (op.path === "pets.getPet") {
        expect(op.input).toEqual({ petId: "companion" });
        return data;
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

it("shows focused activities and preserves an AI draft while switching tabs", async () => {
  const view = mount();
  await view.findByRole("tablist", { name: "Companion activities" });
  expect(view.getAllByRole("tabpanel")).toHaveLength(1);
  const care = view.getByRole("tab", { name: "Care & training" });
  const carePanel = view.getByRole("tabpanel", { name: "Care & training" });
  expect(carePanel.getAttribute("aria-labelledby")).toBe(care.id);
  expect(carePanel.textContent).toContain("Feed one meal");
  act(() => care.focus());
  fireEvent.keyDown(care, { key: "ArrowRight" });
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
  selectTab(view, "Care & training");
  selectTab(view, "Abilities");
  fireEvent.click(view.getByRole("button", { name: "Save abilities" }));
  await waitFor(() => expect(saveAbilities).toHaveBeenCalledWith({ petId: "companion", jutsuIds: ["jutsu-0", "jutsu-1"], skillIds: ["skill-0"] }));
  await waitFor(() => expect((view.getByRole("button", { name: "Save abilities" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(view.getByRole("button", { name: "Clear selection" }));
  expect(view.getByText("No abilities selected.")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Save abilities" }));
  await waitFor(() => expect(saveAbilities).toHaveBeenLastCalledWith({ petId: "companion", jutsuIds: [], skillIds: [] }));
});

it("feeds from the care panel using the displayed inventory snapshot", async () => {
  const view = mount();
  fireEvent.click(await view.findByRole("button", { name: "Feed one meal" }));
  await waitFor(() => expect(feed).toHaveBeenCalledWith({ petId: "companion", userItemId: "meal", expectedQuantity: 2 }));
  expect(view.getByText("100 training points available")).toBeTruthy();
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
