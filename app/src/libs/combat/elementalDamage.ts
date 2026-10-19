import {
  type BasicElement,
  BasicElementName,
  type ElementName,
} from "@/drizzle/constants";
import type { ZodAllTags } from "@/validators/combat";

/** Innate rolls supply the default; bloodlines and elemental mastery do not override it. */
export const getPreferredDamageElement = (user: DamageElementSource): BasicElement =>
  user.preferredDamageElement ??
  BasicElementName.find((element) => element === user.primaryElement) ??
  // Students, companions and older NPCs may have no basic innate element.
  BasicElementName[0];

/** Resolve before potency, barriers and damage processing, without changing catalog data. */
export const resolveElementalDamage = <T extends ZodAllTags>(
  tag: T,
  user: DamageElementSource,
): ResolvedDamageTag<T> =>
  (tag.type === "elementaldamage"
    ? { ...tag, type: "damage", elements: [getPreferredDamageElement(user)] }
    : tag) as ResolvedDamageTag<T>;

type DamageElementSource = {
  preferredDamageElement?: BasicElement | null;
  primaryElement?: ElementName | null;
};

type ResolvedDamageTag<T> = T extends { type: "elementaldamage" }
  ? Omit<T, "type"> & { type: "damage"; elements: BasicElement[] }
  : T;
