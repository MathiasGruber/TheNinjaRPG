"use client";

import { useRef, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput, validateNumberInputs } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import {
  COMBAT_BIOMES,
  DUNGEON_FLOORS_PER_TIER,
  DUNGEON_MAX_MOBS,
  DUNGEON_MAX_TIERS,
  DUNGEON_MAX_WAVES,
} from "@/drizzle/constants";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import { type DungeonContent, dungeonContentSchema } from "@/validators/dungeon";

export default function DungeonEditor() {
  const { data: user } = useUserData();
  const allowed = !!user && canChangeContent(user.role);
  const [id, setId] = useState<string>();
  const [content, setContent] = useState<DungeonContent>(newDungeon());
  const [tier, setTier] = useState(0);
  const [floor, setFloor] = useState(0);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const definitions = api.dungeon.getAll.useQuery(undefined, { enabled: allowed });
  const ais = api.profile.getAllAiNames.useQuery(undefined, { enabled: allowed });
  const items = api.item.getAllNames.useQuery(undefined, { enabled: allowed });
  const jutsus = api.jutsu.getAllNames.useQuery(undefined, { enabled: allowed });
  const save = api.dungeon.save.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message);
      showMutationToast(result);
      if (result.success && "id" in result) {
        setId(result.id);
        await definitions.refetch();
      }
    },
    onError: (error) => setMessage(error.message),
  });
  const patch = (values: Partial<DungeonContent>) =>
    setContent((current) => ({ ...current, ...values }));
  const editRoom = (update: (room: DungeonContent["tiers"][number][number]) => void) =>
    setContent((current) => {
      const next = structuredClone(current);
      const room = next.tiers[tier]?.[floor];
      if (room) update(room);
      return next;
    });
  const room = content.tiers[tier]?.[floor];
  const submit = () => {
    if (!validateNumberInputs(formRef.current)) return;
    const parsed = dungeonContentSchema.safeParse(content);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues
          .map((issue) => `${issue.path.join(" → ")}: ${issue.message}`)
          .join("\n"),
      );
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
      title="Dungeon Pyramids"
      subtitle="Content creation"
      defaultBackHref="/manual"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setId(undefined);
            setContent(newDungeon());
            setTier(0);
            setFloor(0);
            setMessage("");
          }}
        >
          New dungeon
        </Button>
        <select
          aria-label="Edit existing dungeon"
          className="rounded border bg-background p-2"
          value={id ?? ""}
          onChange={(e) => {
            const row = definitions.data?.find((d) => d.id === e.target.value);
            if (!row) return;
            setId(row.id);
            setContent(dungeonContentSchema.parse(row.content));
            setTier(0);
            setFloor(0);
            setMessage("");
          }}
        >
          <option value="">Select dungeon</option>
          {definitions.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.content.name}
            </option>
          ))}
        </select>
      </div>
      {(message || definitions.error) && (
        <p role="status" className="mb-4 whitespace-pre-wrap rounded border p-3">
          {message || definitions.error?.message}
        </p>
      )}
      <div ref={formRef} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={content.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Pyramid type">
            <Input value="Dungeon · Three-player co-op" readOnly />
          </Field>
          <Field label="Description">
            <Textarea
              value={content.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="Battle background">
            <select
              className="w-full rounded border bg-background p-2"
              value={content.background}
              onChange={(e) =>
                patch({ background: e.target.value as DungeonContent["background"] })
              }
            >
              {COMBAT_BIOMES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Expiration (new lobbies only)">
            <Input
              type="datetime-local"
              value={content.expiresAt ? localDateTime(content.expiresAt) : ""}
              onChange={(e) =>
                patch({ expiresAt: e.target.value ? new Date(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Published">
            <input
              type="checkbox"
              checked={!content.hidden}
              onChange={(e) => patch({ hidden: !e.target.checked })}
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
        <div className="my-4 space-y-3 rounded border p-4">
          <h2 className="font-bold text-lg">Tiers, floors and waves</h2>
          <p>
            Each tier has {DUNGEON_FLOORS_PER_TIER} floors. Its last floor is the
            mini-boss; the final tier ends with the boss. Waves enter after the
            preceding wave is defeated and the configured round delay has elapsed.
          </p>
          <div className="flex flex-wrap gap-2">
            {content.tiers.map((_, i) => (
              <Button
                key={i}
                variant={tier === i ? "default" : "secondary"}
                onClick={() => {
                  setTier(i);
                  setFloor(0);
                }}
              >
                Tier {i + 1}
              </Button>
            ))}
            <Button
              variant="secondary"
              disabled={content.tiers.length >= DUNGEON_MAX_TIERS}
              onClick={() =>
                patch({ tiers: normalizeRooms([...content.tiers, newTier()]) })
              }
            >
              Add tier
            </Button>
            <Button
              variant="secondary"
              disabled={content.tiers.length <= 1}
              onClick={() => {
                patch({ tiers: normalizeRooms(content.tiers.slice(0, -1)) });
                setTier(0);
                setFloor(0);
              }}
            >
              Remove last tier
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {content.tiers[tier]?.map((f, i) => (
              <Button
                key={i}
                variant={floor === i ? "default" : "secondary"}
                onClick={() => setFloor(i)}
              >
                Floor {i + 1}
                {f.kind !== "floor" ? ` · ${f.kind}` : ""}
              </Button>
            ))}
          </div>
          {room?.waves.map((wave, wi) => (
            <div key={wi} className="space-y-2 rounded bg-muted p-3">
              <h3 className="font-bold">Wave {wi + 1}</h3>
              <Field label="Minimum rounds since previous wave began">
                <NumberInput
                  min={0}
                  max={20}
                  disabled={wi === 0}
                  value={wave.delayRounds}
                  onValueChange={(value) =>
                    editRoom((r) => {
                      const w = r.waves[wi];
                      if (w) w.delayRounds = value;
                    })
                  }
                />
              </Field>
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
                      disabled={wave.aiIds.length === 1}
                      onClick={() =>
                        editRoom((r) => r.waves[wi]?.aiIds.splice(aiIndex, 1))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={wave.aiIds.length >= DUNGEON_MAX_MOBS}
                  onClick={() => editRoom((r) => r.waves[wi]?.aiIds.push(""))}
                >
                  Add enemy
                </Button>
                <Button
                  variant="secondary"
                  disabled={room.waves.length === 1}
                  onClick={() =>
                    editRoom((r) => {
                      r.waves.splice(wi, 1);
                      if (r.waves[0]) r.waves[0].delayRounds = 0;
                    })
                  }
                >
                  Remove wave
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
            Add wave
          </Button>
        </div>
        <div className="space-y-3 rounded border p-4">
          <h2 className="font-bold text-lg">
            Completion rewards · Each player rolls independently
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["money", "experience", "tokens", "prestige"] as const).map((key) => (
              <Field key={key} label={key === "money" ? "Ryo" : key}>
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
            ))}
          </div>
          {content.rewards.drops.map((drop, i) => (
            <div className="flex flex-wrap gap-2 rounded bg-muted p-3" key={i}>
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
              <Field label={`Drop ${i + 1} chance: ${drop.chance}%`}>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={drop.chance}
                  onChange={(e) => {
                    const drops = [...content.rewards.drops];
                    drops[i] = { ...drop, chance: Number(e.target.value) };
                    patch({ rewards: { ...content.rewards, drops } });
                  }}
                />
              </Field>
              <Button
                variant="secondary"
                onClick={() =>
                  patch({
                    rewards: {
                      ...content.rewards,
                      drops: content.rewards.drops.filter((_, di) => di !== i),
                    },
                  })
                }
              >
                Remove drop
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
            Add random drop
          </Button>
        </div>
        <Button className="mt-4" disabled={save.isPending} onClick={submit}>
          {save.isPending ? "Saving…" : "Save dungeon"}
        </Button>
      </div>
    </ContentBox>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Label className="block space-y-1">
    <span className="block">{label}</span>
    {children}
  </Label>
);
const newTier = (): DungeonContent["tiers"][number] =>
  Array.from({ length: DUNGEON_FLOORS_PER_TIER }, () => ({
    kind: "floor",
    waves: [{ aiIds: [""], delayRounds: 0 }],
  }));
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
const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
