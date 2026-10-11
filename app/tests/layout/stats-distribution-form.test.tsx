import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { ComponentProps } from "react";
import { ELEMENTAL_MASTERY_CAP } from "@/drizzle/constants";
import * as tutorial from "@/hooks/tutorial";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
import type { UserWithRelations } from "@/routers/profile";
import { ensureDom } from "../setup-dom.mjs";

const inputPreferenceKey = "statsDistributionUseInputBoxes";
let savedInputPreference: string | null;

beforeEach(() => {
  ensureDom();
  savedInputPreference = localStorage.getItem(inputPreferenceKey);
  localStorage.setItem(inputPreferenceKey, "true");
  vi.spyOn(tutorial, "useTutorialStep").mockReturnValue({
    currentStep: null,
    handleNextStep: vi.fn(),
  } as unknown as ReturnType<typeof tutorial.useTutorialStep>);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (savedInputPreference === null) localStorage.removeItem(inputPreferenceKey);
  else localStorage.setItem(inputPreferenceKey, savedInputPreference);
});

const trainee = {
  rank: "JONIN",
  status: "AWAKE",
  earnedExperience: 4499,
  offence: 10,
  defence: 10,
  strength: 10,
  speed: 10,
  intelligence: 10,
  willpower: 10,
  ninjutsuMastery: 10,
  genjutsuMastery: 10,
  taijutsuMastery: 10,
  bukijutsuMastery: 10,
  bloodlineMastery: 10,
  sageMastery: 10,
  masteryRanks: {},
  primaryElement: "Fire",
  secondaryElement: "Water",
  elementalMastery: { Lightning: ELEMENTAL_MASTERY_CAP - 0.5 },
} as unknown as NonNullable<UserWithRelations>;

type Accept = ComponentProps<typeof DistributeStatsForm>["onAccept"];
const form = (onAccept: Accept, userData = trainee) => (
  <DistributeStatsForm
    includeMasteries
    showWrapper={false}
    userData={userData}
    availableStats={userData.earnedExperience}
    onAccept={onAccept}
    isPending={false}
  />
);

describe("advanced experience assignment drafts", () => {
  it("allows another allocation after a successful elemental allocation reaches its cap", async () => {
    const accept = vi.fn(async (_data: Parameters<Accept>[0]) => true);
    const view = render(form(accept));
    fireEvent.input(view.getByRole("spinbutton", { name: /^Lightning/ }), {
      target: { value: "1" },
    });
    fireEvent.click(view.getByRole("button", { name: "Assign points" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));

    view.rerender(
      form(accept, {
        ...trainee,
        earnedExperience: 4498,
        elementalMastery: { Lightning: ELEMENTAL_MASTERY_CAP },
      }),
    );
    expect(view.queryByRole("spinbutton", { name: /^Lightning/ })).toBeNull();
    fireEvent.input(view.getByRole("spinbutton", { name: /^Offence/ }), {
      target: { value: "10" },
    });
    fireEvent.click(view.getByRole("button", { name: "Assign points" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
    expect(accept.mock.lastCall?.[0]).toMatchObject({ offence: 10, Lightning: 0 });
  });

  it.each([false, undefined])("retains the draft when submission returns %s", async (result) => {
    const accept = vi.fn(async () => result);
    const view = render(form(accept));
    fireEvent.input(view.getByRole("spinbutton", { name: /^Lightning/ }), {
      target: { value: "1" },
    });
    fireEvent.click(view.getByRole("button", { name: "Assign points" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect((view.getByRole("spinbutton", { name: /^Lightning/ }) as HTMLInputElement).value).toBe("1");
    expect(view.getByRole("button", { name: "Assign points" })).toBeTruthy();
  });

  it("keeps a draft through an unrelated unused-XP update", async () => {
    const accept = vi.fn();
    const view = render(form(accept));
    await act(async () => {
      fireEvent.input(view.getByRole("spinbutton", { name: /^Offence/ }), {
        target: { value: "10" },
      });
      view.rerender(form(accept, { ...trainee, earnedExperience: 5000 }));
    });
    expect((view.getByRole("spinbutton", { name: /^Offence/ }) as HTMLInputElement).value).toBe("10");
    expect(accept).not.toHaveBeenCalled();
  });
});
