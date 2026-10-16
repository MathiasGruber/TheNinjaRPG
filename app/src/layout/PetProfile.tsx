"use client";

import { PawPrint, RefreshCw, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { api, type RouterInputs } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CombatStatNames,
  PET_RANKS,
  PET_REPLACEMENT_COST,
  PET_SANCTUARY_NAME,
  PetSpawnPositions,
} from "@/drizzle/constants";
import AiProfileEdit from "@/layout/AiProfileEdit";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Countdown from "@/layout/Countdown";
import Image from "@/layout/Image";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
import {
  getPetJutsuCost,
  getPetSkillCost,
  validatePetAbilities,
} from "@/libs/pets/abilities";
import {
  PET_AURAS,
  PET_CHARACTERISTICS,
  PET_PALETTES,
  PET_SPECIES,
} from "@/libs/pets/catalogue";
import {
  canUsePet,
  getPetLevel,
  getPetRank,
  getPetStatCaps,
  isPetAppearanceReady,
} from "@/libs/pets/progression";
import { showMutationToast } from "@/libs/toast";
import { capitalizeFirstLetter } from "@/utils/string";
import { useRequiredUserData } from "@/utils/UserContext";
import {
  PET_AI_ACTION_TYPES,
  PET_AI_EFFECT_TYPES,
  updatePetSchema,
} from "@/validators/pets";

/**
 * Manage the owner's collection and selected companion within the profile tab.
 * Generation polling and shared invalidation reconcile long-running artwork and
 * rewards; the server remains authoritative for eligibility and mutation results.
 */
export function PetProfile() {
  const { data: userData } = useRequiredUserData();
  const searchParams = useSearchParams();
  const requestedPetId = searchParams.get("petId") ?? undefined;
  const utils = api.useUtils();
  const [selectedPetId, setSelectedPetId] = useState(requestedPetId);
  const [selectedMealId, setSelectedMealId] = useState("");
  const [abilityDraft, setAbilityDraft] = useState<
    RouterInputs["pets"]["updateAbilities"] | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const nameForm = useForm({ defaultValues: { name: "" } });
  const petName = useWatch({ control: nameForm.control, name: "name" });
  const [activity, setActivity] = useState("care");
  const [abilitySearch, setAbilitySearch] = useState("");
  const [abilityKind, setAbilityKind] = useState("all");
  const [isEvolving, setIsEvolving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Close the gap before React paints pending state, including multi-step evolution.
  const inFlight = useRef(false);
  const { data, isPending, error, refetch } = api.pets.getPet.useQuery(
    selectedPetId ? { petId: selectedPetId } : undefined,
    {
      enabled: !!userData,
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: (query) =>
        isGenerating ||
        isEvolving ||
        query.state.data?.pets.some((entry) => entry.generationStatus === "GENERATING")
          ? 3000
          : false,
    },
  );
  const pet = data?.pet;
  const aiProfile = useMemo(
    () =>
      pet ? { rules: pet.aiRules, includeDefaultRules: pet.includeDefaultRules } : null,
    [pet?.aiRules, pet?.includeDefaultRules],
  );
  const ownerExperience = userData?.experience;
  const ownerEarnedExperience = userData?.earnedExperience;
  const ownerPetExperience = userData?.petExperience;
  const ownerUpdatedAt = userData?.updatedAt?.getTime();

  useEffect(() => {
    setSelectedPetId(requestedPetId);
  }, [requestedPetId]);
  useEffect(() => {
    if (selectedPetId && data && !data.pets.some((entry) => entry.id === selectedPetId))
      setSelectedPetId(undefined);
  }, [data, selectedPetId]);

  // Training and quest rewards update the player view; the pet bank is fetched separately.
  useEffect(() => {
    if (
      ownerUpdatedAt !== undefined ||
      ownerExperience !== undefined ||
      ownerEarnedExperience !== undefined ||
      ownerPetExperience !== undefined
    )
      void utils.pets.getPet.invalidate();
  }, [
    ownerUpdatedAt,
    ownerExperience,
    ownerEarnedExperience,
    ownerPetExperience,
    utils,
  ]);
  useEffect(() => {
    nameForm.reset({ name: pet?.name ?? "" });
    setMessage(null);
  }, [pet?.id, pet?.name, nameForm]);

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
    // A network failure may arrive after the server commits an adoption or artwork claim.
    await Promise.all([
      utils.pets.getPet.invalidate(),
      utils.pets.getCollection.invalidate(),
      utils.profile.getUser.invalidate(),
    ]);
  };
  const update = api.pets.updatePet.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const generate = api.pets.generateAppearance.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const evolve = api.pets.rankUp.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const assign = api.pets.assignExperience.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const updateAi = api.pets.updateAiConfig.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const release = api.pets.releasePet.useMutation({
    onSuccess: async (result) => {
      await finishMutation(result);
      if (result.success) setSelectedPetId(undefined);
    },
    onError: failMutation,
  });
  const activate = api.pets.activatePet.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const unlockSlot = api.pets.unlockSlot.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const feed = api.pets.feedPet.useMutation({
    onSuccess: async (result) => {
      await Promise.all([finishMutation(result), utils.item.getUserItems.invalidate()]);
    },
    onError: failMutation,
  });
  const updateAbilities = api.pets.updateAbilities.useMutation({
    onSuccess: async (result) => {
      await finishMutation(result);
      if (result.success) setAbilityDraft(null);
    },
    onError: failMutation,
  });
  const unlockAbilitySlot = api.pets.unlockAbilitySlot.useMutation({
    onSuccess: finishMutation,
    onError: failMutation,
  });
  const isBusy =
    isEvolving ||
    update.isPending ||
    generate.isPending ||
    evolve.isPending ||
    assign.isPending ||
    updateAi.isPending ||
    release.isPending ||
    activate.isPending ||
    unlockSlot.isPending ||
    feed.isPending ||
    updateAbilities.isPending ||
    unlockAbilitySlot.isPending;

  /** Retry the saved companion's current artwork without repeating adoption or rank-up. */
  const generateAppearance = async () => {
    if (inFlight.current || !pet) return;
    inFlight.current = true;
    setIsGenerating(true);
    setMessage(null);
    try {
      await generate.mutateAsync({ petId: pet.id });
    } catch {
      // Both the shared error toast and the inline message leave the retry action available.
    } finally {
      inFlight.current = false;
      setIsGenerating(false);
    }
  };
  /** Commit progression first, then generate its matching form; artwork failure remains retryable. */
  const evolvePet = async () => {
    if (inFlight.current || !pet) return;
    inFlight.current = true;
    setIsEvolving(true);
    setMessage(null);
    try {
      const result = await evolve.mutateAsync({ petId: pet.id });
      if (result.success) await generate.mutateAsync({ petId: pet.id });
    } catch {
      // The new rank is retained if artwork fails; retrying continues that evolution.
    } finally {
      inFlight.current = false;
      setIsEvolving(false);
    }
  };
  /** Report success to the shared allocation form so a rejected spend keeps its draft recoverable. */
  const assignExperience = async (
    stats: Omit<RouterInputs["pets"]["assignExperience"], "petId">,
  ) => {
    if (inFlight.current || !pet) return false;
    inFlight.current = true;
    setMessage(null);
    try {
      return (await assign.mutateAsync({ ...stats, petId: pet.id })).success;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
    }
  };

  if (!userData || isPending) return <Loader explanation="Loading your companion..." />;
  if (error || !data)
    return (
      <ContentBox title="Pet" subtitle="Your companion">
        <p role="alert" className="mb-3 text-red-600">
          {error?.message ?? "Your pet could not be loaded."}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </ContentBox>
    );
  const collection = (
    <ContentBox
      title="Your companions"
      subtitle={`${data.pets.length} / ${data.slots} collection slots`}
    >
      {!pet && message && (
        <p role="alert" className="mb-3 text-red-600">
          {message}
        </p>
      )}
      {data.pets.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="pet-collection">Companion</Label>
          <Select
            value={pet?.id ?? ""}
            disabled={isBusy}
            onValueChange={setSelectedPetId}
          >
            <SelectTrigger id="pet-collection">
              <SelectValue placeholder="Choose a companion" />
            </SelectTrigger>
            <SelectContent>
              {data.pets.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name} · {getPetRank(entry.rank).name}
                  {entry.id === data.activePetId ? " · Active" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/pets">Visit the sanctuary</Link>
        </Button>
        {data.slots < data.maxSlots && (
          <Confirm
            title={`Unlock a companion slot for ${data.slotCost} reputation?`}
            disabled={
              isBusy ||
              userData.status !== "AWAKE" ||
              userData.reputationPoints < data.slotCost
            }
            button={
              <Button
                variant="outline"
                disabled={
                  isBusy ||
                  userData.status !== "AWAKE" ||
                  userData.reputationPoints < data.slotCost
                }
              >
                Unlock slot · {data.slotCost} reputation
              </Button>
            }
            onAccept={() => unlockSlot.mutate()}
          >
            <p>
              Keep up to {data.slots + 1} companions. This permanent collection slot
              costs {data.slotCost} reputation points.
            </p>
          </Confirm>
        )}
      </div>
    </ContentBox>
  );

  if (!pet || !aiProfile)
    return (
      <>
        {collection}
        <ContentBox title="Pet" subtitle="Find a companion on Wake Island" initialBreak>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <PawPrint className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
            <p className="max-w-lg">
              The {PET_SANCTUARY_NAME} helps you form a bond with a unique creature.
              Choose its species, colours, characteristic and aura, then raise it
              alongside your shinobi.
            </p>
            <p>
              {data.replacementCost === 0
                ? "Your first companion is free."
                : `Your next companion costs ${data.replacementCost} reputation points.`}{" "}
              Visit the sanctuary on Wake Island to meet it.
            </p>
            <Button asChild>
              <Link href="/travel">Travel to Wake Island</Link>
            </Button>
            <Link href="/pets" className="underline">
              Open the sanctuary
            </Link>
          </div>
        </ContentBox>
      </>
    );

  const rank = getPetRank(pet.rank);
  const level = getPetLevel(pet);
  const caps = getPetStatCaps(pet);
  const appearanceReady = isPetAppearanceReady(pet);
  const rankAllowed = pet.rank <= data.maxRank;
  const settingsDisabled = isBusy || userData.status !== "AWAKE";
  const nextRank = data.nextRank;
  const canEvolve =
    data.canRankUp && data.remainingGenerations > 0 && !settingsDisabled;
  const retryAt = data.generationRetryAt ? new Date(data.generationRetryAt) : null;
  const selectedMeal =
    data.feedMeals.find((meal) => meal.id === selectedMealId) ?? data.feedMeals[0];
  const canRetryGeneration = retryAt === null || retryAt.getTime() <= Date.now();
  // Adapt only stats/rank for the shared player allocator; its submit handler
  // spends the selected pet's bank through the pets router.
  const statsUser = {
    ...userData,
    offence: pet.offence,
    defence: pet.defence,
    strength: pet.strength,
    speed: pet.speed,
    intelligence: pet.intelligence,
    willpower: pet.willpower,
    rank: rank.minUserRank,
  };
  const traits = [
    PET_SPECIES[pet.speciesIndex],
    PET_PALETTES[pet.paletteIndex],
    PET_CHARACTERISTICS[pet.characteristicIndex],
    PET_AURAS[pet.auraIndex],
  ];
  // Drafts belong to a pet ID so switching companions cannot apply another's edits.
  // Saved selections missing from current eligible content are omitted from the draft.
  const abilities =
    abilityDraft?.petId === pet.id
      ? abilityDraft
      : {
          jutsuIds: pet.jutsuIds.filter((id) =>
            data.abilities.jutsus.some((entry) => entry.id === id),
          ),
          skillIds: pet.skillIds.filter((id) =>
            data.abilities.skills.some((entry) => entry.id === id),
          ),
        };
  const abilityChoices = [
    ...data.abilities.jutsus.map((entry) => ({
      item: entry,
      field: "jutsuIds" as const,
      cost: getPetJutsuCost(entry),
      label: `Jutsu · ${entry.jutsuRank} rank`,
    })),
    ...data.abilities.skills.map((entry) => ({
      item: entry,
      field: "skillIds" as const,
      cost: getPetSkillCost(entry),
      label: `Skill · Tier ${entry.tier}`,
    })),
  ];
  const selectedAbilityChoices = abilityChoices.filter((choice) =>
    abilities[choice.field].includes(choice.item.id),
  );
  const visibleAbilityChoices = abilityChoices
    .filter(
      (choice) =>
        (abilityKind === "all" || choice.field === abilityKind) &&
        choice.item.name.toLowerCase().includes(abilitySearch.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(abilities[b.field].includes(b.item.id)) -
          Number(abilities[a.field].includes(a.item.id)) ||
        a.item.name.localeCompare(b.item.name),
    );
  const abilityCount = abilities.jutsuIds.length + abilities.skillIds.length;
  const abilityCost = selectedAbilityChoices.reduce(
    (total, choice) => total + choice.cost,
    0,
  );
  const abilityError = validatePetAbilities({
    pet: { ...pet, ...abilities },
    owner: userData,
    ...data.abilities,
  });
  const hasUnavailableAbilities =
    pet.jutsuIds.some(
      (id) => !data.abilities.jutsus.some((entry) => entry.id === id),
    ) ||
    pet.skillIds.some((id) => !data.abilities.skills.some((entry) => entry.id === id));

  return (
    <div className="break-words [&_.self-start]:min-w-0">
      {collection}
      <ContentBox
        title={pet.name}
        subtitle="Train and care for your companion"
        initialBreak
      >
        <div className="flex items-start gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border bg-muted/30 sm:h-36 sm:w-36">
            {pet.avatar ? (
              <Image
                src={pet.avatar}
                alt={pet.name}
                width={160}
                height={160}
                className="h-full w-full object-contain"
              />
            ) : (
              <PawPrint
                className="h-14 w-14 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="min-w-0 grow space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge>{rank.name}</Badge>
              <Badge variant="outline">
                Level {level} / {rank.levelCap}
              </Badge>
              <Badge variant="outline">
                Rank {pet.rank} / {PET_RANKS.length}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {traits
                .map((trait) => trait?.name)
                .filter(Boolean)
                .join(" · ")}
            </p>
            {pet.id === data.activePetId ? (
              <Badge>Active companion</Badge>
            ) : (
              <Button
                size="sm"
                disabled={settingsDisabled}
                onClick={() => activate.mutate({ petId: pet.id })}
              >
                {activate.isPending ? "Activating..." : "Make active companion"}
              </Button>
            )}
            <p className="text-sm">
              <strong>{formatStat(data.unusedExperience)}</strong> experience available
            </p>
          </div>
        </div>
        {nextRank && (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              {formatStat(pet.experience)} / {formatStat(nextRank.experienceRequired)}{" "}
              assigned experience toward {nextRank.name}
            </p>
            <Progress
              value={Math.min(
                100,
                (pet.experience / nextRank.experienceRequired) * 100,
              )}
              aria-label={`Experience toward ${nextRank.name}`}
            />
          </div>
        )}
        <details className="mt-3 text-muted-foreground text-sm">
          <summary className="cursor-pointer">
            How companion experience and battles work
          </summary>
          <p className="mt-2">
            While your eligible active companion joins battle, new player experience
            also earns pet experience. Switching companions keeps each pet's progress
            and unused experience. Companions join ordinary PvP and standard PvE. Ranked
            matches and automatically resolved Kage and clan challenges exclude
            companions.
          </p>
          <p className="mt-2">Assigned experience: {formatStat(pet.experience)}.</p>
        </details>
        {!appearanceReady && (
          <div
            className="mt-5 space-y-3 rounded border bg-muted/30 p-4"
            aria-live="polite"
          >
            <p className="font-semibold">
              {pet.generationStatus === "GENERATING"
                ? "Your companion's appearance is being created"
                : pet.artRank > 0
                  ? "Finish your companion's evolution"
                  : "Create your companion's appearance"}
            </p>
            <p className="text-sm">
              {pet.generationStatus === "FAILED"
                ? "The last image attempt did not finish. Retry this same companion for free."
                : "Your pet can join battle and earn experience after its appearance is ready."}{" "}
              Creating the image can take a few minutes.
            </p>
            <p className="text-muted-foreground text-sm">
              {data.remainingGenerations} / {data.generationLimit} image attempts remain
              today. Attempts reset at midnight UTC.
            </p>
            {canRetryGeneration ? (
              <Button
                disabled={settingsDisabled || data.remainingGenerations <= 0}
                onClick={() => void generateAppearance()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {generate.isPending
                  ? "Creating appearance..."
                  : "Create / retry appearance"}
              </Button>
            ) : pet.generationStatus === "GENERATING" ? (
              <Loader explanation="Creating appearance..." />
            ) : null}
            {!canRetryGeneration && retryAt && (
              <p className="text-muted-foreground text-sm">
                Appearance retry available in{" "}
                <Countdown targetDate={retryAt} onFinish={() => void refetch()} />.
              </p>
            )}
          </div>
        )}
        {!rankAllowed && (
          <p className="mt-4 rounded border bg-muted/30 p-3" role="status">
            {data.maxRank > 0
              ? `Your current shinobi rank supports companions up to ${getPetRank(data.maxRank).name}.`
              : "Your current shinobi rank does not support a battle companion."}{" "}
            This pet keeps its progress and can join battle again when your rank allows
            it.
          </p>
        )}
        {userData.status !== "AWAKE" && (
          <p className="mt-4 text-sm" role="status">
            Return to the awake state to change your pet's settings or allocate
            experience.
          </p>
        )}

        {message && (
          <p
            role="alert"
            className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-600"
          >
            {message}
          </p>
        )}
      </ContentBox>
      <Tabs value={activity} onValueChange={setActivity} className="mt-4">
        <TabsList aria-label="Companion activities" className="grid grid-cols-4">
          <TabsTrigger
            value="care"
            className="min-h-9 whitespace-normal px-1 text-xs leading-tight sm:text-sm"
          >
            Care & training
          </TabsTrigger>
          <TabsTrigger value="abilities" className="min-h-9 px-1 text-xs sm:text-sm">
            Abilities
          </TabsTrigger>
          <TabsTrigger value="battle" className="min-h-9 px-1 text-xs sm:text-sm">
            Battle
          </TabsTrigger>
          <TabsTrigger value="settings" className="min-h-9 px-1 text-xs sm:text-sm">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="care" forceMount hidden={activity !== "care"}>
          <ContentBox
            title="Feed your companion"
            subtitle="Share a meal once each UTC day"
            alreadyHasH1
          >
            <p className="mb-3 text-sm">
              One meal adds {formatStat(data.feedExperience)} unused pet experience to{" "}
              {pet.name}. You can assign these points to its stats below.
            </p>
            {pet.feedDay === data.dayKey ? (
              <p role="status">
                {pet.name} has already been fed today. Return after midnight UTC.
              </p>
            ) : data.feedMeals.length === 0 ? (
              <p>
                Prepare a meal in your{" "}
                <Link href="/home" className="underline">
                  home kitchen
                </Link>{" "}
                and keep it in your inventory to feed your companion.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 grow space-y-2">
                  <Label htmlFor="pet-feed-meal">Meal</Label>
                  <Select
                    value={selectedMeal?.id ?? ""}
                    onValueChange={setSelectedMealId}
                    disabled={settingsDisabled || !data.canFeed}
                  >
                    <SelectTrigger id="pet-feed-meal">
                      <SelectValue placeholder="Choose a meal" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.feedMeals.map((meal) => (
                        <SelectItem key={meal.id} value={meal.id}>
                          {meal.name} · {meal.quantity} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={settingsDisabled || !data.canFeed || !selectedMeal}
                  onClick={() =>
                    selectedMeal &&
                    feed.mutate({
                      petId: pet.id,
                      userItemId: selectedMeal.id,
                      expectedQuantity: selectedMeal.quantity,
                    })
                  }
                >
                  {feed.isPending ? "Feeding..." : "Feed one meal"}
                </Button>
                {!data.canFeed && (
                  <p className="w-full text-muted-foreground text-sm">
                    Finish this companion's appearance, meet its shinobi rank
                    requirement and return to the awake state to feed it.
                  </p>
                )}
              </div>
            )}
          </ContentBox>

          <div className="mt-4">
            <DistributeStatsForm
              key={`${pet.id}:${pet.rank}`}
              userData={statsUser}
              availableStats={Math.floor(data.unusedExperience)}
              onAccept={assignExperience}
              includeMasteries={false}
              advanceTutorial={false}
              disabled={
                settingsDisabled ||
                !rankAllowed ||
                !appearanceReady ||
                data.unusedExperience < 1
              }
              title="Assign Pet Experience"
              subtitle={`${formatStat(data.unusedExperience)} points available for your companion${!rankAllowed ? " · Your shinobi rank must support this pet" : !appearanceReady ? " · Finish its appearance to allocate points" : userData.status !== "AWAKE" ? " · You must be awake to allocate points" : data.unusedExperience < 1 ? " · Earn experience with your pet joining battle to allocate points" : ""}`}
              isPending={assign.isPending}
            />
          </div>

          <ContentBox
            title="Evolution"
            subtitle="Grow the same companion through ten ranks"
            initialBreak
          >
            <p className="mb-3">
              Each evolution builds on your pet's previous portrait, preserving its
              species, colours and distinctive traits. Your shinobi rank and assigned
              pet experience determine when it can evolve.
            </p>
            {nextRank ? (
              <div className="space-y-3">
                <p>
                  Next: <strong>{nextRank.name}</strong> ·{" "}
                  {formatStat(nextRank.experienceRequired)} assigned experience ·{" "}
                  {nextRank.minUserRank} shinobi rank
                </p>
                <Confirm
                  title={`Evolve ${pet.name} to ${nextRank.name}?`}
                  className="break-words [&>div]:min-w-0"
                  disabled={!canEvolve}
                  button={
                    <Button disabled={!canEvolve}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {isEvolving ? "Evolving..." : `Evolve to ${nextRank.name}`}
                    </Button>
                  }
                  onAccept={() => void evolvePet()}
                >
                  <p>
                    Your pet advances to rank {nextRank.rank}, then receives an evolved
                    portrait based on its current image. If image creation fails, you
                    can retry this evolution for free.
                  </p>
                </Confirm>
                {data.rankUpReason && (
                  <p className="text-muted-foreground text-sm">{data.rankUpReason}</p>
                )}
                {data.remainingGenerations <= 0 && (
                  <p className="text-muted-foreground text-sm">
                    Image attempts reset at midnight UTC. Evolution will be available
                    once an attempt remains.
                  </p>
                )}
              </div>
            ) : (
              <p>Your companion has reached its final evolution.</p>
            )}
            <details className="mt-5">
              <summary className="cursor-pointer font-semibold">
                All pet ranks and requirements
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">Rank</th>
                      <th className="p-2">Companion</th>
                      <th className="p-2">Shinobi rank</th>
                      <th className="p-2">Experience</th>
                      <th className="p-2">Level cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PET_RANKS.map((entry) => (
                      <tr
                        key={entry.rank}
                        className={entry.rank === pet.rank ? "bg-muted" : "border-b"}
                      >
                        <td className="p-2">{entry.rank}</td>
                        <td className="p-2">{entry.name}</td>
                        <td className="whitespace-nowrap p-2">{entry.minUserRank}</td>
                        <td className="p-2">{formatStat(entry.experienceRequired)}</td>
                        <td className="p-2">{entry.levelCap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </ContentBox>

          <ContentBox title="Companion stats" alreadyHasH1 initialBreak>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CombatStatNames.map((stat) => (
                <div key={stat} className="rounded border p-3">
                  <dt className="text-muted-foreground text-sm">
                    {capitalizeFirstLetter(stat)}
                  </dt>
                  <dd className="font-semibold">
                    {formatStat(pet[stat])}
                    <span className="font-normal text-muted-foreground text-xs">
                      {" "}
                      /{" "}
                      {formatStat(
                        stat === "offence" || stat === "defence"
                          ? caps.stats_cap
                          : caps.gens_cap,
                      )}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </ContentBox>
        </TabsContent>
        <TabsContent value="abilities" forceMount hidden={activity !== "abilities"}>
          <ContentBox
            title="Companion abilities"
            subtitle="Share compatible jutsu and skills you have unlocked"
            alreadyHasH1
          >
            <p className="mb-3 text-sm">
              Choose compatible jutsu and passive skills within your companion's slots
              and power budget. Pet rank and level determine availability. Unselect an
              ability to make room. Jutsu start at level 1 and scale with your pet.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="outline">
                {abilityCount} /{" "}
                {Math.min(pet.abilitySlots, data.abilityCapacity?.maxSlots ?? 0)} slots
                used
              </Badge>
              <Badge variant="outline">
                {abilityCost} / {data.abilityCapacity?.budget ?? 0} power budget
              </Badge>
            </div>
            {hasUnavailableAbilities && (
              <p className="mb-3 text-sm" role="status">
                Saved abilities that are no longer supported are omitted. Save this
                selection to remove them.
              </p>
            )}
            <div className="rounded border bg-muted/30 p-3">
              <p className="font-semibold text-sm">Selected loadout</p>
              <p className="mt-1 text-sm">
                {selectedAbilityChoices.length
                  ? selectedAbilityChoices.map((choice) => choice.item.name).join(" · ")
                  : "No abilities selected."}
              </p>
              {abilityError && (
                <p role="alert" className="mt-3 text-red-600 text-sm">
                  {abilityError}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={settingsDisabled || Boolean(abilityError)}
                  onClick={() =>
                    updateAbilities.mutate({ ...abilities, petId: pet.id })
                  }
                >
                  {updateAbilities.isPending ? "Saving..." : "Save abilities"}
                </Button>
                <Button
                  variant="outline"
                  disabled={settingsDisabled || abilityCount === 0}
                  onClick={() =>
                    setAbilityDraft({ petId: pet.id, jutsuIds: [], skillIds: [] })
                  }
                >
                  Clear selection
                </Button>
                {data.abilityCapacity &&
                  pet.abilitySlots < data.abilityCapacity.maxSlots && (
                    <Confirm
                      title={`Unlock an ability slot for ${data.abilitySlotCost} reputation?`}
                      disabled={
                        settingsDisabled ||
                        !rankAllowed ||
                        userData.reputationPoints < data.abilitySlotCost
                      }
                      button={
                        <Button
                          variant="outline"
                          disabled={
                            settingsDisabled ||
                            !rankAllowed ||
                            userData.reputationPoints < data.abilitySlotCost
                          }
                        >
                          Unlock ability slot · {data.abilitySlotCost} reputation
                        </Button>
                      }
                      onAccept={() => unlockAbilitySlot.mutate({ petId: pet.id })}
                    >
                      <p>
                        This companion gains one permanent ability slot. Its power
                        budget still follows its rank.
                      </p>
                    </Confirm>
                  )}
              </div>
            </div>
            <div className="my-3 flex gap-2">
              <div className="min-w-0 grow space-y-1">
                <Label htmlFor="pet-ability-search">Find an ability</Label>
                <Input
                  id="pet-ability-search"
                  placeholder="Search by name"
                  value={abilitySearch}
                  onChange={(event) => setAbilitySearch(event.target.value)}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor="pet-ability-kind">Type</Label>
                <Select value={abilityKind} onValueChange={setAbilityKind}>
                  <SelectTrigger id="pet-ability-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="jutsuIds">Jutsu</SelectItem>
                    <SelectItem value="skillIds">Skills</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <fieldset
              className="max-h-80 space-y-1 overflow-y-auto overscroll-contain rounded border p-1"
              aria-label="Available companion abilities"
            >
              {visibleAbilityChoices.map((choice) => {
                const selected = abilities[choice.field].includes(choice.item.id);
                const next = {
                  ...abilities,
                  [choice.field]: selected
                    ? abilities[choice.field].filter((id) => id !== choice.item.id)
                    : [...abilities[choice.field], choice.item.id],
                };
                const blocked = validatePetAbilities({
                  pet: { ...pet, ...next },
                  owner: userData,
                  ...data.abilities,
                });
                const id = `pet-ability-${choice.field}-${choice.item.id}`;
                return (
                  <div
                    key={id}
                    className={`rounded p-2 ${selected ? "bg-primary/10" : "bg-muted/30"}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={id}
                        checked={selected}
                        disabled={
                          settingsDisabled ||
                          !rankAllowed ||
                          (!selected && Boolean(blocked))
                        }
                        onCheckedChange={() =>
                          setAbilityDraft({ ...next, petId: pet.id })
                        }
                      />
                      <Label htmlFor={id} className="grow leading-snug">
                        {choice.item.name}{" "}
                        <span className="mt-1 block font-normal text-muted-foreground text-xs">
                          {choice.label} · {choice.cost} power
                        </span>
                      </Label>
                    </div>
                    <details className="mt-1 ml-7 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Effects and requirements
                      </summary>
                      <div className="mt-2">
                        {!selected && blocked && (
                          <p className="mb-2 text-muted-foreground">{blocked}</p>
                        )}
                        <ItemWithEffects item={choice.item} hideDates />
                      </div>
                    </details>
                  </div>
                );
              })}
              {visibleAbilityChoices.length === 0 && abilityChoices.length > 0 && (
                <p className="p-2 text-sm">No abilities match your search.</p>
              )}
              {abilityChoices.length === 0 && (
                <p className="text-sm">
                  Learn compatible non-elemental jutsu or activate standalone self
                  skills to share them with your companion.
                </p>
              )}
            </fieldset>
            {data.abilityCapacity &&
              pet.abilitySlots >= data.abilityCapacity.maxSlots && (
                <p className="mt-3 text-muted-foreground text-sm">
                  Evolving increases your companion's power budget and can make more
                  ability slots available.
                </p>
              )}
          </ContentBox>
        </TabsContent>
        <TabsContent value="battle" forceMount hidden={activity !== "battle"}>
          <ContentBox title="Battle settings" alreadyHasH1>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pet-spawn-position">Starting position</Label>
                <Select
                  value={pet.spawnPosition}
                  disabled={settingsDisabled}
                  onValueChange={(value) => {
                    const position = PetSpawnPositions.find((entry) => entry === value);
                    if (position)
                      update.mutate({ petId: pet.id, spawnPosition: position });
                  }}
                >
                  <SelectTrigger id="pet-spawn-position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PetSpawnPositions.map((position) => (
                      <SelectItem key={position} value={position}>
                        {PET_SPAWN_LABELS[position]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="pet-battle-enabled"
                  checked={pet.battleEnabled}
                  disabled={
                    settingsDisabled ||
                    (!pet.battleEnabled && (!rankAllowed || !appearanceReady))
                  }
                  onCheckedChange={(battleEnabled) =>
                    update.mutate({ petId: pet.id, battleEnabled })
                  }
                />
                <Label htmlFor="pet-battle-enabled">Join me in battle</Label>
                <Badge variant="outline">
                  {pet.id === data.activePetId && canUsePet(pet, userData)
                    ? "Joining battle"
                    : "Paused"}
                </Badge>
              </div>
            </div>
          </ContentBox>
          <div className="mt-4">
            <AiProfileEdit
              key={pet.id}
              userData={{ aiProfileId: null, userId: pet.id, jutsus: [], items: [] }}
              availableActionTypes={PET_AI_ACTION_TYPES}
              availableActionEffects={PET_AI_EFFECT_TYPES}
              configuration={{
                profile: aiProfile,
                isSaving: updateAi.isPending,
                disabled: settingsDisabled || !rankAllowed,
                onSave: (profile) => updateAi.mutate({ ...profile, petId: pet.id }),
              }}
            />
            <p className="mt-3 text-muted-foreground text-sm">
              Pet rules control battle actions, including compatible equipped jutsu.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="settings" forceMount hidden={activity !== "settings"}>
          <ContentBox title="Companion settings" alreadyHasH1>
            <div className="grid gap-5 sm:grid-cols-2">
              <Form {...nameForm}>
                <form
                  onSubmit={nameForm.handleSubmit(({ name }) => {
                    const parsed = updatePetSchema.safeParse({ petId: pet.id, name });
                    if (!parsed.success) {
                      nameForm.setError(
                        "name",
                        {
                          message: !name.trim()
                            ? "Enter a companion name."
                            : "Use 1–40 characters without control characters.",
                        },
                        { shouldFocus: true },
                      );
                      return;
                    }
                    nameForm.clearErrors("name");
                    setMessage(null);
                    update.mutate(parsed.data);
                  })}
                >
                  <FormField
                    control={nameForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Companion name</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              maxLength={40}
                              disabled={settingsDisabled}
                              onChange={(event) => {
                                field.onChange(event);
                                nameForm.clearErrors("name");
                              }}
                            />
                          </FormControl>
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={settingsDisabled || petName.trim() === pet.name}
                          >
                            Save
                          </Button>
                        </div>
                        <FormMessage role="alert" />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </div>
          </ContentBox>
          <ContentBox
            title="Release companion"
            subtitle="Return your pet to the sanctuary"
            initialBreak
          >
            <p className="mb-4">
              Releasing {pet.name} removes its progress and unused experience. Your
              other companions stay in your collection. A new companion at the{" "}
              <Link href="/pets" className="underline">
                {PET_SANCTUARY_NAME}
              </Link>{" "}
              on Wake Island costs {PET_REPLACEMENT_COST} reputation points.
            </p>
            <Confirm
              title={`Release ${pet.name}?`}
              className="break-words [&>div]:min-w-0"
              disabled={
                settingsDisabled ||
                (pet.generationStatus === "GENERATING" && !canRetryGeneration)
              }
              button={
                <Button
                  variant="destructive"
                  disabled={
                    settingsDisabled ||
                    (pet.generationStatus === "GENERATING" && !canRetryGeneration)
                  }
                >
                  {release.isPending ? "Releasing..." : "Release companion"}
                </Button>
              }
              onAccept={() => release.mutate({ petId: pet.id })}
            >
              <p>
                {pet.name} will return to the sanctuary. Its stats, rank and artwork are
                removed, including its unused experience. Your next adoption will cost{" "}
                {PET_REPLACEMENT_COST} reputation points.
              </p>
            </Confirm>
          </ContentBox>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const formatStat = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const PET_SPAWN_LABELS: Record<(typeof PetSpawnPositions)[number], string> = {
  BEHIND: "Behind you",
  LEFT: "Left of you",
  RIGHT: "Right of you",
  FRONT: "In front of you",
};
