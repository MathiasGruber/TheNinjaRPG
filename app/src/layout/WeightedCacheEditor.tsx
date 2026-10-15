"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { NumberInput } from "@/components/ui/number-input";
import {
  CACHE_MAX_BUNDLE_ITEMS,
  CACHE_MAX_ENTRIES,
  CACHE_MAX_QUANTITY,
  CACHE_MAX_ROLLS,
  CACHE_MAX_TIERS,
  CACHE_PROBABILITY_TOTAL,
} from "@/drizzle/constants";
import { cacheItemChance, cacheItemIds } from "@/libs/weightedCache";
import { type WeightedCache, weightedCacheSchema } from "@/validators/weightedCache";

export const WeightedCacheEditor = ({
  cache,
  onChange,
  items,
  isLoading,
  isError,
  onRetry,
}: {
  cache: WeightedCache;
  onChange: (cache: WeightedCache) => void;
  items: { id: string; name: string }[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) => {
  const validation = weightedCacheSchema.safeParse(cache);
  const missingIds = cacheItemIds(cache).filter(
    (id) => !items.some((item) => item.id === id),
  );
  const changeTier = (index: number, tier: WeightedCache["tiers"][number]) =>
    onChange({
      ...cache,
      tiers: cache.tiers.map((value, i) => (i === index ? tier : value)),
    });
  const moveTier = (index: number, direction: number) => {
    const tiers = [...cache.tiers];
    const other = index + direction;
    if (tiers[index] && tiers[other])
      [tiers[index], tiers[other]] = [tiers[other], tiers[index]];
    onChange({ ...cache, tiers });
  };
  return (
    <section
      aria-label="Weighted Cache editor"
      className="my-3 min-w-0 space-y-4 rounded-lg border p-3"
    >
      <h3 className="font-bold">Weighted Cache</h3>
      <Label className="block space-y-1">
        <span>Cache display name</span>
        <Input
          value={cache.displayName}
          maxLength={100}
          onChange={(event) => onChange({ ...cache, displayName: event.target.value })}
        />
      </Label>
      <p className="text-muted-foreground text-sm">
        Each opening selects a roll count, then one tier and one equally likely entry
        per roll. Every item in that entry is granted. Standard reward settings are
        preserved while inactive.
      </p>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Reward rolls</legend>
        <ProbabilityTotal label="Roll" values={cache.rolls} />
        {cache.rolls.map((roll, index) => (
          <div key={`roll-${index}`} className="flex flex-wrap items-end gap-2">
            <Label className="min-w-24 flex-1">
              Roll count
              <NumberInput
                min={1}
                max={CACHE_MAX_ROLLS}
                value={roll.count}
                onValueChange={(count) =>
                  onChange({
                    ...cache,
                    rolls: cache.rolls.map((value, i) =>
                      i === index ? { ...value, count } : value,
                    ),
                  })
                }
              />
            </Label>
            <ProbabilityInput
              value={roll.probability}
              onChange={(probability) =>
                onChange({
                  ...cache,
                  rolls: cache.rolls.map((value, i) =>
                    i === index ? { ...value, probability } : value,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ ...cache, rolls: cache.rolls.filter((_, i) => i !== index) })
              }
            >
              Remove roll
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={cache.rolls.length >= CACHE_MAX_ROLLS}
          onClick={() =>
            onChange({
              ...cache,
              rolls: [...cache.rolls, { count: 1, probability: 0 }],
            })
          }
        >
          Add roll outcome
        </Button>
      </fieldset>
      <fieldset className="min-w-0 space-y-3">
        <legend className="font-semibold">Reward tiers</legend>
        <ProbabilityTotal label="Tier" values={cache.tiers} />
        {cache.tiers.map((tier, tierIndex) => (
          <div
            key={`tier-${tierIndex}`}
            className="min-w-0 space-y-3 rounded border p-3"
          >
            <div className="flex flex-wrap items-end gap-2">
              <Label className="min-w-32 flex-1">
                Tier name
                <Input
                  value={tier.name}
                  maxLength={100}
                  onChange={(event) =>
                    changeTier(tierIndex, { ...tier, name: event.target.value })
                  }
                />
              </Label>
              <ProbabilityInput
                value={tier.probability}
                onChange={(probability) =>
                  changeTier(tierIndex, { ...tier, probability })
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={tierIndex === 0}
                onClick={() => moveTier(tierIndex, -1)}
              >
                Move up
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={tierIndex === cache.tiers.length - 1}
                onClick={() => moveTier(tierIndex, 1)}
              >
                Move down
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...cache,
                    tiers: cache.tiers.filter((_, i) => i !== tierIndex),
                  })
                }
              >
                Remove tier
              </Button>
            </div>
            {tier.probability === 0 && (
              <p className="text-muted-foreground text-sm">
                Draft tier: never selected while its probability is 0%.
              </p>
            )}
            {tier.entries.map((entry, entryIndex) => {
              const changeEntry = (next: typeof entry) =>
                changeTier(tierIndex, {
                  ...tier,
                  entries: tier.entries.map((value, i) =>
                    i === entryIndex ? next : value,
                  ),
                });
              return (
                <div
                  key={`entry-${entryIndex}`}
                  className="min-w-0 space-y-2 rounded bg-muted/40 p-2"
                >
                  <p className="font-semibold text-sm">
                    Entry {entryIndex + 1} ·{" "}
                    {tier.entries.length ? (100 / tier.entries.length).toFixed(2) : 0}%
                    within tier
                  </p>
                  <MultiSelect
                    options={items.map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))}
                    selected={entry.items.map((item) => item.itemId)}
                    placeholder="Search reward items (including hidden items)"
                    disabled={isLoading || isError}
                    onChange={(update) => {
                      const ids =
                        typeof update === "function"
                          ? update(entry.items.map((item) => item.itemId))
                          : update;
                      changeEntry({
                        items: ids.slice(0, CACHE_MAX_BUNDLE_ITEMS).map(
                          (itemId) =>
                            entry.items.find((item) => item.itemId === itemId) ?? {
                              itemId,
                              quantity: 1,
                            },
                        ),
                      });
                    }}
                  />
                  {entry.items.map((reward, itemIndex) => (
                    <Label
                      key={reward.itemId}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {items.find((item) => item.id === reward.itemId)?.name ??
                          `Missing item: ${reward.itemId}`}{" "}
                        quantity
                      </span>
                      <NumberInput
                        className="w-24"
                        min={1}
                        max={CACHE_MAX_QUANTITY}
                        value={reward.quantity}
                        onValueChange={(quantity) =>
                          changeEntry({
                            items: entry.items.map((value, i) =>
                              i === itemIndex ? { ...value, quantity } : value,
                            ),
                          })
                        }
                      />
                    </Label>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      changeTier(tierIndex, {
                        ...tier,
                        entries: tier.entries.filter((_, i) => i !== entryIndex),
                      })
                    }
                  >
                    Remove entry
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              disabled={tier.entries.length >= CACHE_MAX_ENTRIES}
              onClick={() =>
                changeTier(tierIndex, {
                  ...tier,
                  entries: [...tier.entries, { items: [] }],
                })
              }
            >
              Add reward entry
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={cache.tiers.length >= CACHE_MAX_TIERS}
          onClick={() =>
            onChange({
              ...cache,
              tiers: [
                ...cache.tiers,
                { name: "New tier", probability: 0, entries: [] },
              ],
            })
          }
        >
          Add tier
        </Button>
      </fieldset>
      {isLoading && <p>Loading item catalog…</p>}
      {isError && (
        <p role="alert">
          Could not load the item catalog.{" "}
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </p>
      )}
      {(!validation.success || (!isLoading && !isError && missingIds.length > 0)) && (
        <div role="alert" className="space-y-1 text-destructive text-sm">
          {validation.error?.issues.map((issue, index) => (
            <p key={`error-${index}`}>
              {issue.path.join(" → ")}: {issue.message}
            </p>
          ))}
          {!isLoading && !isError && missingIds.length > 0 && (
            <p>Remove or replace missing item references: {missingIds.join(", ")}</p>
          )}
        </div>
      )}
      {validation.success && (
        <div className="space-y-1 text-sm">
          <h4 className="font-semibold">Reward summary</h4>
          <p>
            {cache.rolls
              .map(
                (roll) =>
                  `${roll.count} roll${roll.count === 1 ? "" : "s"}: ${roll.probability / 100}%`,
              )
              .join("; ")}
          </p>
          {cache.tiers.map((tier, index) => (
            <p key={`summary-${index}`}>
              {tier.name}: {tier.probability / 100}% per roll ·{" "}
              {tier.entries
                .map((entry) =>
                  entry.items
                    .map(
                      (item) =>
                        `${item.quantity} × ${items.find((value) => value.id === item.itemId)?.name ?? item.itemId}`,
                    )
                    .join(" + "),
                )
                .join(" or ") || "No entries"}
            </p>
          ))}
          {cacheItemIds(cache).map((id) => (
            <p key={id}>
              {items.find((item) => item.id === id)?.name ?? id}:{" "}
              {cacheItemChance(cache, id).toFixed(2)}% chance per opening
            </p>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Probabilities support 0.01% precision. Up to {CACHE_MAX_ROLLS} rolls,{" "}
        {CACHE_MAX_TIERS} tiers, {CACHE_MAX_ENTRIES} entries per tier,{" "}
        {CACHE_MAX_BUNDLE_ITEMS} items per bundle, and {CACHE_MAX_QUANTITY} of each
        item.
      </p>
    </section>
  );
};

const ProbabilityInput = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) => (
  <Label className="min-w-28 flex-1">
    Probability (%)
    <NumberInput
      min={0}
      max={100}
      step={0.01}
      value={value / 100}
      onValueChange={(percent) =>
        onChange(Math.round(percent * 100_000_000) / 1_000_000)
      }
    />
  </Label>
);

const ProbabilityTotal = ({
  label,
  values,
}: {
  label: string;
  values: { probability: number }[];
}) => {
  const total = values.reduce((sum, value) => sum + value.probability, 0);
  return (
    <p
      className={
        total === CACHE_PROBABILITY_TOTAL ? "text-sm" : "text-destructive text-sm"
      }
    >
      {label} probability total: {total / 100}% / 100%
    </p>
  );
};
