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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { searchJutsuSchema } from "@/validators/jutsu";

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
  const [excludedClassifications, setExcludedClassifications] = useState<string[]>([]);
  const [excludedRarities, setExcludedRarities] = useState<string[]>([]);
  const [excludedRanks, setExcludedRanks] = useState<string[]>([]);
  const [excludedMethods, setExcludedMethods] = useState<string[]>([]);
  const [excludedTargets, setExcludedTargets] = useState<string[]>([]);
  const [excludedAppear, setExcludedAppear] = useState<string[]>([]);
  const [excludedDisappear, setExcludedDisappear] = useState<string[]>([]);
  const [excludedStatic, setExcludedStatic] = useState<string[]>([]);
  const [excludedElements, setExcludedElements] = useState<string[]>([]);
  const [excludedEffects, setExcludedEffects] = useState<string[]>([]);
  const [excludedStats, setExcludedStats] = useState<string[]>([]);

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
  const [exclusionCategory, setExclusionCategory] = useState<string>("element");
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
    switch (exclusionCategory) {
      // "type" => add to excludedJutsuTypes
      case "type":
        setExcludedJutsuTypes((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;

      case "classification":
        setExcludedClassifications((prev) =>
          Array.from(new Set([...prev, ...tempExclusions]))
        );
        break;
      case "rarity":
        setExcludedRarities((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "rank":
        setExcludedRanks((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "method":
        setExcludedMethods((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "target":
        setExcludedTargets((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;

      // Animations
      case "appear":
        setExcludedAppear((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "disappear":
        setExcludedDisappear((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "static":
        setExcludedStatic((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;

      // Multi-value JSON
      case "element":
        setExcludedElements((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "effect":
        setExcludedEffects((prev) => Array.from(new Set([...prev, ...tempExclusions])));
        break;
      case "stat":
        setExcludedStats((prev) => Array.from(new Set([...prev, ...tempExclusions])));
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
    item: string
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
          <div>
            <Label>Classification</Label>
            <Select onValueChange={(e) => setClassification(e as StatType)}>
              <SelectTrigger>
                <SelectValue placeholder={classification} />
              </SelectTrigger>
              <SelectContent>
                {StatTypes.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rarity */}
          <div>
            <Label>Rarity</Label>
            <Select onValueChange={(e) => setRarity(e as RarityType)}>
              <SelectTrigger>
                <SelectValue placeholder={rarity} />
              </SelectTrigger>
              <SelectContent>
                {rarities.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bloodline (INCLUDE) */}
          <div>
            <Label>Bloodline</Label>
            <Select onValueChange={(val) => setBloodline(val)}>
              <SelectTrigger>
                <SelectValue placeholder={selectedBloodline?.name || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="None">None</SelectItem>
                {bloodlines
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((bl) => (
                    <SelectItem key={bl.id} value={bl.id}>
                      {bl.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Animations */}
          <div>
            <Label>
              Appear
              <br />
              Animation
            </Label>
            <Select onValueChange={(e) => setAppearAnim(e)}>
              <SelectTrigger>
                <SelectValue placeholder={appearAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Disappear Animation</Label>
            <Select onValueChange={(e) => setRemoveAnim(e)}>
              <SelectTrigger>
                <SelectValue placeholder={removeAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Static Animation</Label>
            <Select onValueChange={(e) => setStaticAnim(e)}>
              <SelectTrigger>
                <SelectValue placeholder={staticAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

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
          <div>
            <Label>Method</Label>
            <Select onValueChange={(m) => setMethod(m as AttackMethod)}>
              <SelectTrigger>
                <SelectValue placeholder={method || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {AttackMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target */}
          <div>
            <Label>Target</Label>
            <Select onValueChange={(m) => setTarget(m as AttackTarget)}>
              <SelectTrigger>
                <SelectValue placeholder={target || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="None" value="None">
                  None
                </SelectItem>
                {AttackTargets.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Required Rank */}
          <div>
            <Label>Required Rank</Label>
            <Select onValueChange={(e) => setRank(e as UserRank)}>
              <SelectTrigger>
                <SelectValue placeholder={rank} />
              </SelectTrigger>
              <SelectContent>
                {UserRanks.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Button variant="outline" size="sm" onClick={() => setShowExclusionPopover(true)}>
              + Add Exclusion
            </Button>
          </div>

          {/* EXCLUDED JUTSU TYPES */}
          {excludedJutsuTypes.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Jutsu Types:</strong>{" "}
              {excludedJutsuTypes.map((jt) => (
                <span key={jt} className="inline-flex items-center mr-2">
                  {jt}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("type", jt)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED CLASSIFICATIONS */}
          {excludedClassifications.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Classifications:</strong>{" "}
              {excludedClassifications.map((item) => (
                <span key={item} className="inline-flex items-center mr-2">
                  {item}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() =>
                      handleRemoveExcludedItem("classification", item)
                    }
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED RARITIES */}
          {excludedRarities.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Rarities:</strong>{" "}
              {excludedRarities.map((item) => (
                <span key={item} className="inline-flex items-center mr-2">
                  {item}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("rarity", item)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED RANKS */}
          {excludedRanks.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Ranks:</strong>{" "}
              {excludedRanks.map((item) => (
                <span key={item} className="inline-flex items-center mr-2">
                  {item}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("rank", item)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED METHODS */}
          {excludedMethods.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Methods:</strong>{" "}
              {excludedMethods.map((item) => (
                <span key={item} className="inline-flex items-center mr-2">
                  {item}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("method", item)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED TARGETS */}
          {excludedTargets.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Targets:</strong>{" "}
              {excludedTargets.map((item) => (
                <span key={item} className="inline-flex items-center mr-2">
                  {item}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("target", item)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED APPEAR ANIMATIONS */}
          {excludedAppear.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Appear Animations:</strong>{" "}
              {excludedAppear.map((anim) => (
                <span key={anim} className="inline-flex items-center mr-2">
                  {anim}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("appear", anim)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED DISAPPEAR ANIMATIONS */}
          {excludedDisappear.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Disappear Animations:</strong>{" "}
              {excludedDisappear.map((anim) => (
                <span key={anim} className="inline-flex items-center mr-2">
                  {anim}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("disappear", anim)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED STATIC ANIMATIONS */}
          {excludedStatic.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Static Animations:</strong>{" "}
              {excludedStatic.map((anim) => (
                <span key={anim} className="inline-flex items-center mr-2">
                  {anim}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("static", anim)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED ELEMENTS */}
          {excludedElements.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Elements:</strong>{" "}
              {excludedElements.map((ex) => (
                <span key={ex} className="inline-flex items-center mr-2">
                  {ex}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("element", ex)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED EFFECTS */}
          {excludedEffects.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Effects:</strong>{" "}
              {excludedEffects.map((ef) => (
                <span key={ef} className="inline-flex items-center mr-2">
                  {ef}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("effect", ef)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}

          {/* EXCLUDED STATS */}
          {excludedStats.length > 0 && (
            <p className="text-sm mt-2">
              <strong>Excluded Stats:</strong>{" "}
              {excludedStats.map((st) => (
                <span key={st} className="inline-flex items-center mr-2">
                  {st}
                  <Button
                    variant="destructive"
                    size="xs"
                    className="ml-1 px-1 py-0.5"
                    onClick={() => handleRemoveExcludedItem("stat", st)}
                  >
                    X
                  </Button>
                </span>
              ))}
            </p>
          )}
        </div>

        {/* EXCLUSION POPOVER FOR ADDING NEW */}
        {showExclusionPopover && (
          <div className="mt-2 border p-2 rounded">
            <Label>Pick Category</Label>
            <Select
              onValueChange={(val) => {
                setExclusionCategory(val);
                setTempExclusions([]);
              }}
              defaultValue={exclusionCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="appear">Appear Animation</SelectItem>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="disappear">Disappear Animation</SelectItem>
                <SelectItem value="effect">Effects</SelectItem>
                <SelectItem value="element">Elements</SelectItem>
                <SelectItem value="method">Method</SelectItem>
                <SelectItem value="rank">Rank</SelectItem>
                <SelectItem value="rarity">Rarity</SelectItem>
                <SelectItem value="stat">Stats</SelectItem>
                <SelectItem value="static">Static Animation</SelectItem>
                <SelectItem value="target">Target</SelectItem>
                <SelectItem value="type">Type</SelectItem>
              </SelectContent>
            </Select>

            <Label className="mt-2">Exclude Items</Label>
            <MultiSelect
              selected={tempExclusions}
              options={exclusionOptions.map((val) => ({ value: val, label: val }))}
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
  return {
    // ------------------------
    // Includes
    // ------------------------
    appear: state.appearAnim !== "None" ? state.appearAnim : undefined,
    bloodline: state.bloodline !== "None" ? state.bloodline : undefined,
    classification: state.classification !== "None" ? state.classification : undefined,
    disappear: state.removeAnim !== "None" ? state.removeAnim : undefined,
    effect: state.effect.length ? (state.effect as EffectType[]) : undefined,
    element: state.element.length ? (state.element as ElementName[]) : undefined,
    method: state.method !== "None" ? state.method : undefined,
    name: state.name || undefined,
    rank: state.rank !== "NONE" ? state.rank : undefined,
    rarity: state.rarity !== "ALL" ? state.rarity : undefined,
    requiredLevel: state.requiredLevel ?? undefined,
    stat: state.stat.length ? (state.stat as StatGenType[]) : undefined,
    static: state.staticAnim !== "None" ? state.staticAnim : undefined,
    target: state.target !== "None" ? state.target : undefined,
    hidden: state.hidden ?? undefined,

    // ------------------------
    // Exclusions
    // ------------------------
    excludedJutsuTypes: state.excludedJutsuTypes.length
      ? state.excludedJutsuTypes
      : undefined,
    excludedClassifications:
      state.excludedClassifications.length > 0 ? state.excludedClassifications : undefined,
    excludedRarities:
      state.excludedRarities.length > 0 ? state.excludedRarities : undefined,
    excludedRanks: state.excludedRanks.length > 0 ? state.excludedRanks : undefined,
    excludedMethods:
      state.excludedMethods.length > 0 ? state.excludedMethods : undefined,
    excludedTargets:
      state.excludedTargets.length > 0 ? state.excludedTargets : undefined,

    excludedAppear:
      state.excludedAppear.length > 0 ? state.excludedAppear : undefined,
    excludedDisappear:
      state.excludedDisappear.length > 0 ? state.excludedDisappear : undefined,
    excludedStatic:
      state.excludedStatic.length > 0 ? state.excludedStatic : undefined,

    excludedElements:
      state.excludedElements.length > 0 ? state.excludedElements : undefined,
    excludedEffects:
      state.excludedEffects.length > 0 ? state.excludedEffects : undefined,
    excludedStats:
      state.excludedStats.length > 0 ? state.excludedStats : undefined,
  };
};
