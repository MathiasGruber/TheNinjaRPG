"use client";

import { PawPrint, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PET_OPTION_COUNTS,
  PET_REPLACEMENT_COST,
  PET_SANCTUARY_NAME,
} from "@/drizzle/constants";
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

export function PetAcquisition() {
  const { data: userData } = useRequiredUserData();
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<PetSelection>(emptySelection);
  const [message, setMessage] = useState<string | null>(null);
  const [wasAcquired, setWasAcquired] = useState(false);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const inFlight = useRef(false);
  const selectedDay = useRef<string | null>(null);
  const selectedCatalogue = useRef<string | null>(null);
  const { data, isPending, error, refetch } = api.pets.getPet.useQuery(undefined, {
    enabled: !!userData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) =>
      isAcquiring || query.state.data?.pet?.generationStatus === "GENERATING"
        ? 3000
        : false,
  });
  const dayKey = data?.dayKey;
  const catalogueKey = data
    ? `${data.dayKey}:${data.optionCount}:${Object.values(data.options)
        .flatMap((options) => options.map((option) => option.index))
        .join(",")}`
    : null;
  useEffect(() => {
    if (!dayKey || !catalogueKey || catalogueKey === selectedCatalogue.current) return;
    if (selectedCatalogue.current) {
      setSelection(emptySelection);
      setMessage(
        selectedDay.current !== dayKey
          ? "A new UTC day has begun. Choose from today's refreshed options."
          : "Your available companion traits changed. Review the choices again.",
      );
    }
    selectedDay.current = dayKey;
    selectedCatalogue.current = catalogueKey;
  }, [dayKey, catalogueKey]);

  const finishMutation = async (result: { success: boolean; message: string }) => {
    setMessage(result.success ? null : result.message);
    showMutationToast(result);
    await Promise.all([
      utils.pets.getPet.invalidate(),
      utils.profile.getUser.invalidate(),
    ]);
  };
  const failMutation = async (cause: { message: string }) => {
    setMessage(cause.message);
    // A failed response can follow a committed claim; reload before offering another adoption.
    await Promise.all([
      utils.pets.getPet.invalidate(),
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
        setWasAcquired(false);
        setName("");
        setSelection(emptySelection);
      }
    },
    onError: failMutation,
  });
  const isBusy =
    isAcquiring || acquire.isPending || generate.isPending || release.isPending;

  const meetPet = async () => {
    if (inFlight.current || !data) return;
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
    try {
      const result = await acquire.mutateAsync(parsed.data);
      if (result.success) {
        setWasAcquired(true);
        await generate.mutateAsync();
      }
    } catch {
      // A claimed companion survives image failures and can be retried without a second charge.
    } finally {
      inFlight.current = false;
      setIsAcquiring(false);
    }
  };
  const retryAppearance = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsAcquiring(true);
    setMessage(null);
    try {
      await generate.mutateAsync();
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
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </ContentBox>
    );

  const pet = data.pet;
  const selectedTraits = [
    data.options.species.find((option) => option.index === selection.speciesIndex),
    data.options.palettes.find((option) => option.index === selection.paletteIndex),
    data.options.characteristics.find(
      (option) => option.index === selection.characteristicIndex,
    ),
    data.options.auras.find((option) => option.index === selection.auraIndex),
  ];
  const hasSelection = selectedTraits.every(Boolean) && name.trim().length > 0;
  const canMeetPet =
    data.canAcquire && data.remainingGenerations > 0 && hasSelection && !isBusy;
  const isReplacement = data.replacementCost > 0;
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
      {pet && (
        <div className="mb-5 flex flex-col gap-4 rounded border bg-muted/30 p-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded border bg-background">
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
          <div className="grow space-y-2">
            <h3 className="font-semibold">
              {pet.name} · {getPetRank(pet.rank).name}
            </h3>
            <p className="text-sm">
              {appearanceReady
                ? "Your companion is ready. Manage its stats, evolution and battle settings from your pet profile."
                : pet.generationStatus === "GENERATING"
                  ? "Your companion's image is being created. You can safely return to your pet profile while it finishes."
                  : "Your companion has been claimed. Finish its appearance for free before it can join battle."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/profile/pet">View my pet</Link>
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
                disabled={!canRelease}
                button={
                  <Button variant="destructive" disabled={!canRelease}>
                    {release.isPending ? "Releasing..." : "Release companion"}
                  </Button>
                }
                onAccept={() => release.mutate()}
              >
                <p>
                  {pet.name} will return to the wild groves of the {PET_SANCTUARY_NAME}.
                  Its stats, rank and artwork are removed, and all unused pet experience
                  is reset. A new companion will cost {PET_REPLACEMENT_COST} reputation
                  points.
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
      {wasAcquired ? (
        <div className="space-y-3">
          <p>
            {appearanceReady
              ? "Your new companion is ready to join you."
              : "Your bond is saved. You can finish your companion's appearance from its profile."}
          </p>
          <Button asChild>
            <Link href="/profile/pet">Open pet profile</Link>
          </Button>
        </div>
      ) : pet ? (
        <p className="text-sm">
          Release your current companion before choosing a new one. Releasing resets all
          pet progress and unused pet experience; your next companion costs{" "}
          {PET_REPLACEMENT_COST} reputation points.
        </p>
      ) : (
        <>
          <div className="mb-6 space-y-3 rounded border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {data.optionCount} choices per trait today
              </Badge>
              <Badge variant="outline">{data.dayKey} UTC</Badge>
            </div>
            <p>
              Choose a species, colour palette, defining characteristic and aura. The
              Bondkeepers create one image from your choices; these traits shape its
              appearance.
            </p>
            <p className="text-muted-foreground text-sm">
              Today's choices stay the same when you return and refresh at midnight UTC.
              Regular accounts receive {PET_OPTION_COUNTS.NONE} choices per trait;
              Normal, Silver and Gold federal support gives {PET_OPTION_COUNTS.NORMAL},{" "}
              {PET_OPTION_COUNTS.SILVER} and {PET_OPTION_COUNTS.GOLD}.
            </p>
            <p className="text-sm">
              {isReplacement
                ? `Forming your next bond costs ${data.replacementCost} reputation points. Your new companion starts at the first rank.`
                : "Your first companion is free."}
            </p>
            <p className="text-muted-foreground text-sm">
              {data.remainingGenerations} / {data.generationLimit} image attempts remain
              today. Retrying a failed image uses an attempt and does not charge
              reputation.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isReplacement && canMeetPet) void meetPet();
            }}
          >
            <div className="mb-6 space-y-2">
              <Label htmlFor="new-pet-name">Companion name</Label>
              <Input
                id="new-pet-name"
                placeholder="Name your companion"
                value={name}
                maxLength={40}
                disabled={isBusy || !data.canAcquire}
                onChange={(event) => setName(event.target.value)}
                className="max-w-md"
              />
            </div>
            <div className="space-y-6">
              <PetTraitChoices
                title="1. Species"
                field="speciesIndex"
                options={data.options.species}
                selected={selection.speciesIndex}
                disabled={isBusy || !data.canAcquire}
                onSelect={(index) =>
                  setSelection((previous) => ({ ...previous, speciesIndex: index }))
                }
              />
              <PetTraitChoices
                title="2. Colour palette"
                field="paletteIndex"
                options={data.options.palettes}
                selected={selection.paletteIndex}
                disabled={isBusy || !data.canAcquire}
                onSelect={(index) =>
                  setSelection((previous) => ({ ...previous, paletteIndex: index }))
                }
              />
              <PetTraitChoices
                title="3. Defining characteristic"
                field="characteristicIndex"
                options={data.options.characteristics}
                selected={selection.characteristicIndex}
                disabled={isBusy || !data.canAcquire}
                onSelect={(index) =>
                  setSelection((previous) => ({
                    ...previous,
                    characteristicIndex: index,
                  }))
                }
              />
              <PetTraitChoices
                title="4. Aura"
                field="auraIndex"
                options={data.options.auras}
                selected={selection.auraIndex}
                disabled={isBusy || !data.canAcquire}
                onSelect={(index) =>
                  setSelection((previous) => ({ ...previous, auraIndex: index }))
                }
              />
            </div>
            <div className="mt-6 space-y-3 rounded border bg-muted/30 p-4">
              <h3 className="font-semibold">Your bond</h3>
              <p>
                {name.trim() || "Your companion"} ·{" "}
                {selectedTraits
                  .map((trait) => trait?.name ?? "Choose a trait")
                  .join(" · ")}
              </p>
              <p className="text-sm">
                The same companion can grow through {getPetRank(1).name} and later ranks
                as you train. Each evolution uses its previous image to keep its
                identity.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {isReplacement ? (
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
              {!hasSelection && (
                <p className="text-muted-foreground text-sm">
                  Choose four traits and a name to continue.
                </p>
              )}
            </div>
          </form>
          {data.unavailableReason && (
            <p className="mt-3 text-sm" role="status">
              {data.unavailableReason}
            </p>
          )}
          {data.remainingGenerations <= 0 && (
            <p className="mt-3 text-sm" role="status">
              You have used today's image attempts. Return after midnight UTC to create
              an appearance.
            </p>
          )}
        </>
      )}
    </ContentBox>
  );
}

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
      <legend className="mb-3 font-semibold text-lg">{title}</legend>
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
              <span className="block font-medium">{option.name}</span>
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
