"use client";

import { Plus, Skull, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput, validateNumberInputs } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  COMBAT_BIOMES,
  DUNGEON_FLOORS_PER_TIER,
  DUNGEON_MAX_MOBS,
  DUNGEON_MAX_TIERS,
  DUNGEON_MAX_WAVES,
  ENCOUNTER_MAX_WAVE_DELAY_ROUNDS,
} from "@/drizzle/constants";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { formatLocalDateTimeInput } from "@/utils/time";
import { useUserData } from "@/utils/UserContext";
import { type DungeonContent, dungeonContentSchema } from "@/validators/dungeon";

/** Edit authored tiers, waves and completion rewards using the same schema enforced by the server. */
export default function DungeonEditor() {
  const { data: user } = useUserData();
  const utils = api.useUtils();
  const allowed = !!user && canChangeContent(user.role);
  const [id, setId] = useState<string>();
  const [content, setContent] = useState<DungeonContent>(newDungeon());
  const [tier, setTier] = useState(0);
  const [floor, setFloor] = useState(0);
  const [message, setMessage] = useState("");
  const [panel, setPanel] = useState("details");
  const formRef = useRef<HTMLDivElement>(null);
  const definitions = api.coop.dungeon.getAll.useQuery(undefined, { enabled: allowed });
  const ais = api.profile.getAllAiNames.useQuery(undefined, { enabled: allowed });
  const items = api.item.getAllNames.useQuery(undefined, { enabled: allowed });
  const jutsus = api.jutsu.getAllNames.useQuery(undefined, { enabled: allowed });
  const save = api.coop.dungeon.save.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message);
      showMutationToast(result);
      if (result.success && "id" in result) {
        setId(result.id);
        await Promise.all([
          definitions.refetch(),
          utils.coop.dungeon.getAvailable.invalidate(),
        ]);
      }
    },
    onError: (error) => setMessage(error.message),
  });
  /** Replace top-level draft fields while preserving unrelated unsaved edits. */
  const patch = (values: Partial<DungeonContent>) =>
    setContent((current) => ({ ...current, ...values }));
  /** Apply a room edit to a clone so nested wave changes preserve React state immutability. */
  const editRoom = (update: (room: DungeonContent["tiers"][number][number]) => void) =>
    setContent((current) => {
      const next = structuredClone(current);
      const room = next.tiers[tier]?.[floor];
      if (room) update(room);
      return next;
    });
  const room = content.tiers[tier]?.[floor];
  /** Validate native numeric inputs and the complete definition before submitting its saved ID. */
  const submit = () => {
    // Keep tab fields mounted and reveal an invalid number before native validation focuses it.
    const invalidNumber = formRef.current?.querySelector<HTMLInputElement>(
      "[data-number-input]:invalid",
    );
    if (invalidNumber) {
      setPanel(
        invalidNumber.closest<HTMLElement>("[data-editor-panel]")?.dataset
          .editorPanel ?? "details",
      );
      setMessage("Please correct the highlighted number.");
      requestAnimationFrame(() => validateNumberInputs(formRef.current));
      return;
    }
    if (!validateNumberInputs(formRef.current)) return;
    const parsed = dungeonContentSchema.safeParse(content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (!issue) return;
      setPanel(
        issue.path[0] === "tiers"
          ? "rooms"
          : issue.path[0] === "rewards"
            ? "rewards"
            : "details",
      );
      if (
        issue.path[0] === "tiers" &&
        typeof issue.path[1] === "number" &&
        typeof issue.path[2] === "number"
      ) {
        setTier(issue.path[1]);
        setFloor(issue.path[2]);
        setMessage(
          `Tier ${issue.path[1] + 1}, floor ${issue.path[2] + 1}: ${issue.message}`,
        );
      } else setMessage(issue.message);
      return;
    }
    save.mutate({ id, content: parsed.data });
  };
  if (!user) return <Loader explanation="Loading content permissions" />;
  if (!allowed)
    return (
      <ContentBox title="Dungeon Pyramids">You cannot edit dungeon content.</ContentBox>
    );
  return (
    <ContentBox
      title="Dungeon editor"
      subtitle="Three-player co-op"
      defaultBackHref="/manual"
    >
      {/* Keep the submitted draft selected until its save result supplies or confirms the ID. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() => {
            setId(undefined);
            setContent(newDungeon());
            setTier(0);
            setFloor(0);
            setMessage("");
            setPanel("details");
          }}
        >
          New dungeon
        </Button>
        <select
          aria-label="Edit existing dungeon"
          className="min-w-0 flex-1 rounded border bg-background p-2"
          disabled={save.isPending}
          value={id ?? ""}
          onChange={(e) => {
            const row = definitions.data?.find((d) => d.id === e.target.value);
            if (!row) return;
            setId(row.id);
            setContent(dungeonContentSchema.parse(row.content));
            setTier(0);
            setFloor(0);
            setMessage("");
            setPanel("details");
          }}
        >
          <option value="">Select dungeon</option>
          {definitions.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.content.name}
            </option>
          ))}
        </select>
        <Button disabled={save.isPending} loading={save.isPending} onClick={submit}>
          Save dungeon
        </Button>
      </div>
      {(message || definitions.error) && (
        <p role="status" className="mb-4 whitespace-pre-wrap rounded border p-3">
          {message || definitions.error?.message}
        </p>
      )}
      <div ref={formRef} className="space-y-4">
        <fieldset disabled={save.isPending}>
          <Tabs value={panel} onValueChange={setPanel}>
            <TabsList className="mb-4 grid grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="rooms">Encounters</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
            </TabsList>
            <TabsContent
              value="details"
              forceMount
              data-editor-panel="details"
              className="space-y-4 data-[state=inactive]:hidden"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    value={content.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                <Field label="Battle background">
                  <select
                    className="w-full rounded border bg-background p-2"
                    value={content.background}
                    onChange={(e) =>
                      patch({
                        background: e.target.value as DungeonContent["background"],
                      })
                    }
                  >
                    {COMBAT_BIOMES.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <Textarea
                      rows={2}
                      value={content.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Expiration (new lobbies only)">
                  <Input
                    type="datetime-local"
                    value={
                      content.expiresAt
                        ? formatLocalDateTimeInput(content.expiresAt)
                        : ""
                    }
                    onChange={(e) =>
                      patch({
                        expiresAt: e.target.value ? new Date(e.target.value) : null,
                      })
                    }
                  />
                </Field>
                <Field label="Published">
                  <Switch
                    checked={!content.hidden}
                    onCheckedChange={(published) => patch({ hidden: !published })}
                  />
                </Field>
                <Field label="Sector">
                  <NumberInput
                    value={content.sector}
                    onValueChange={(value) => patch({ sector: value })}
                  />
                </Field>
                <div className="flex gap-2">
                  <Field label="Longitude">
                    <NumberInput
                      value={content.longitude}
                      onValueChange={(value) => patch({ longitude: value })}
                    />
                  </Field>
                  <Field label="Latitude">
                    <NumberInput
                      value={content.latitude}
                      onValueChange={(value) => patch({ latitude: value })}
                    />
                  </Field>
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="rooms"
              forceMount
              data-editor-panel="rooms"
              className="space-y-4 data-[state=inactive]:hidden"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Tier"
                    className="min-w-0 flex-1 rounded border bg-background p-2"
                    value={tier}
                    onChange={(e) => {
                      setTier(Number(e.target.value));
                      setFloor(0);
                    }}
                  >
                    {content.tiers.map((_, i) => (
                      <option key={i} value={i}>
                        Tier {i + 1} of {content.tiers.length}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    disabled={content.tiers.length >= DUNGEON_MAX_TIERS}
                    onClick={() =>
                      patch({ tiers: normalizeRooms([...content.tiers, newTier()]) })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    Add tier
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Remove last tier"
                    hoverText="Remove last tier"
                    disabled={content.tiers.length <= 1}
                    onClick={() => {
                      patch({ tiers: normalizeRooms(content.tiers.slice(0, -1)) });
                      setTier(0);
                      setFloor(0);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {content.tiers[tier]?.map((f, i) => (
                    <Button
                      key={i}
                      variant={floor === i ? "default" : "secondary"}
                      size="sm"
                      className="min-w-0 px-1"
                      onClick={() => setFloor(i)}
                    >
                      Floor {i + 1}
                      {f.kind !== "floor" && (
                        <Skull className="ml-1 h-3 w-3" aria-label={f.kind} />
                      )}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    Tier {tier + 1} · Floor {floor + 1}
                  </span>
                  <Badge variant="outline">
                    {room?.kind === "floor"
                      ? "Regular room"
                      : room?.kind === "mini-boss"
                        ? "Mini-boss"
                        : "Final boss"}
                  </Badge>
                </div>
                {room?.waves.map((wave, wi) => (
                  <div key={wi} className="space-y-3 rounded-lg border bg-popover p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm">Wave {wi + 1}</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove wave ${wi + 1}`}
                        hoverText="Remove wave"
                        disabled={room.waves.length === 1}
                        onClick={() =>
                          editRoom((r) => {
                            r.waves.splice(wi, 1);
                            if (r.waves[0]) r.waves[0].delayRounds = 0;
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {wi > 0 && (
                      <Field label="Minimum rounds between wave starts">
                        <NumberInput
                          min={0}
                          max={ENCOUNTER_MAX_WAVE_DELAY_ROUNDS}
                          value={wave.delayRounds}
                          onValueChange={(value) =>
                            editRoom((r) => {
                              const w = r.waves[wi];
                              if (w) w.delayRounds = value;
                            })
                          }
                        />
                      </Field>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {wave.aiIds.map((ai, aiIndex) => (
                        <div className="flex gap-2" key={aiIndex}>
                          <select
                            aria-label={`Wave ${wi + 1} enemy ${aiIndex + 1}`}
                            className="min-w-0 flex-1 rounded border bg-background p-2"
                            value={ai}
                            onChange={(e) =>
                              editRoom((r) => {
                                const w = r.waves[wi];
                                if (w) w.aiIds[aiIndex] = e.target.value;
                              })
                            }
                          >
                            <option value="">Select enemy</option>
                            {ais.data?.map((a) => (
                              <option key={a.userId} value={a.userId}>
                                {a.username}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="secondary"
                            size="icon"
                            aria-label={`Remove enemy ${aiIndex + 1} from wave ${wi + 1}`}
                            hoverText="Remove enemy"
                            disabled={wave.aiIds.length === 1}
                            onClick={() =>
                              editRoom((r) => r.waves[wi]?.aiIds.splice(aiIndex, 1))
                            }
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={wave.aiIds.length >= DUNGEON_MAX_MOBS}
                        onClick={() => editRoom((r) => r.waves[wi]?.aiIds.push(""))}
                      >
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                        Add enemy
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  disabled={!room || room.waves.length >= DUNGEON_MAX_WAVES}
                  onClick={() =>
                    editRoom((r) => r.waves.push({ aiIds: [""], delayRounds: 1 }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Add wave
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Each tier has {DUNGEON_FLOORS_PER_TIER} floors. Waves wait for the
                previous wave's defeat and their minimum round spacing.
              </p>
            </TabsContent>
            <TabsContent
              value="rewards"
              forceMount
              data-editor-panel="rewards"
              className="space-y-4 data-[state=inactive]:hidden"
            >
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Each player receives these rewards and rolls drops independently.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["money", "experience", "tokens", "prestige"] as const).map(
                    (key) => (
                      <Field
                        key={key}
                        label={
                          key === "money"
                            ? "Ryo"
                            : key === "experience"
                              ? "Exp"
                              : key === "tokens"
                                ? "Tokens"
                                : "Prestige"
                        }
                      >
                        <NumberInput
                          min={0}
                          value={content.rewards[key]}
                          onValueChange={(value) =>
                            patch({
                              rewards: { ...content.rewards, [key]: value },
                            })
                          }
                        />
                      </Field>
                    ),
                  )}
                </div>
                {content.rewards.drops.map((drop, i) => (
                  <div
                    className="grid grid-cols-[7rem_1fr] items-end gap-2 rounded-lg border bg-popover p-3 sm:grid-cols-[auto_1fr_auto_auto]"
                    key={i}
                  >
                    <select
                      aria-label={`Drop ${i + 1} type`}
                      className="rounded border bg-background p-2"
                      value={drop.type}
                      onChange={(e) => {
                        const drops = [...content.rewards.drops];
                        drops[i] = {
                          ...drop,
                          type: e.target.value as "item" | "jutsu",
                          id: "",
                        };
                        patch({ rewards: { ...content.rewards, drops } });
                      }}
                    >
                      <option value="item">Item</option>
                      <option value="jutsu">Jutsu</option>
                    </select>
                    <select
                      aria-label={`Drop ${i + 1} reward`}
                      className="min-w-0 flex-1 rounded border bg-background p-2"
                      value={drop.id}
                      onChange={(e) => {
                        const drops = [...content.rewards.drops];
                        drops[i] = { ...drop, id: e.target.value };
                        patch({ rewards: { ...content.rewards, drops } });
                      }}
                    >
                      <option value="">Select reward</option>
                      {(drop.type === "item" ? items.data : jutsus.data)?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <Field label="Chance (%)">
                      <NumberInput
                        aria-label={`Drop ${i + 1} chance (%)`}
                        className="w-20"
                        min={1}
                        max={100}
                        value={drop.chance}
                        onValueChange={(value) => {
                          const drops = [...content.rewards.drops];
                          drops[i] = { ...drop, chance: value };
                          patch({ rewards: { ...content.rewards, drops } });
                        }}
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`Remove drop ${i + 1}`}
                      hoverText="Remove drop"
                      onClick={() =>
                        patch({
                          rewards: {
                            ...content.rewards,
                            drops: content.rewards.drops.filter((_, di) => di !== i),
                          },
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch({
                      rewards: {
                        ...content.rewards,
                        drops: [
                          ...content.rewards.drops,
                          { type: "item", id: "", chance: 100 },
                        ],
                      },
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Add random drop
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </fieldset>
      </div>
    </ContentBox>
  );
}

/** Keep field labels and controls together in the editor's responsive grid. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Label className="block space-y-1">
    <span className="block">{label}</span>
    {children}
  </Label>
);
/** Create the required five room slots; normalizeRooms assigns their boss roles. */
const newTier = (): DungeonContent["tiers"][number] =>
  Array.from({ length: DUNGEON_FLOORS_PER_TIER }, () => ({
    kind: "floor",
    waves: [{ aiIds: [""], delayRounds: 0 }],
  }));
/** Reassign mini-boss/final-boss roles after adding or removing a tier. */
const normalizeRooms = (tiers: DungeonContent["tiers"]): DungeonContent["tiers"] =>
  tiers.map((rooms, ti) =>
    rooms.map((room, fi) => ({
      ...room,
      kind:
        fi === DUNGEON_FLOORS_PER_TIER - 1
          ? ti === tiers.length - 1
            ? "boss"
            : "mini-boss"
          : "floor",
    })),
  );
/** Start with an unpublished definition so incomplete drafts never expose travel entrances. */
const newDungeon = (): DungeonContent => ({
  name: "",
  description: "",
  sector: 1,
  longitude: 10,
  latitude: 10,
  expiresAt: null,
  hidden: true,
  background: "default",
  tiers: normalizeRooms([newTier()]),
  rewards: { money: 0, experience: 0, tokens: 0, prestige: 0, drops: [] },
});
