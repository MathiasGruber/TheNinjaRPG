import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import Toggle from "@/components/control/Toggle";
import { Filter } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { searchJutsuSchema } from "@/validators/jutsu";
import { X } from "lucide-react";
import {
  ElementNames,
  UserRanks,
  StatTypes,
  AttackMethods,
  AttackTargets,
  JutsuTypes, // ["AI","NORMAL","BOSS","LOOT","EVENT"]
} from "@/drizzle/constants";

import { statFilters, effectFilters, rarities } from "@/libs/train";
import type { SearchJutsuSchema } from "@/validators/jutsu";
import type {
  ElementName,
  UserRank,
  StatType,
  AttackMethod,
  AttackTarget,
} from "@/drizzle/constants";
import type { StatGenType, EffectType, RarityType } from "@/libs/train";

// New type definitions
type ExclusionCategory =
  | "type"
  | "appear"
  | "classification"
  | "disappear"
  | "effect"
  | "element"
  | "method"
  | "rarity"
  | "rank"
  | "stat"
  | "static"
  | "target";

// Reusable FilterSelect component
interface FilterSelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  includeNone?: boolean;
}

const FilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  onValueChange,
  options,
  includeNone = true,
}) => (
  <div>
    <Label>{label}</Label>
    <Select onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={value} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && (
          <SelectItem key="None" value="None">
            None
          </SelectItem>
        )}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// Reusable ExcludedItemsList component
interface ExcludedItemsListProps {
  title: string;
  items: string[];
  category: ExclusionCategory;
  onRemove: (category: ExclusionCategory, item: string) => void;
}

const ExcludedItemsList: React.FC<ExcludedItemsListProps> = ({
  title,
  items,
  category,
  onRemove,
}) => {
  if (items.length === 0) return null;

  return (
    <p className="text-sm mt-2">
      <strong>{title}:</strong>{" "}
      {items.map((item) => (
        <span key={item} className="inline-flex items-center mr-2">
          {item}
          <Button
            variant="destructive"
            size="sm"
            className="ml-1 px-2"
            onClick={() => onRemove(category, item)}
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ))}
    </p>
  );
};

// Exclusion categories configuration
const EXCLUSION_CATEGORIES: Record<
  ExclusionCategory,
  {
    label: string;
    options: string[];
  }
> = {
  type: {
    label: "Jutsu Types",
    options: [...JutsuTypes],
  },
  appear: {
    label: "Appear Animations",
    options: [...StatTypes],
  },
  classification: {
    label: "Classifications",
    options: [...StatTypes],
  },
  disappear: {
    label: "Disappear Animations",
    options: [...effectFilters],
  },
  effect: {
    label: "Effects",
    options: [...effectFilters],
  },
  element: {
    label: "Elements",
    options: [...ElementNames],
  },
  method: {
    label: "Methods",
    options: [...AttackMethods],
  },
  rank: {
    label: "Ranks",
    options: [...UserRanks],
  },
  rarity: {
    label: "Rarities",
    options: [...rarities],
  },
  stat: {
    label: "Stats",
    options: [...statFilters],
  },
  static: {
    label: "Static Animations",
    options: [], // This will be populated from assetData
  },
  target: {
    label: "Targets",
    options: [...AttackTargets],
  },
};

/**
 * STATE HOOK
 */
export const useFiltering = () => {
  type None = "None";

  // -------------------------
  // "Include" states
  // -------------------------
  const [appearAnim, setAppearAnim] = useState<string>("None");
  const [bloodline, setBloodline] = useState<string>("None");
  const [classification, setClassification] = useState<StatType | None>("None");
  const [effect, setEffect] = useState<string[]>([]);
  const [element, setElement] = useState<string[]>([]);
  const [method, setMethod] = useState<AttackMethod | None>("None");
  const [name, setName] = useState<string>("");
  const [rank, setRank] = useState<UserRank>("NONE");
  const [requiredLevel, setRequiredLevel] = useState<number>(1);
  const [rarity, setRarity] = useState<RarityType>("ALL");
  const [removeAnim, setRemoveAnim] = useState<string>("None");
  const [stat, setStat] = useState<string[]>([]);
  const [staticAnim, setStaticAnim] = useState<string>("None");
  const [target, setTarget] = useState<AttackTarget | None>("None");
  const [hidden, setHidden] = useState<boolean | undefined>(false);

  // -------------------------
  // "Exclude" states
  // -------------------------
  // The DB column is "type", but we'll store excluded items in excludedJutsuTypes.
  const [excludedJutsuTypes, setExcludedJutsuTypes] = useState<string[]>([]);
  const [excludedClassifications, setExcludedClassifications] = useState<StatType[]>(
    [],
  );
  const [excludedRarities, setExcludedRarities] = useState<RarityType[]>([]);
  const [excludedRanks, setExcludedRanks] = useState<UserRank[]>([]);
  const [excludedMethods, setExcludedMethods] = useState<AttackMethod[]>([]);
  const [excludedTargets, setExcludedTargets] = useState<AttackTarget[]>([]);
  const [excludedAppear, setExcludedAppear] = useState<string[]>([]);
  const [excludedDisappear, setExcludedDisappear] = useState<string[]>([]);
  const [excludedStatic, setExcludedStatic] = useState<string[]>([]);
  const [excludedElements, setExcludedElements] = useState<ElementName[]>([]);
  const [excludedEffects, setExcludedEffects] = useState<EffectType[]>([]);
  const [excludedStats, setExcludedStats] = useState<StatGenType[]>([]);

  return {
    // includes
    appearAnim,
    bloodline,
    classification,
    effect,
    element,
    hidden,
    method,
    name,
    rank,
    rarity,
    removeAnim,
    requiredLevel,
    stat,
    staticAnim,
    target,

    // excludes
    excludedJutsuTypes,
    excludedClassifications,
    excludedRarities,
    excludedRanks,
    excludedMethods,
    excludedTargets,
    excludedAppear,
    excludedDisappear,
    excludedStatic,
    excludedElements,
    excludedEffects,
    excludedStats,

    // set states
    setAppearAnim,
    setBloodline,
    setClassification,
    setEffect,
    setElement,
    setHidden,
    setMethod,
    setName,
    setRank,
    setRarity,
    setRemoveAnim,
    setRequiredLevel,
    setStat,
    setStaticAnim,
    setTarget,

    // exclude setters
    setExcludedJutsuTypes,
    setExcludedClassifications,
    setExcludedRarities,
    setExcludedRanks,
    setExcludedMethods,
    setExcludedTargets,
    setExcludedAppear,
    setExcludedDisappear,
    setExcludedStatic,
    setExcludedElements,
    setExcludedEffects,
    setExcludedStats,
  };
};

export type JutsuFilteringState = ReturnType<typeof useFiltering>;

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

/**
 * MAIN COMPONENT
 */
const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  const {
    // includes
    appearAnim,
    bloodline,
    classification,
    effect,
    element,
    hidden,
    method,
    name,
    rank,
    rarity,
    removeAnim,
    requiredLevel,
    stat,
    staticAnim,
    target,

    // excludes
    excludedJutsuTypes,
    excludedClassifications,
    excludedRarities,
    excludedRanks,
    excludedMethods,
    excludedTargets,
    excludedAppear,
    excludedDisappear,
    excludedStatic,
    excludedElements,
    excludedEffects,
    excludedStats,

    // set states
    setAppearAnim,
    setBloodline,
    setClassification,
    setEffect,
    setElement,
    setHidden,
    setMethod,
    setName,
    setRank,
    setRarity,
    setRemoveAnim,
    setRequiredLevel,
    setStat,
    setStaticAnim,
    setTarget,

    // exclude setters
    setExcludedJutsuTypes,
    setExcludedClassifications,
    setExcludedRarities,
    setExcludedRanks,
    setExcludedMethods,
    setExcludedTargets,
    setExcludedAppear,
    setExcludedDisappear,
    setExcludedStatic,
    setExcludedElements,
    setExcludedEffects,
    setExcludedStats,
  } = props.state;

  const { data: userData } = useUserData();
  const { fixedBloodline } = props;

  // React Hook Form for name & requiredLevel
  const form = useForm<SearchJutsuSchema>({
    resolver: zodResolver(searchJutsuSchema),
    defaultValues: { name },
  });
  const watchName = form.watch("name", undefined);
  const watchRequiredLevel = form.watch("requiredLevel", requiredLevel);

  // Debounce name changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  // Debounce requiredLevel changes
  useEffect(() => {
    if (watchRequiredLevel) {
      const delayDebounceFn = setTimeout(() => {
        setRequiredLevel(watchRequiredLevel);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [watchRequiredLevel, setRequiredLevel]);

  // Data queries
  const { data: bloodlineData } = api.bloodline.getAllNames.useQuery(undefined);
  const { data: assetData } = api.misc.getAllGameAssetNames.useQuery(undefined);

  // Filter bloodlines if user has a fixedBloodline
  const bloodlines = fixedBloodline
    ? bloodlineData?.filter((b) => b.id === fixedBloodline)
    : bloodlineData;
  const selectedBloodline = bloodlines?.find((b) => b.id === bloodline);

  // Exclusion popover
  const [showExclusionPopover, setShowExclusionPopover] = useState(false);
  const [exclusionCategory, setExclusionCategory] =
    useState<ExclusionCategory>("element");
  const [tempExclusions, setTempExclusions] = useState<string[]>([]);

  // Decide which options to show in the MultiSelect
  const exclusionOptions = (() => {
    switch (exclusionCategory) {
      case "appear":
        return StatTypes; // Example or your logic?
      case "classification":
        return StatTypes;
      case "disappear":
        return effectFilters;
      case "effect":
        return effectFilters;
      case "element":
        return ElementNames;
      case "method":
        return AttackMethods;
      case "rank":
        return UserRanks;
      case "rarity":
        return rarities;
      case "stat":
        return statFilters;
      case "static":
        return assetData ? assetData.map((a) => a.name) : [];
      case "target":
        return AttackTargets;
      // This is critical:
      case "type":
        return JutsuTypes;

      default:
        return [];
    }
  })();

  // Confirm new exclusions
  const handleAddExclusions = () => {
    const newExclusions = [...new Set(tempExclusions)];

    switch (exclusionCategory) {
      case "type":
        setExcludedJutsuTypes(newExclusions);
        break;

      case "classification":
        setExcludedClassifications(newExclusions as StatType[]);
        break;
      case "rarity":
        setExcludedRarities(newExclusions as RarityType[]);
        break;
      case "rank":
        setExcludedRanks(newExclusions as UserRank[]);
        break;
      case "method":
        setExcludedMethods(newExclusions as AttackMethod[]);
        break;
      case "target":
        setExcludedTargets(newExclusions as AttackTarget[]);
        break;

      // Animations
      case "appear":
        setExcludedAppear(newExclusions);
        break;
      case "disappear":
        setExcludedDisappear(newExclusions);
        break;
      case "static":
        setExcludedStatic(newExclusions);
        break;

      // Multi-value JSON
      case "element":
        setExcludedElements(newExclusions as ElementName[]);
        break;
      case "effect":
        setExcludedEffects(newExclusions as EffectType[]);
        break;
      case "stat":
        setExcludedStats(newExclusions as StatGenType[]);
        break;
      default:
        break;
    }

    setTempExclusions([]);
    setShowExclusionPopover(false);
  };

  // Remove a single exclusion
  const handleRemoveExcludedItem = (
    category:
      | "type"
      | "appear"
      | "classification"
      | "disappear"
      | "effect"
      | "element"
      | "method"
      | "rarity"
      | "rank"
      | "stat"
      | "static"
      | "target",
    item: string,
  ) => {
    switch (category) {
      case "type":
        setExcludedJutsuTypes((prev) => prev.filter((x) => x !== item));
        break;
      case "classification":
        setExcludedClassifications((prev) => prev.filter((c) => c !== item));
        break;
      case "rarity":
        setExcludedRarities((prev) => prev.filter((r) => r !== item));
        break;
      case "rank":
        setExcludedRanks((prev) => prev.filter((r) => r !== item));
        break;
      case "method":
        setExcludedMethods((prev) => prev.filter((m) => m !== item));
        break;
      case "target":
        setExcludedTargets((prev) => prev.filter((t) => t !== item));
        break;

      // Animations
      case "appear":
        setExcludedAppear((prev) => prev.filter((anim) => anim !== item));
        break;
      case "disappear":
        setExcludedDisappear((prev) => prev.filter((anim) => anim !== item));
        break;
      case "static":
        setExcludedStatic((prev) => prev.filter((anim) => anim !== item));
        break;

      // Multi-value JSON
      case "element":
        setExcludedElements((prev) => prev.filter((el) => el !== item));
        break;
      case "effect":
        setExcludedEffects((prev) => prev.filter((ef) => ef !== item));
        break;
      case "stat":
        setExcludedStats((prev) => prev.filter((st) => st !== item));
        break;
      default:
        break;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      </PopoverTrigger>

      <PopoverContent>
        {/* MAIN FILTERS GRID */}
        <div className="grid grid-cols-2 gap-1 gap-x-3">
          {/* Name */}
          <div>
            <Form {...form}>
              <Label>Name</Label>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Search jutsu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>

          {/* Classification */}
          <FilterSelect
            label="Classification"
            value={classification}
            onValueChange={(e) => setClassification(e as StatType)}
            options={[...StatTypes]}
          />

          {/* Rarity */}
          <FilterSelect
            label="Rarity"
            value={rarity}
            onValueChange={(e) => setRarity(e as RarityType)}
            options={[...rarities]}
          />

          {/* Bloodline */}
          <FilterSelect
            label="Bloodline"
            value={bloodline}
            onValueChange={setBloodline}
            options={
              bloodlines
                ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((bl) => bl.id) || []
            }
          />

          {/* Animations */}
          <FilterSelect
            label="Appear Animation"
            value={appearAnim}
            onValueChange={setAppearAnim}
            options={
              assetData
                ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((asset) => asset.id) || []
            }
          />

          <FilterSelect
            label="Disappear Animation"
            value={removeAnim}
            onValueChange={setRemoveAnim}
            options={
              assetData
                ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((asset) => asset.id) || []
            }
          />

          <FilterSelect
            label="Static Animation"
            value={staticAnim}
            onValueChange={setStaticAnim}
            options={
              assetData
                ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((asset) => asset.id) || []
            }
          />

          {/* Elements */}
          <div>
            <Label>Elements</Label>
            <MultiSelect
              selected={element}
              options={ElementNames.map((el) => ({ value: el, label: el }))}
              onChange={setElement}
            />
          </div>

          {/* Effects */}
          <div>
            <Label>Effects</Label>
            <MultiSelect
              selected={effect}
              options={effectFilters.map((ef) => ({ value: ef, label: ef }))}
              onChange={setEffect}
            />
          </div>

          {/* Stat */}
          <div>
            <Label>Stat</Label>
            <MultiSelect
              selected={stat}
              options={statFilters.map((sf) => ({ value: sf, label: sf }))}
              onChange={setStat}
            />
          </div>

          {/* Method */}
          <FilterSelect
            label="Method"
            value={method}
            onValueChange={(m) => setMethod(m as AttackMethod)}
            options={[...AttackMethods]}
          />

          {/* Target */}
          <FilterSelect
            label="Target"
            value={target}
            onValueChange={(m) => setTarget(m as AttackTarget)}
            options={[...AttackTargets]}
          />

          {/* Required Rank */}
          <FilterSelect
            label="Required Rank"
            value={rank}
            onValueChange={(e) => setRank(e as UserRank)}
            options={[...UserRanks]}
            includeNone={false}
          />

          {/* Required Level */}
          <div>
            <Form {...form}>
              <Label>Required Level</Label>
              <FormField
                control={form.control}
                name="requiredLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" placeholder="Required level" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>
          </div>

          {/* Hidden */}
          {userData && canChangeContent(userData.role) && (
            <div className="mt-1">
              <Toggle
                verticalLayout
                id="toggle-hidden-only"
                value={hidden}
                setShowActive={setHidden}
                labelActive="Hidden"
                labelInactive="Non-Hidden"
              />
            </div>
          )}
        </div>

        {/* EXCLUSION AREA */}
        <div className="mt-3 p-2 border-t border-gray-300">
          <div className="flex justify-between items-center">
            <Label>Exclusions</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExclusionPopover(true)}
            >
              + Add Exclusion
            </Button>
          </div>

          {/* Render all exclusion lists */}
          <ExcludedItemsList
            title="Excluded Jutsu Types"
            items={excludedJutsuTypes}
            category="type"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Classifications"
            items={excludedClassifications}
            category="classification"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Rarities"
            items={excludedRarities}
            category="rarity"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Ranks"
            items={excludedRanks}
            category="rank"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Methods"
            items={excludedMethods}
            category="method"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Targets"
            items={excludedTargets}
            category="target"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Appear Animations"
            items={excludedAppear}
            category="appear"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Disappear Animations"
            items={excludedDisappear}
            category="disappear"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Static Animations"
            items={excludedStatic}
            category="static"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Elements"
            items={excludedElements}
            category="element"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Effects"
            items={excludedEffects}
            category="effect"
            onRemove={handleRemoveExcludedItem}
          />
          <ExcludedItemsList
            title="Excluded Stats"
            items={excludedStats}
            category="stat"
            onRemove={handleRemoveExcludedItem}
          />
        </div>

        {/* EXCLUSION POPOVER FOR ADDING NEW */}
        {showExclusionPopover && (
          <div className="mt-2 border p-2 rounded">
            <Label>Pick Category</Label>
            <Select
              onValueChange={(val) => {
                setExclusionCategory(val as ExclusionCategory);
                setTempExclusions([]);
              }}
              defaultValue={exclusionCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXCLUSION_CATEGORIES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="mt-2">Exclude Items</Label>
            <MultiSelect
              selected={tempExclusions}
              options={
                exclusionCategory === "static" && assetData
                  ? assetData.map((a) => ({ value: a.name, label: a.name }))
                  : EXCLUSION_CATEGORIES[exclusionCategory].options.map((val) => ({
                      value: val,
                      label: val,
                    }))
              }
              onChange={setTempExclusions}
            />

            <div className="mt-3 flex gap-2">
              <Button onClick={handleAddExclusions}>Confirm</Button>
              <Button variant="ghost" onClick={() => setShowExclusionPopover(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default JutsuFiltering;

/**
 * Combine includes + excludes into final object
 */
export const getFilter = (state: JutsuFilteringState) => {
  const processValue = <T,>(value: T, defaultValue: T) =>
    value !== defaultValue ? value : undefined;

  const processArray = <T,>(arr: T[]) => (arr.length > 0 ? arr : undefined);

  return {
    // Includes
    appear: processValue(state.appearAnim, "None"),
    bloodline: processValue(state.bloodline, "None"),
    classification: processValue(state.classification, "None"),
    disappear: processValue(state.removeAnim, "None"),
    effect: processArray(state.effect as EffectType[]),
    element: processArray(state.element as ElementName[]),
    method: processValue(state.method, "None"),
    name: state.name || undefined,
    rank: processValue(state.rank, "NONE"),
    rarity: processValue(state.rarity, "ALL"),
    requiredLevel: state.requiredLevel ?? undefined,
    stat: processArray(state.stat as StatGenType[]),
    static: processValue(state.staticAnim, "None"),
    target: processValue(state.target, "None"),
    hidden: state.hidden ?? undefined,

    // Exclusions
    ...Object.fromEntries(
      Object.entries({
        excludedJutsuTypes: state.excludedJutsuTypes,
        excludedClassifications: state.excludedClassifications,
        excludedRarities: state.excludedRarities,
        excludedRanks: state.excludedRanks,
        excludedMethods: state.excludedMethods,
        excludedTargets: state.excludedTargets,
        excludedAppear: state.excludedAppear,
        excludedDisappear: state.excludedDisappear,
        excludedStatic: state.excludedStatic,
        excludedElements: state.excludedElements,
        excludedEffects: state.excludedEffects,
        excludedStats: state.excludedStats,
      }).map(([key, value]) => [key, processArray(value)]),
    ),
  };
};
