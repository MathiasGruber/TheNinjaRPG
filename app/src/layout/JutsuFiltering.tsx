import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/utils/api";
import NavTabs from "@/layout/NavTabs";
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
import { mainFilters, statFilters, effectFilters, rarities } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchNameSchema } from "@/validators/jutsu";
import type { ElementName } from "@/drizzle/constants";
import type { SearchNameSchema } from "@/validators/jutsu";
import type { AnimationName } from "@/libs/combat/types";
import type { FilterType, StatType, EffectType, RarityType } from "@/libs/train";

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  // Destructure the state
  const { setBloodline, setStat, setEffect, setRarity, setAnimation } = props.state;
  const { setFilter, setName, setElement, filter, rarity } = props.state;
  const { fixedBloodline } = props;

  // Get all bloodlines
  const { data } = api.bloodline.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Filter shown bloodlines
  const bloodlines = fixedBloodline
    ? data?.filter((b) => b.id === fixedBloodline)
    : data;

  // If fixed bloodline, set the bloodline state to that
  useEffect(() => {
    if (fixedBloodline) setBloodline(fixedBloodline);
  }, [fixedBloodline, setBloodline]);

  // Name search schema
  const form = useForm<SearchNameSchema>({
    resolver: zodResolver(searchNameSchema),
    defaultValues: { name: "" },
  });
  const watchName = form.watch("name", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  // Show filtering widget
  return (
    <div className="flex flex-col gap-1">
      <Select
        onValueChange={(e) => setFilter(e as FilterType)}
        defaultValue={filter}
        value={filter}
      >
        <SelectTrigger>
          <SelectValue placeholder={`None`} />
        </SelectTrigger>
        <SelectContent>
          {mainFilters.map((filter) => (
            <SelectItem key={filter} value={filter}>
              {filter}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filter === "Name" && (
        <Form {...form}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="mx-1">
                <FormControl>
                  <Input id="name" placeholder="Search jutsu" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      )}
      {filter === "Bloodline" && bloodlines && (
        <Select onValueChange={(e) => setBloodline(e)}>
          <SelectTrigger>
            <SelectValue placeholder={`None`} />
          </SelectTrigger>
          <SelectContent>
            {bloodlines
              .sort((a, b) => (a.name < b.name ? -1 : 1))
              .map((bloodline) => (
                <SelectItem key={bloodline.name} value={bloodline.id}>
                  {bloodline.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
      {filter === "Stat" && (
        <Select onValueChange={(e) => setStat(e as StatType)}>
          <SelectTrigger>
            <SelectValue placeholder={`None`} />
          </SelectTrigger>
          <SelectContent>
            {statFilters.map((stat) => (
              <SelectItem key={stat} value={stat}>
                {stat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {filter === "Effect" && (
        <Select onValueChange={(e) => setEffect(e as EffectType)}>
          <SelectTrigger>
            <SelectValue placeholder={`None`} />
          </SelectTrigger>
          <SelectContent>
            {effectFilters.map((effect) => (
              <SelectItem key={effect} value={effect}>
                {effect}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {filter === "Element" && (
        <Select onValueChange={(e) => setElement(e as ElementName)}>
          <SelectTrigger>
            <SelectValue placeholder={`None`} />
          </SelectTrigger>
          <SelectContent>
            {ElementNames.map((element) => (
              <SelectItem key={element} value={element}>
                {element}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {["AppearAnimation", "StaticAnimation", "DisappearAnimation"].includes(
        filter,
      ) && (
        <Select onValueChange={(e) => setAnimation(e as AnimationName)}>
          <SelectTrigger>
            <SelectValue placeholder={`None`} />
          </SelectTrigger>
          <SelectContent>
            {animationNames
              .filter((a) => a)
              .map((animation) => (
                <SelectItem key={animation} value={animation}>
                  {animation}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
      <NavTabs
        current={rarity}
        options={Object.values(rarities)}
        setValue={setRarity}
      />
    </div>
  );
};

export default JutsuFiltering;

/** tRPC filter to be used on api.jutsu.getAll */
export const getFilter = (state: JutsuFilteringState) => {
  return {
    filter: state.filter,
    rarity: state.rarity !== "ALL" ? state.rarity : undefined,
    bloodline: state.filter === "Bloodline" ? state.bloodline : undefined,
    stat: state.filter === "Stat" ? state.stat : undefined,
    effect: state.filter === "Effect" ? state.effect : undefined,
    element: state.filter === "Element" ? state.element : undefined,
    appear: state.filter === "AppearAnimation" ? state.animation : undefined,
    static: state.filter === "StaticAnimation" ? state.animation : undefined,
    disappear: state.filter === "DisappearAnimation" ? state.animation : undefined,
    name: state.filter === "Name" ? state.name : undefined,
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  const [filter, setFilter] = useState(mainFilters[0] as FilterType);
  const [name, setName] = useState<string>("");
  const [bloodline, setBloodline] = useState<string | undefined>(undefined);
  const [stat, setStat] = useState(statFilters[0] as StatType);
  const [animation, setAnimation] = useState(animationNames[0] as AnimationName);
  const [effect, setEffect] = useState(effectFilters[0] as EffectType);
  const [element, setElement] = useState(ElementNames[0] as ElementName);
  const [rarity, setRarity] = useState(rarities[0] as RarityType);
  // Return all
  return {
    name,
    filter,
    bloodline,
    stat,
    effect,
    rarity,
    animation,
    element,
    setName,
    setFilter,
    setBloodline,
    setStat,
    setEffect,
    setRarity,
    setAnimation,
    setElement,
  };
};

/** State type */
export type JutsuFilteringState = ReturnType<typeof useFiltering>;
