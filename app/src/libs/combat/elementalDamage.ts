import {
  type BasicElement,
  BasicElementName,
  type ElementName,
} from "@/drizzle/constants";
import type { ZodAllTags } from "@/validators/combat";

/**
 * Use the saved preference, then a basic innate primary element, then Fire.
 * Bloodlines and active Elemental Mastery do not participate in this choice.
 */
export const getPreferredDamageElement = (user: DamageElementSource): BasicElement =>
  user.preferredDamageElement ??
  BasicElementName.find((element) => element === user.primaryElement) ??
  // Students, companions and older NPCs may have no basic innate element.
  BasicElementName[0];

/**
 * Copy the authoring variant into ordinary damage before potency and barriers.
 * Catalog tags stay unchanged; resolved elements persist on later effect ticks.
 * Other tags retain their identity and any attached runtime metadata.
 */
export const resolveElementalDamage = <T extends ZodAllTags>(
  tag: T,
  user: DamageElementSource,
): ResolvedDamageTag<T> =>
  (tag.type === "elementaldamage"
    ? { ...tag, type: "damage", elements: [getPreferredDamageElement(user)] }
    : tag) as ResolvedDamageTag<T>;

/** Shared input for profile rows, companion species and preloaded battle actors. */
type DamageElementSource = {
  preferredDamageElement?: BasicElement | null;
  primaryElement?: ElementName | null;
};

/** Narrow the authoring variant while retaining the caller's extra effect fields. */
type ResolvedDamageTag<T> = T extends { type: "elementaldamage" }
  ? Omit<T, "type"> & { type: "damage"; elements: BasicElement[] }
  : T;
