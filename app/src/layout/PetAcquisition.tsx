"use client";

import { ChevronLeft, ChevronRight, PawPrint, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type RouterInputs } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PET_OPTION_COUNTS,
  PET_REPLACEMENT_COST,
  PET_SANCTUARY_NAME,
} from "@/drizzle/constants";
import Accordion from "@/layout/Accordion";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Countdown from "@/layout/Countdown";
import Image from "@/layout/Image";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import type { PetAppearanceOption } from "@/libs/pets/catalogue";
import { getPetRank, isPetAppearanceReady } from "@/libs/pets/progression";
import { showMutationToast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";
import { acquirePetSchema } from "@/validators/pets";

/**
 * Guide daily trait selection, claim a companion, then request its first artwork.
 * A saved companion survives image failures; uncertain adoption responses are
 * reconciled with the collection before another potentially paid claim is allowed.
 */
export function PetAcquisition() {
  const { data: userData } = useRequiredUserData();
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<PetSelection>(emptySelection);
  const [stage, setStage] = useState(0);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [acquiredPetId, setAcquiredPetId] = useState<string | null>(null);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [needsCollectionCheck, setNeedsCollectionCheck] = useState(false);
  // Lock synchronously across claim, artwork and recovery before pending state paints.
  const inFlight = useRef(false);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusStage = useRef(false);
  // Keep a pre-claim identity snapshot until the server's committed pet is known.
  const adoptionAttempt = useRef<{
    previousIds: Set<string>;
    input: RouterInputs["pets"]["acquirePet"];
  } | null>(null);
  const selectedDay = useRef<string | null>(null);
  const selectedCatalogue = useRef<string | null>(null);
  const { data, isPending, isFetching, error, refetch } = api.pets.getPet.useQuery(
    acquiredPetId ? { petId: acquiredPetId } : undefined,
    {
      enabled: !!userData,
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: (query) =>
        isAcquiring || query.state.data?.pet?.generationStatus === "GENERATING"
          ? 3000
          : false,
    },
  );
  const dayKey = data?.dayKey;
  // A tier change can alter offerings within the same day; both changes invalidate a draft.
  const catalogueKey = data
    ? `${data.dayKey}:${data.optionCount}:${Object.values(data.options)
        .flatMap((options) => options.map((option) => option.index))
        .join(",")}`
    : null;
  useEffect(() => {
    if (!dayKey || !catalogueKey || catalogueKey === selectedCatalogue.current) return;
    if (selectedCatalogue.current) {
      setSelection(emptySelection);
      setStage(0);
      setMessage(
        selectedDay.current !== dayKey
          ? "A new UTC day has begun. Choose from today's refreshed options."
          : "Your available companion traits changed. Review the choices again.",
      );
    }
    selectedDay.current = dayKey;
    selectedCatalogue.current = catalogueKey;
  }, [dayKey, catalogueKey]);
  useEffect(() => {
    if (shouldFocusStage.current) {
      stageHeading.current?.focus();
      shouldFocusStage.current = false;
    }
  }, [stage]);

  const changeStage = (next: number) => {
    shouldFocusStage.current = true;
    setStage(next);
  };

  const finishMutation = async (result: { success: boolean; message: string }) => {
    setMessage(result.success ? null : result.message);
    showMutationToast(result);
    await Promise.all([
      utils.pets.getPet.invalidate(),
      utils.pets.getCollection.invalidate(),
      utils.profile.getUser.invalidate(),
    ]);
  };
  const failMutation = async (cause: { message: string }) => {
    setMessage(cause.message);
    // A failed response can follow a committed claim; reload before offering another adoption.
    await Promise.all([
      utils.pets.getPet.invalidate(),
      utils.pets.getCollection.invalidate(),
      utils.profile.getUser.invalidate(),
    ]);
  };
  const acquire = api.pets.acquirePet.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const generate = api.pets.generateAppearance.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const release = api.pets.releasePet.useMutation({
    onSuccess: async (result) => {
      await finishMutation(result);
      if (result.success) {
        setAcquiredPetId(null);
        setName("");
        setSelection(emptySelection);
        setStage(0);
      }
    },
    onError: failMutation,
  });
  const isBusy =
    needsCollectionCheck ||
    isAcquiring ||
    acquire.isPending ||
    generate.isPending ||
    release.isPending;

  /** Reconcile an uncertain claim against newly added matching pets before enabling another charge. */
  const checkAdoption = async () => {
    const attempt = adoptionAttempt.current;
    if (!attempt) return;
    setNeedsCollectionCheck(true);
    const refreshed = await refetch({ throwOnError: false });
    if (refreshed.error || !refreshed.data) {
      setNeedsCollectionCheck(true);
      setMessage(
        "Your adoption could not be confirmed. Refresh your collection before trying again so you are not charged twice.",
      );
      return;
    }
    const claimed = refreshed.data.pets.find(
      (entry) =>
        !attempt.previousIds.has(entry.id) &&
        entry.name === attempt.input.name &&
        entry.speciesIndex === attempt.input.speciesIndex &&
        entry.paletteIndex === attempt.input.paletteIndex &&
        entry.characteristicIndex === attempt.input.characteristicIndex &&
        entry.auraIndex === attempt.input.auraIndex,
    );
    if (claimed) setAcquiredPetId(claimed.id);
    setNeedsCollectionCheck(false);
    adoptionAttempt.current = null;
    setMessage(
      claimed
        ? "Your companion is saved. Retry its appearance for free, or open its profile."
        : "Your collection was checked and no new matching companion was found. You can try adopting again.",
    );
  };

  /** Validate the displayed day's selection, claim once, then generate art for that committed pet. */
  const meetPet = async () => {
    if (inFlight.current || !data?.canAcquire || isBusy) return;
    if (Object.values(selection).some((value) => value === null)) {
      setMessage("Choose one option for each of your companion's four traits.");
      return;
    }
    const parsed = acquirePetSchema.safeParse({
      name,
      ...selection,
      dayKey: data.dayKey,
    });
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message ?? "Review your companion's name and traits.",
      );
      return;
    }
    inFlight.current = true;
    setIsAcquiring(true);
    setMessage(null);
    adoptionAttempt.current = {
      previousIds: new Set(data.pets.map((entry) => entry.id)),
      input: parsed.data,
    };
    try {
      const result = await acquire.mutateAsync(parsed.data);
      if (result.success && result.petId) {
        adoptionAttempt.current = null;
        setAcquiredPetId(result.petId);
        await generate.mutateAsync({ petId: result.petId });
      } else if (result.success) await checkAdoption();
      else adoptionAttempt.current = null;
    } catch {
      // A claimed companion survives image failures and can be retried without a second charge.
      if (adoptionAttempt.current) await checkAdoption();
    } finally {
      inFlight.current = false;
      setIsAcquiring(false);
    }
  };
  /** Resume artwork for the saved companion without re-entering the adoption/charge path. */
  const retryAppearance = async () => {
    if (inFlight.current || !data?.pet) return;
    inFlight.current = true;
    setIsAcquiring(true);
    setMessage(null);
    try {
      await generate.mutateAsync({ petId: data.pet.id });
    } catch {
      // The inline error keeps the companion and retry action visible.
    } finally {
      inFlight.current = false;
      setIsAcquiring(false);
    }
  };

  if (!userData || isPending)
    return <Loader explanation="The Bondkeepers are preparing today's choices..." />;
  if (error || !data)
    return (
      <ContentBox title="Meet your companion" initialBreak>
        <p role="alert" className="mb-3 text-red-600">
          {error?.message ?? "Today's companions could not be loaded."}
        </p>
        <Button
          variant="outline"
          onClick={() => void (needsCollectionCheck ? checkAdoption() : refetch())}
        >
          Try again
        </Button>
      </ContentBox>
    );

  const pet = data.pet;
  const selectedTraits = traitStages.map((trait) =>
    data.options[trait.options].find(
      (option) => option.index === selection[trait.field],
    ),
  );
  const activeTrait = traitStages[stage];
  const hasSelection = selectedTraits.every(Boolean) && name.trim().length > 0;
  const canMeetPet = data.canAcquire && hasSelection && !isBusy;
  const isReplacement = data.replacementCost > 0;
  const unavailableReason =
    data.pets.length >= data.slots && data.slots >= data.maxSlots
      ? "Your collection is full. Release a companion before adopting another."
      : data.unavailableReason;
  const appearanceReady = pet ? isPetAppearanceReady(pet) : false;
  const retryAt = data.generationRetryAt;
  const canRetry =
    pet && !appearanceReady && (retryAt === null || retryAt.getTime() <= Date.now());
  const canRelease =
    !isBusy &&
    userData.status === "AWAKE" &&
    (pet?.generationStatus !== "GENERATING" || canRetry);

  return (
    <ContentBox
      title="Meet your companion"
      subtitle="Choose the creature you will raise together"
      initialBreak
    >
      {message && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-600"
        >
          {message}
        </p>
      )}
      {needsCollectionCheck && (
        <Button
          variant="outline"
          className="mb-4"
          disabled={isFetching}
          onClick={() => void checkAdoption()}
        >
          {isFetching ? "Checking collection..." : "Refresh collection"}
        </Button>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline">
          {data.pets.length} / {data.slots} companion slots occupied
        </Badge>
        <Button variant="outline" asChild>
          <Link href="/profile?tab=pet">Manage my collection</Link>
        </Button>
      </div>
      {!acquiredPetId && unavailableReason && (
        <p className="mb-4 rounded border bg-muted/30 p-3 text-sm" role="status">
          {unavailableReason}
        </p>
      )}
      {pet && (
        <div
          className={`mb-4 flex rounded border bg-muted/30 ${appearanceReady ? "items-start gap-3 p-3" : "flex-col gap-4 p-4 sm:flex-row sm:items-center"}`}
        >
          <div
            className={`flex shrink-0 items-center justify-center rounded border bg-background ${appearanceReady ? "h-16 w-16" : "h-24 w-24"}`}
          >
            {pet.avatar ? (
              <Image
                src={pet.avatar}
                alt={pet.name}
                width={96}
                height={96}
                className="h-full w-full object-contain"
              />
            ) : (
              <PawPrint
                className="h-12 w-12 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="min-w-0 grow space-y-2">
            <h3 className="break-words font-semibold">
              {pet.name} · {getPetRank(pet.rank).name}
            </h3>
            {!appearanceReady && (
              <p className="text-sm">
                {pet.generationStatus === "GENERATING"
                  ? "Your companion's image is being created. You can safely return to your pet profile while it finishes."
                  : "Your companion has been claimed. Finish its appearance for free before it can join battle."}
              </p>
            )}
            {!appearanceReady && (
              <p className="text-muted-foreground text-sm">
                {data.remainingGenerations} / {data.generationLimit} image attempts
                remain today. Attempts reset at midnight UTC.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/profile?tab=pet&petId=${encodeURIComponent(pet.id)}`}>
                  View companion
                </Link>
              </Button>
              {canRetry && (
                <Button
                  disabled={
                    isBusy ||
                    data.remainingGenerations <= 0 ||
                    userData.status !== "AWAKE"
                  }
                  onClick={() => void retryAppearance()}
                >
                  {generate.isPending
                    ? "Creating appearance..."
                    : "Retry appearance for free"}
                </Button>
              )}
              <Confirm
                title={`Release ${pet.name}?`}
                className="break-words [&>div]:min-w-0"
                disabled={!canRelease}
                button={
                  <Button variant="destructive" disabled={!canRelease}>
                    {release.isPending ? "Releasing..." : "Release companion"}
                  </Button>
                }
                onAccept={() => release.mutate({ petId: pet.id })}
              >
                <p>
                  {pet.name} will return to the wild groves of the {PET_SANCTUARY_NAME}.
                  Its stats, rank, artwork and unused experience are removed. Your other
                  companions are kept. A new companion will cost {PET_REPLACEMENT_COST}{" "}
                  reputation points.
                </p>
              </Confirm>
            </div>
            {!appearanceReady && retryAt && !canRetry && (
              <p className="text-muted-foreground text-sm">
                Appearance retry available in{" "}
                <Countdown targetDate={retryAt} onFinish={() => void refetch()} />.
              </p>
            )}
          </div>
        </div>
      )}
      {isBusy && (
        <div className="mb-4" aria-live="polite">
          <Loader
            explanation={
              generate.isPending
                ? "Creating your companion's unique image. This can take a few minutes..."
                : "Forming your new bond..."
            }
          />
        </div>
      )}
      {acquiredPetId ? (
        <div className="space-y-3">
          <p>
            {appearanceReady
              ? "Your new companion is ready to join you."
              : "Your bond is saved. You can finish your companion's appearance from its profile."}
          </p>
          <Button asChild>
            <Link href={`/profile?tab=pet&petId=${encodeURIComponent(acquiredPetId)}`}>
              Open pet profile
            </Link>
          </Button>
          {data.canAcquire && (
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => {
                setAcquiredPetId(null);
                setName("");
                setSelection(emptySelection);
                setStage(0);
              }}
            >
              Meet another companion
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{data.optionCount} choices per trait</Badge>
              <Badge variant="outline">{data.dayKey} UTC</Badge>
            </div>
            <p>
              {isReplacement
                ? `New companion: ${data.replacementCost} reputation points.`
                : "Your first companion is free."}{" "}
              {data.generationLimit} image attempts per companion each UTC day; failed
              image retries cost no reputation. Choices reset at midnight UTC.
            </p>
            <Accordion
              title="About your bond and daily choices"
              selectedTitle={details}
              onClick={setDetails}
              collapsible
              className="px-0"
            >
              <div className="space-y-2 py-3 text-muted-foreground">
                <p>
                  Choose a species, colour palette, defining characteristic and aura.
                  The Bondkeepers create one image from these appearance traits. Your
                  companion starts at {getPetRank(1).name} and keeps its identity
                  through later evolutions.
                </p>
                <p>
                  Regular accounts receive {PET_OPTION_COUNTS.NONE} choices per trait;
                  Normal, Silver and Gold federal support gives{" "}
                  {PET_OPTION_COUNTS.NORMAL}, {PET_OPTION_COUNTS.SILVER} and{" "}
                  {PET_OPTION_COUNTS.GOLD}. Federal support also improves the rarity of
                  daily species choices. Today's choices stay the same when you return.
                </p>
                {data.activePetId && (
                  <p>
                    Your active companion stays with you; the new pet joins your
                    collection with new pet stats.
                  </p>
                )}
              </div>
            </Accordion>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (isBusy) return;
              if (activeTrait && selectedTraits[stage]) changeStage(stage + 1);
              else if (!activeTrait && !isReplacement && canMeetPet) void meetPet();
            }}
          >
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h3 ref={stageHeading} tabIndex={-1} className="font-semibold text-lg">
                {activeTrait?.title ?? "Name your companion"}
              </h3>
              <span className="shrink-0 text-muted-foreground text-sm">
                Step {stage + 1} of {traitStages.length + 1}
              </span>
            </div>
            {activeTrait ? (
              <PetTraitChoices
                title={activeTrait.title}
                field={activeTrait.field}
                options={data.options[activeTrait.options]}
                selected={selection[activeTrait.field]}
                disabled={isBusy}
                onSelect={(index) =>
                  setSelection((previous) => ({
                    ...previous,
                    [activeTrait.field]: index,
                  }))
                }
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="new-pet-name">Companion name</Label>
                <Input
                  id="new-pet-name"
                  placeholder="Name your companion"
                  value={name}
                  maxLength={40}
                  disabled={isBusy}
                  onChange={(event) => setName(event.target.value)}
                  className="max-w-md"
                />
              </div>
            )}
            <div className="mt-4 rounded border bg-muted/30 p-3 text-sm">
              <h4 className="break-words font-semibold">
                Your bond{name.trim() && ` · ${name.trim()}`}
              </h4>
              <p className="mt-1 text-muted-foreground">
                {traitStages
                  .map(
                    (trait, index) =>
                      selectedTraits[index]?.name ?? `${trait.title}: choose`,
                  )
                  .join(" · ")}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {stage > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => changeStage(stage - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Choose one to continue.
                </span>
              )}
              {activeTrait ? (
                <Button
                  type="button"
                  disabled={isBusy || !selectedTraits[stage]}
                  onClick={() => changeStage(stage + 1)}
                >
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              ) : isReplacement ? (
                <Confirm
                  title={`Form a new bond for ${data.replacementCost} reputation?`}
                  disabled={!canMeetPet}
                  button={
                    <Button type="button" disabled={!canMeetPet}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Meet my new companion
                    </Button>
                  }
                  onAccept={() => void meetPet()}
                >
                  <p className="mb-3">
                    The Bondkeepers will guide you to a new companion. This costs{" "}
                    {data.replacementCost} reputation points. Your companion starts at
                    the first rank with new pet stats.
                  </p>
                  <p>
                    New companion: <strong>{name.trim()}</strong> ·{" "}
                    {selectedTraits
                      .map((trait) => trait?.name)
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Confirm>
              ) : (
                <Button type="submit" disabled={!canMeetPet}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Meet my first companion
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </ContentBox>
  );
}

/** Accessible single-choice controls whose values remain the catalogue's persisted trait IDs. */
function PetTraitChoices({
  title,
  field,
  options,
  selected,
  disabled,
  onSelect,
}: {
  title: string;
  field: keyof PetSelection;
  options: PetAppearanceOption[];
  selected: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.index}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${selected === option.index ? "border-primary bg-primary/10" : "hover:bg-muted/40"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={`pet-${field}`}
              value={option.index}
              checked={selected === option.index}
              onChange={() => onSelect(option.index)}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{option.name}</span>
                {option.rarity && <Badge variant="outline">{option.rarity}</Badge>}
              </span>
              <span className="mt-1 block text-muted-foreground text-sm">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Incomplete wizard draft; null differs from catalogue index zero, which is a valid choice. */
type PetSelection = {
  speciesIndex: number | null;
  paletteIndex: number | null;
  characteristicIndex: number | null;
  auraIndex: number | null;
};
const emptySelection: PetSelection = {
  speciesIndex: null,
  paletteIndex: null,
  characteristicIndex: null,
  auraIndex: null,
};

const traitStages = [
  { title: "Species", field: "speciesIndex", options: "species" },
  { title: "Colour palette", field: "paletteIndex", options: "palettes" },
  {
    title: "Defining characteristic",
    field: "characteristicIndex",
    options: "characteristics",
  },
  { title: "Aura", field: "auraIndex", options: "auras" },
] as const;
