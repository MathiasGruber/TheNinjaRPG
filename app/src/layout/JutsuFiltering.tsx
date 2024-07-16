import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/utils/api";
import Confirm from "@/layout/Confirm";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { animationNames } from "@/libs/combat/types";
import { ElementNames, UserRanks } from "@/drizzle/constants";
import { statFilters, effectFilters, rarities } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchNameSchema } from "@/validators/jutsu";
import { Filter } from "lucide-react";
import { StatTypes } from "@/drizzle/constants";
import type { ElementName, UserRank, StatType } from "@/drizzle/constants";
import type { SearchNameSchema } from "@/validators/jutsu";
import type { AnimationName } from "@/libs/combat/types";
import type { StatGenType, EffectType, RarityType } from "@/libs/train";

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  // Destructure the state
  const { setBloodline, setStat, setEffect, setRarity } = props.state;
  const { setAppearAnim, setRemoveAnim, setStaticAnim } = props.state;
  const { setName, setElement, setRank, setClassification } = props.state;

  const { name, bloodline, stat, effect, rarity, element } = props.state;
  const { rank, appearAnim, staticAnim, removeAnim, classification } = props.state;
  const { fixedBloodline } = props;

  // Get all bloodlines
  const { data } = api.bloodline.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Filter shown bloodlines
  const bloodlines = fixedBloodline
    ? data?.filter((b) => b.id === fixedBloodline)
    : data;
  const bloodlineData = bloodlines?.find((b) => b.id === bloodline);

  // Name search schema
  const form = useForm<SearchNameSchema>({
    resolver: zodResolver(searchNameSchema),
    defaultValues: { name: name },
  });
  const watchName = form.watch("name", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  return (
    <Confirm
      title="Filter Jutsus"
      button={
        <Button id="create-jutsu">
          <Filter className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      }
      onAccept={(e) => {
        e.preventDefault();
      }}
    >
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
        {/* Rank */}
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
        {/* Bloodline */}
        <div>
          <Select onValueChange={(e) => setBloodline(e)}>
            <Label htmlFor="bloodline">Bloodline</Label>
            <SelectTrigger>
              <SelectValue placeholder={bloodlineData?.name || "None"} />
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
          <Select onValueChange={(e) => setAppearAnim(e as AnimationName)}>
            <Label htmlFor="animation">Appear Animation</Label>
            <SelectTrigger>
              <SelectValue placeholder={appearAnim || "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"None"} value="None">
                None
              </SelectItem>
              {animationNames
                .filter((a) => a)
                .map((animation) => (
                  <SelectItem key={animation} value={animation}>
                    {animation}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select onValueChange={(e) => setRemoveAnim(e as AnimationName)}>
            <Label htmlFor="animation">Disappear Animation</Label>
            <SelectTrigger>
              <SelectValue placeholder={removeAnim || "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"None"} value="None">
                None
              </SelectItem>
              {animationNames
                .filter((a) => a)
                .map((animation) => (
                  <SelectItem key={animation} value={animation}>
                    {animation}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="animation">Static Animation</Label>
          <div className="flex flex-row items-center">
            <Select onValueChange={(e) => setStaticAnim(e as AnimationName)}>
              <SelectTrigger>
                <SelectValue placeholder={staticAnim || "None"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key={"None"} value="None">
                  None
                </SelectItem>
                {animationNames
                  .filter((a) => a)
                  .map((animation) => (
                    <SelectItem key={animation} value={animation}>
                      {animation}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
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
            options={effectFilters.map((effect) => ({ value: effect, label: effect }))}
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
      </div>
    </Confirm>
  );
};

export default JutsuFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: JutsuFilteringState) => {
  return {
    name: state.name ? state.name : undefined,
    bloodline: state.bloodline !== "None" ? state.bloodline : undefined,
    rank: state.rank !== "NONE" ? state.rank : undefined,
    rarity: state.rarity !== "ALL" ? state.rarity : undefined,
    appear: state.appearAnim !== "None" ? state.appearAnim : undefined,
    disappear: state.removeAnim !== "None" ? state.removeAnim : undefined,
    static: state.staticAnim !== "None" ? state.staticAnim : undefined,
    classification: state.classification !== "None" ? state.classification : undefined,
    // Multiple selects
    element: state.element.length !== 0 ? (state.element as ElementName[]) : undefined,
    stat: state.stat.length !== 0 ? (state.stat as StatGenType[]) : undefined,
    effect: state.effect.length !== 0 ? (state.effect as EffectType[]) : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  type None = "None";
  const [rarity, setRarity] = useState<RarityType>("ALL");
  const [rank, setRank] = useState<UserRank>("NONE");
  const [name, setName] = useState<string>("");
  const [bloodline, setBloodline] = useState<string>("None");
  const [appearAnim, setAppearAnim] = useState<AnimationName | None>("None");
  const [removeAnim, setRemoveAnim] = useState<AnimationName | None>("None");
  const [staticAnim, setStaticAnim] = useState<AnimationName | None>("None");
  const [classification, setClassification] = useState<StatType | None>("None");
  // Multiple selects
  const [element, setElement] = useState<string[]>([]);
  const [stat, setStat] = useState<string[]>([]);
  const [effect, setEffect] = useState<string[]>([]);

  // Return all
  return {
    name,
    classification,
    bloodline,
    stat,
    effect,
    rarity,
    rank,
    appearAnim,
    staticAnim,
    removeAnim,
    element,
    setName,
    setClassification,
    setBloodline,
    setStat,
    setEffect,
    setRarity,
    setRank,
    setAppearAnim,
    setStaticAnim,
    setRemoveAnim,
    setElement,
  };
};

/** State type */
export type JutsuFilteringState = ReturnType<typeof useFiltering>;
