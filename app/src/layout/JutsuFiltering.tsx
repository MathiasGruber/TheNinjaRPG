import { useEffect } from "react";
import { useState } from "react";
import { api } from "@/utils/api";
import SelectField from "@/layout/SelectField";
import InputField from "@/layout/InputField";
import NavTabs from "@/layout/NavTabs";
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
  const searchSchema = useForm<SearchNameSchema>({
    resolver: zodResolver(searchNameSchema),
  });
  const watchName = searchSchema.watch("name", "");

  // Update the state
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setName(watchName);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [watchName, setName]);

  // Show filtering widget
  return (
    <div className="flex flex-col">
      <SelectField
        id={filter}
        onChange={(e) => setFilter(e.target.value as FilterType)}
      >
        {mainFilters.map((filter) => {
          return (
            <option key={filter} value={filter}>
              {filter}
            </option>
          );
        })}
      </SelectField>
      {filter === "Name" && (
        <InputField
          id="name"
          register={searchSchema.register}
          error={searchSchema.formState.errors.name?.message}
          placeholder="Search for jutsu"
        />
      )}
      {filter === "Bloodline" && bloodlines && (
        <SelectField id={filter} onChange={(e) => setBloodline(e.target.value)}>
          {!fixedBloodline && (
            <option key="None" value="None">
              None
            </option>
          )}
          {bloodlines
            .sort((a, b) => (a.name < b.name ? -1 : 1))
            .map((bloodline) => {
              return (
                <option key={bloodline.name} value={bloodline.id}>
                  {bloodline.name}
                </option>
              );
            })}
        </SelectField>
      )}
      {filter === "Stat" && (
        <SelectField id={filter} onChange={(e) => setStat(e.target.value as StatType)}>
          {statFilters.map((stat) => {
            return (
              <option key={stat} value={stat}>
                {stat}
              </option>
            );
          })}
        </SelectField>
      )}
      {filter === "Effect" && (
        <SelectField
          id={filter}
          onChange={(e) => setEffect(e.target.value as EffectType)}
        >
          {effectFilters.map((effect) => {
            return (
              <option key={effect} value={effect}>
                {effect}
              </option>
            );
          })}
        </SelectField>
      )}
      {filter === "Element" && (
        <SelectField
          id={filter}
          onChange={(e) => setElement(e.target.value as ElementName)}
        >
          {ElementNames.map((element) => {
            return (
              <option key={element} value={element}>
                {element}
              </option>
            );
          })}
        </SelectField>
      )}
      {["AppearAnimation", "StaticAnimation", "DisappearAnimation"].includes(
        filter,
      ) && (
        <SelectField
          id={filter}
          onChange={(e) => setAnimation(e.target.value as AnimationName)}
        >
          {animationNames.map((animation) => {
            return (
              <option key={animation} value={animation}>
                {animation}
              </option>
            );
          })}
        </SelectField>
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
  const [name, setName] = useState<string>("");
  const [bloodline, setBloodline] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState(mainFilters[0] as FilterType);
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
