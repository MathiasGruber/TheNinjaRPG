import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/utils/api";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { ElementNames, UserRanks } from "@/drizzle/constants";
import { statFilters, effectFilters, rarities } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchJutsuSchema } from "@/validators/jutsu";
import { Filter } from "lucide-react";
import { StatTypes, AttackMethods, AttackTargets } from "@/drizzle/constants";
import Toggle from "@/components/control/Toggle";
import { useUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import type { ElementName, UserRank, StatType } from "@/drizzle/constants";
import type { AttackMethod, AttackTarget } from "@/drizzle/constants";
import type { SearchJutsuSchema } from "@/validators/jutsu";
import type { StatGenType, EffectType, RarityType } from "@/libs/train";

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  // Global state
  const { data: userData } = useUserData();

  // Destructure the state
  const { setBloodline, setStat, setEffect, setRarity } = props.state;
  const { setAppearAnim, setRemoveAnim, setStaticAnim } = props.state;
  const { setName, setElement, setRank, setClassification } = props.state;
  const { setMethod, setTarget, setRequiredLevel, setHidden } = props.state;

  const { name, bloodline, stat, effect, rarity, element, hidden } = props.state;
  const { rank, appearAnim, staticAnim, removeAnim, classification } = props.state;
  const { method, target, requiredLevel } = props.state;
  const { fixedBloodline } = props;

  // Get all bloodlines
  const { data: bloodlineData } = api.bloodline.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { data: assetData } = api.misc.getAllGameAssetNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Filter shown bloodlines
  const bloodlines = fixedBloodline
    ? bloodlineData?.filter((b) => b.id === fixedBloodline)
    : bloodlineData;
  const selectedBloodline = bloodlines?.find((b) => b.id === bloodline);

  // Name search schema
  const form = useForm<SearchJutsuSchema>({
    resolver: zodResolver(searchJutsuSchema),
    defaultValues: { name: name },
  });
  const watchName = form.watch("name", undefined);
  const watchRequiredLevel = form.watch("requiredLevel", requiredLevel);

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  useEffect(() => {
    if (watchRequiredLevel) {
      const delayDebounceFn = setTimeout(() => {
        setRequiredLevel(watchRequiredLevel);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [watchRequiredLevel, setRequiredLevel]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id="filter-bloodline">
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid grid-cols-2 gap-1 gap-x-3">
          {/* JUTSU NAME */}
          <div>
            <Form {...form}>
              <Label htmlFor="rank">Name</Label>
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
          {/* Stat Classification */}
          <div>
            <Select onValueChange={(e) => setClassification(e as StatType)}>
              <Label htmlFor="rank">Stat Classification</Label>
              <SelectTrigger>
                <SelectValue placeholder={classification} />
              </SelectTrigger>
              <SelectContent>
                {StatTypes.map((stat) => (
                  <SelectItem key={stat} value={stat}>
                    {stat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* RARITY */}
          <div>
            <Select onValueChange={(e) => setRarity(e as RarityType)}>
              <Label htmlFor="rank">Rarity</Label>
              <SelectTrigger>
                <SelectValue placeholder={rarity} />
              </SelectTrigger>
              <SelectContent>
                {rarities.map((rarity) => (
                  <SelectItem key={rarity} value={rarity}>
                    {rarity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Bloodline */}
          <div>
            <Select onValueChange={(e) => setBloodline(e)}>
              <Label htmlFor="bloodline">Bloodline</Label>
              <SelectTrigger>
                <SelectValue placeholder={selectedBloodline?.name || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {bloodlines
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((bloodline) => (
                    <SelectItem key={bloodline.name} value={bloodline.id}>
                      {bloodline.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* ANIMATION */}
          <div>
            <Select onValueChange={(e) => setAppearAnim(e)}>
              <Label htmlFor="setAppearAnim">Appear Animation</Label>
              <SelectTrigger>
                <SelectValue placeholder={appearAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.name} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select onValueChange={(e) => setRemoveAnim(e)}>
              <Label htmlFor="setRemoveAnim">Disappear Animation</Label>
              <SelectTrigger>
                <SelectValue placeholder={removeAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.name} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select onValueChange={(e) => setStaticAnim(e)}>
              <Label htmlFor="setRemoveAnim">Static Animation</Label>
              <SelectTrigger>
                <SelectValue placeholder={staticAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {assetData
                  ?.sort((a, b) => (a.name < b.name ? -1 : 1))
                  .map((asset) => (
                    <SelectItem key={asset.name} value={asset.id}>
                      {asset.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {/* Element */}
          <div>
            <Label htmlFor="element">Elements</Label>
            <MultiSelect
              selected={element}
              options={ElementNames.map((element) => ({
                value: element,
                label: element,
              }))}
              onChange={setElement}
            />
          </div>
          {/* Effect */}
          <div className="">
            <Label htmlFor="effect">Effects</Label>
            <MultiSelect
              selected={effect}
              options={effectFilters.map((effect) => ({
                value: effect,
                label: effect,
              }))}
              onChange={setEffect}
            />
          </div>

          {/* Stat */}
          <div className="">
            <Label htmlFor="stat">Stat</Label>
            <MultiSelect
              selected={stat}
              options={statFilters.map((stat) => ({ value: stat, label: stat }))}
              onChange={setStat}
            />
          </div>

          {/* Method */}
          <div className="">
            <Label htmlFor="method">Method</Label>
            <div className="flex flex-row items-center">
              <Select onValueChange={(m) => setMethod(m as AttackMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder={method || "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem key={"None"} value="None">
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
          </div>

          {/* Target */}
          <div className="">
            <Label htmlFor="method">Target</Label>
            <div className="flex flex-row items-center">
              <Select onValueChange={(m) => setTarget(m as AttackTarget)}>
                <SelectTrigger>
                  <SelectValue placeholder={target || "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem key={"None"} value="None">
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
          </div>
          {/* Required Rank */}
          <div>
            <Select onValueChange={(e) => setRank(e as UserRank)}>
              <Label htmlFor="rank">Required Rank</Label>
              <SelectTrigger>
                <SelectValue placeholder={rank} />
              </SelectTrigger>
              <SelectContent>
                {UserRanks.map((rank) => (
                  <SelectItem key={rank} value={rank}>
                    {rank}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Required level */}
          <div>
            <Form {...form}>
              <Label htmlFor="requiredLevel">Required Level</Label>
              <FormField
                control={form.control}
                name="requiredLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input id="name" placeholder="Required level" {...field} />
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
      </PopoverContent>
    </Popover>
  );
};

export default JutsuFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: JutsuFilteringState) => {
  return {
    appear: state.appearAnim !== "None" ? state.appearAnim : undefined,
    bloodline: state.bloodline !== "None" ? state.bloodline : undefined,
    classification: state.classification !== "None" ? state.classification : undefined,
    disappear: state.removeAnim !== "None" ? state.removeAnim : undefined,
    effect: state.effect.length !== 0 ? (state.effect as EffectType[]) : undefined,
    element: state.element.length !== 0 ? (state.element as ElementName[]) : undefined,
    method: state.method !== "None" ? state.method : undefined,
    name: state.name ? state.name : undefined,
    rank: state.rank !== "NONE" ? state.rank : undefined,
    rarity: state.rarity !== "ALL" ? state.rarity : undefined,
    requiredLevel: state.requiredLevel,
    stat: state.stat.length !== 0 ? (state.stat as StatGenType[]) : undefined,
    static: state.staticAnim !== "None" ? state.staticAnim : undefined,
    target: state.target !== "None" ? state.target : undefined,
    hidden: state.hidden ? state.hidden : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  type None = "None";
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

  // Return all
  return {
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
    stat,
    staticAnim,
    target,
  };
};

/** State type */
export type JutsuFilteringState = ReturnType<typeof useFiltering>;
