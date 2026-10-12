import {
  type BasicElement,
  ELEMENTAL_MASTERY_CAP,
  type ElementName,
} from "@/drizzle/constants";
import { getBloodlineElements } from "@/libs/userElements";
import type { ZodAllTags } from "@/validators/combat";

export type ElementalMasterySource = {
  elementalMastery?: Partial<Record<BasicElement, number>>;
  activeTrainedElement?: BasicElement | null;
  primaryElement?: ElementName | null;
  secondaryElement?: ElementName | null;
  bloodline?: { effects: ZodAllTags[] } | null;
};

/** Bloodline elements replace the innate pair for both access and mastery eligibility. */
export const providedElements = (user: ElementalMasterySource): ElementName[] => {
  const bloodlineElements = getBloodlineElements(user);
  const elements =
    bloodlineElements.length > 0
      ? bloodlineElements
      : [user.primaryElement, user.secondaryElement];
  return [...new Set(elements)].filter((element): element is ElementName => !!element);
};

export const elementalGainRoom = (
  user: ElementalMasterySource,
  element: BasicElement,
) =>
  providedElements(user).includes(element)
    ? 0
    : Math.max(0, ELEMENTAL_MASTERY_CAP - (user.elementalMastery?.[element] ?? 0));

/** Re-resolve against the current bloodline so swaps cannot enable a duplicate element. */
export const activeTrainedElement = (
  user: ElementalMasterySource,
): BasicElement | null => {
  const element = user.activeTrainedElement;
  return element &&
    (user.elementalMastery?.[element] ?? 0) >= ELEMENTAL_MASTERY_CAP &&
    !providedElements(user).includes(element)
    ? element
    : null;
};
