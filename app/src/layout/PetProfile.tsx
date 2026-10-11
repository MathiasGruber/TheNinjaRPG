"use client";

import { PawPrint, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type RouterInputs } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import DistributeStatsForm from "@/layout/StatsDistributionForm";
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

export function PetProfile() {
  const { data: userData } = useRequiredUserData();
  const utils = api.useUtils();
  const [message, setMessage] = useState<string | null>(null);
  const [petName, setPetName] = useState("");
  const [isEvolving, setIsEvolving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const inFlight = useRef(false);
  const { data, isPending, error, refetch } = api.pets.getPet.useQuery(undefined, {
    enabled: !!userData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) =>
      isGenerating ||
      isEvolving ||
      query.state.data?.pet?.generationStatus === "GENERATING"
        ? 3000
        : false,
  });
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
    setPetName(pet?.name ?? "");
  }, [pet?.name]);

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
    // A network failure may arrive after the server commits an adoption or artwork claim.
    await Promise.all([
      utils.pets.getPet.invalidate(),
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
    release.isPending;

  const generateAppearance = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsGenerating(true);
    setMessage(null);
    try {
      await generate.mutateAsync();
    } catch {
      // Both the shared error toast and the inline message leave the retry action available.
    } finally {
      inFlight.current = false;
      setIsGenerating(false);
    }
  };
  const evolvePet = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsEvolving(true);
    setMessage(null);
    try {
      const result = await evolve.mutateAsync();
      if (result.success) await generate.mutateAsync();
    } catch {
      // The new rank is retained if artwork fails; retrying continues that evolution.
    } finally {
      inFlight.current = false;
      setIsEvolving(false);
    }
  };
  const assignExperience = async (stats: RouterInputs["pets"]["assignExperience"]) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setMessage(null);
    try {
      return (await assign.mutateAsync(stats)).success;
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
  if (!pet || !aiProfile)
    return (
      <ContentBox title="Pet" subtitle="Find a companion on Wake Island">
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
  const canRetryGeneration = retryAt === null || retryAt.getTime() <= Date.now();
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

  return (
    <>
      <ContentBox title="Pet" subtitle="Train and care for your companion">
        {message && (
          <p
            role="alert"
            className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-600"
          >
            {message}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-[minmax(150px,220px)_1fr]">
          <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted/30">
            {pet.avatar ? (
              <Image
                src={pet.avatar}
                alt={pet.name}
                width={320}
                height={320}
                className="h-full w-full object-contain"
              />
            ) : (
              <PawPrint
                className="h-20 w-20 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-xl">{pet.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{rank.name}</Badge>
                <Badge variant="outline">
                  Level {level} / {rank.levelCap}
                </Badge>
                <Badge variant="outline">
                  Rank {pet.rank} / {PET_RANKS.length}
                </Badge>
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                {traits
                  .map((trait) => trait?.name)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Assigned experience</dt>
                <dd className="font-semibold">{formatStat(pet.experience)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Available experience</dt>
                <dd className="font-semibold">{formatStat(data.unusedExperience)}</dd>
              </div>
            </dl>
            {nextRank && (
              <div className="space-y-1 text-sm">
                <p>
                  {formatStat(pet.experience)} /{" "}
                  {formatStat(nextRank.experienceRequired)} experience toward{" "}
                  {nextRank.name}
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
            <p className="text-sm">
              While your eligible pet joins battle, new player experience also earns pet
              experience. Spend it below to improve your pet's stats and level.
            </p>
            <p className="text-muted-foreground text-sm">
              Companions join ordinary PvP and standard PvE. Ranked matches and
              automatically resolved Kage and clan challenges exclude companions.
            </p>
          </div>
        </div>

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

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = updatePetSchema.safeParse({ name: petName });
              if (!parsed.success) {
                setMessage(
                  parsed.error.issues[0]?.message ?? "Choose a valid pet name.",
                );
                return;
              }
              setMessage(null);
              update.mutate(parsed.data);
            }}
            className="space-y-2"
          >
            <Label htmlFor="pet-name">Companion name</Label>
            <div className="flex gap-2">
              <Input
                id="pet-name"
                value={petName}
                maxLength={40}
                disabled={settingsDisabled}
                onChange={(event) => setPetName(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={settingsDisabled || petName.trim() === pet.name}
              >
                Save
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            <Label htmlFor="pet-spawn-position">Starting position</Label>
            <Select
              value={pet.spawnPosition}
              disabled={settingsDisabled}
              onValueChange={(value) => {
                const position = PetSpawnPositions.find((entry) => entry === value);
                if (position) update.mutate({ spawnPosition: position });
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
              onCheckedChange={(battleEnabled) => update.mutate({ battleEnabled })}
            />
            <Label htmlFor="pet-battle-enabled">Join me in battle</Label>
            <Badge variant="outline">
              {canUsePet(pet, userData) ? "Active" : "Paused"}
            </Badge>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          Each evolution builds on your pet's previous portrait, preserving its species,
          colours and distinctive traits. Your shinobi rank and assigned pet experience
          determine when it can evolve.
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
                portrait based on its current image. If image creation fails, you can
                retry this evolution for free.
              </p>
            </Confirm>
            {data.rankUpReason && (
              <p className="text-muted-foreground text-sm">{data.rankUpReason}</p>
            )}
            {data.remainingGenerations <= 0 && (
              <p className="text-muted-foreground text-sm">
                Image attempts reset at midnight UTC. Evolution will be available once
                an attempt remains.
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

      <AiProfileEdit
        userData={{ aiProfileId: null, userId: pet.id, jutsus: [], items: [] }}
        availableActionTypes={PET_AI_ACTION_TYPES}
        availableActionEffects={PET_AI_EFFECT_TYPES}
        configuration={{
          profile: aiProfile,
          isSaving: updateAi.isPending,
          disabled: settingsDisabled || !rankAllowed,
          onSave: (profile) => updateAi.mutate(profile),
        }}
      />
      <p className="mt-3 text-muted-foreground text-sm">
        Pet rules control basic battle actions.
      </p>
      <ContentBox
        title="Release companion"
        subtitle="Return your pet to the sanctuary"
        initialBreak
      >
        <p className="mb-4">
          Releasing {pet.name} resets all pet progress and unused pet experience. A new
          companion at the{" "}
          <Link href="/pets" className="underline">
            {PET_SANCTUARY_NAME}
          </Link>{" "}
          on Wake Island costs {PET_REPLACEMENT_COST} reputation points.
        </p>
        <Confirm
          title={`Release ${pet.name}?`}
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
          onAccept={() => release.mutate()}
        >
          <p>
            {pet.name} will return to the sanctuary. Its stats, rank and artwork are
            removed, and all unused pet experience is reset. Your next adoption will
            cost {PET_REPLACEMENT_COST} reputation points.
          </p>
        </Confirm>
      </ContentBox>
    </>
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
