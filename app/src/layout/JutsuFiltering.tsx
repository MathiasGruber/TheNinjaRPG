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
import { animationNames } from "@/libs/combat/types";
import { ElementNames } from "@/drizzle/constants";
import { statFilters, effectFilters, rarities } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchNameSchema } from "@/validators/jutsu";
import { Filter } from "lucide-react";
import type { ElementName } from "@/drizzle/constants";
import type { SearchNameSchema } from "@/validators/jutsu";
import type { AnimationName } from "@/libs/combat/types";
import type { StatType, EffectType, RarityType } from "@/libs/train";

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  // Destructure the state
  const { setBloodline, setStat, setEffect, setRarity } = props.state;
  const { setAppearAnim, setRemoveAnim, setStaticAnim } = props.state;
  const { setName, setElement } = props.state;

  const { name, bloodline, stat, effect, rarity, element } = props.state;
  const { appearAnim, staticAnim, removeAnim } = props.state;
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
          <Filter className="sm:mr-2 h-6 w-6 hover:fill-orange-500" />
          <p className="hidden sm:block">Filter</p>
        </Button>
      }
      onAccept={(e) => {
        e.preventDefault();
      }}
    >
      <div className="grid grid-cols-2 gap-1 gap-x-3">
        {/* RARITY */}
        <div>
          <Select onValueChange={(e) => setRarity(e as RarityType)}>
            <Label htmlFor="rank">Rank</Label>
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
        {/* Stat */}
        <div>
          <Select onValueChange={(e) => setStat(e as StatType)}>
            <Label htmlFor="stat">Stat</Label>
            <SelectTrigger>
              <SelectValue placeholder={stat || "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"None"} value="None">
                None
              </SelectItem>
              {statFilters.map((stat) => (
                <SelectItem key={stat} value={stat}>
                  {stat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Effect */}
        <div>
          <Select onValueChange={(e) => setEffect(e as EffectType)}>
            <Label htmlFor="effect">Effect</Label>
            <SelectTrigger>
              <SelectValue placeholder={effect || "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"None"} value="None">
                None
              </SelectItem>
              {effectFilters.map((effect) => (
                <SelectItem key={effect} value={effect}>
                  {effect}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Element */}
        <div>
          <Select onValueChange={(e) => setElement(e as ElementName)}>
            <Label htmlFor="element">Element</Label>
            <SelectTrigger>
              <SelectValue placeholder={element || "None"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"None"} value="None">
                None
              </SelectItem>
              {ElementNames.map((element) => (
                <SelectItem key={element} value={element}>
                  {element}
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
    stat: state.stat !== "None" ? state.stat : undefined,
    effect: state.effect !== "None" ? state.effect : undefined,
    element: state.element !== "None" ? state.element : undefined,
    rarity: state.rarity !== "ALL" ? state.rarity : undefined,
    appear: state.appearAnim !== "None" ? state.appearAnim : undefined,
    disappear: state.removeAnim !== "None" ? state.removeAnim : undefined,
    static: state.staticAnim !== "None" ? state.staticAnim : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  type None = "None";
  const [name, setName] = useState<string>("");
  const [bloodline, setBloodline] = useState<string>("None");
  const [stat, setStat] = useState<StatType | None>("None");
  const [effect, setEffect] = useState<EffectType | None>("None");
  const [element, setElement] = useState<ElementName | None>("None");
  const [rarity, setRarity] = useState<RarityType>("ALL");
  const [appearAnim, setAppearAnim] = useState<AnimationName | None>("None");
  const [removeAnim, setRemoveAnim] = useState<AnimationName | None>("None");
  const [staticAnim, setStaticAnim] = useState<AnimationName | None>("None");

  // Return all
  return {
    name,
    bloodline,
    stat,
    effect,
    rarity,
    appearAnim,
    staticAnim,
    removeAnim,
    element,
    setName,
    setBloodline,
    setStat,
    setEffect,
    setRarity,
    setAppearAnim,
    setStaticAnim,
    setRemoveAnim,
    setElement,
  };
};

/** State type */
export type JutsuFilteringState = ReturnType<typeof useFiltering>;
