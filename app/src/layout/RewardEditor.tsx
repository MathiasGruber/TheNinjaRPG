"use client";

import { nanoid } from "nanoid";
import { useState } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentType } from "@/drizzle/constants";
import { EditContent, type FormEntry, RewardFormWrapper } from "@/layout/EditContent";
import { getRewardPreview } from "@/libs/objectives";
import { getActiveRewardNodes } from "@/libs/rewardNodes";
import { isStaffRole } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import {
  QuestReward,
  type RewardPackageSnapshotType,
} from "@/validators/rewardPackages";
import { ObjectiveReward, rewardFields } from "@/validators/rewards";

export const RewardEditor = ({
  form,
  formData,
  type,
  allowPackages = true,
  isObjectiveReward = false,
  hideFields = [],
}: {
  form: UseFormReturn<any>;
  formData: FormEntry<any>[];
  type?: ContentType;
  allowPackages?: boolean;
  isObjectiveReward?: boolean;
  hideFields?: string[];
}) => {
  const { data: user } = useUserData();
  const {
    data: catalog,
    isError,
    refetch,
  } = api.rewardPackages.getCatalog.useQuery(undefined, {
    enabled: isStaffRole(user?.role),
  });
  const values = useWatch({ control: form.control });
  const [addedNodes, setAddedNodes] = useState<string[]>([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const packages = (values.reward_packages ?? []) as RewardPackageSnapshotType[];
  const defaultValues = ObjectiveReward.parse({});
  const customNodes = (catalog?.nodes ?? []).map((node) => ({
    ...node,
    fields: node.fields.filter((field) => !hideFields.includes(field)),
  }));
  const customFields = new Set(customNodes.flatMap((node) => node.fields));
  const groups = [
    ...customNodes,
    ...DEFAULT_REWARD_NODES.map((node) => ({
      ...node,
      fields: node.fields.filter(
        (field) =>
          !customFields.has(field as keyof typeof rewardFields) &&
          !hideFields.includes(field),
      ),
    })),
  ].filter((node) => node.fields.length > 0);
  const hasValue = (field: string) => {
    const value = values[field];
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined &&
          value !== defaultValues[field as keyof typeof defaultValues];
  };
  const activeNodes = getActiveRewardNodes(groups, addedNodes, hasValue);
  const setPackages = (next: RewardPackageSnapshotType[]) =>
    form.setValue("reward_packages", next, { shouldDirty: true, shouldValidate: true });
  const source = catalog?.packages.find((pack) => pack.id === selectedPackage);
  return (
    <div className="col-span-full space-y-3 rounded-lg border p-3">
      <h3 className="font-bold">Rewards</h3>
      {isError && (
        <p role="alert">
          Could not load reward packages and nodes.{" "}
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      )}
      {allowPackages && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Reward package"
              className="min-w-0 flex-1 rounded border bg-background p-2"
              value={selectedPackage}
              onChange={(event) => setSelectedPackage(event.target.value)}
            >
              <option value="">Select a reward package</option>
              {catalog?.packages.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!source || packages.length >= 50}
              onClick={() => {
                if (source)
                  setPackages([
                    ...packages,
                    {
                      id: nanoid(),
                      packageId: source.id,
                      name: source.name,
                      description: source.description,
                      rewards: structuredClone(source.rewards),
                    },
                  ]);
              }}
            >
              Add Package
            </Button>
          </div>
          {source && <p className="text-sm">{getRewardPreview(source.rewards)}</p>}
          <p className="text-muted-foreground text-xs">
            Packages are editable copies. Later catalog edits do not change this quest.
            {isObjectiveReward
              ? " Objective packages are granted when this objective completes."
              : " Each package is one choice when the player chooses rewards."}
          </p>
          {packages.map((pack, index) => (
            <details key={pack.id} open className="rounded border p-2">
              <summary className="cursor-pointer font-semibold">
                {pack.name}: {getRewardPreview(pack.rewards)}
              </summary>
              <div className="my-2 flex gap-2">
                <Input
                  aria-label="Package snapshot name"
                  value={pack.name}
                  onChange={(event) =>
                    setPackages(
                      packages.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPackages(packages.filter((_, i) => i !== index))}
                >
                  Remove Package
                </Button>
              </div>
              <RewardFormWrapper
                idx={0}
                reward={pack.rewards}
                rewards={[pack.rewards]}
                setRewards={(rewards) =>
                  setPackages(
                    packages.map((entry, i) =>
                      i === index
                        ? { ...entry, rewards: rewards[0] ?? ObjectiveReward.parse({}) }
                        : entry,
                    ),
                  )
                }
                grouped
                hideFields={hideFields}
              />
            </details>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Add reward node"
          className="min-w-0 flex-1 rounded border bg-background p-2"
          value=""
          onChange={(event) => setAddedNodes([...addedNodes, event.target.value])}
        >
          <option value="">Add a reward node</option>
          {groups
            .filter((node) => !activeNodes.some((active) => active.id === node.id))
            .map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
        </select>
      </div>
      {activeNodes.map((node) => (
        <details key={node.id} open className="rounded border p-2">
          <summary className="cursor-pointer font-semibold">{node.name}</summary>
          <EditContent
            type={type}
            schema={QuestReward}
            form={form}
            formData={formData.filter((entry) => node.fields.includes(entry.id))}
            showSubmit={false}
            fieldsOnly
            allowMaterialRewards={!allowPackages}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              for (const field of node.fields.filter(
                (field) => !formData.find((entry) => entry.id === field)?.readonly,
              ))
                form.setValue(
                  field,
                  defaultValues[field as keyof typeof defaultValues],
                  { shouldDirty: true, shouldValidate: true },
                );
              setAddedNodes(addedNodes.filter((id) => id !== node.id));
            }}
          >
            Clear Node
          </Button>
        </details>
      ))}
    </div>
  );
};

export const DEFAULT_REWARD_NODES = [
  {
    id: "currency",
    name: "Currency",
    fields: ["reward_money", "reward_seichi_silver", "reward_reputation"],
  },
  {
    id: "organization",
    name: "Organization",
    fields: [
      "reward_clanpoints",
      "reward_anbupoints",
      "reward_tokens",
      "reward_prestige",
    ],
  },
  {
    id: "content",
    name: "Content",
    fields: [
      "reward_items",
      "reward_jutsus",
      "reward_bloodlines",
      "reward_sage_modes",
      "reward_badges",
    ],
  },
  {
    id: "progression",
    name: "Progression",
    fields: Object.keys(rewardFields).filter(
      (field) =>
        field.includes("experience") ||
        field === "reward_exp" ||
        field === "reward_skillpoints",
    ),
  },
  {
    id: "character",
    name: "Character",
    fields: [
      "reward_rank",
      "reward_village_membership",
      "reward_mastery_stat",
      "reward_mastery_rank",
    ],
  },
  {
    id: "special",
    name: "Materials & War",
    fields: [
      "reward_hunter_items",
      "reward_hunter_items_ids",
      "reward_gathering_items",
      "reward_gathering_items_ids",
      "reward_war_damage",
      "reward_war_healing",
    ],
  },
];
