import { useEffect } from "react";
import { api } from "../utils/api";
import { useState } from "react";
import SelectField from "./SelectField";
import NavTabs from "./NavTabs";
import { mainFilters, statFilters, effectFilters, rarities } from "../libs/train";
import type { FilterType, StatType, EffectType, RarityType } from "../libs/train";

interface JutsuFilteringProps {
  state: JutsuFilteringState;
  fixedBloodline?: string | null;
}

const JutsuFiltering: React.FC<JutsuFilteringProps> = (props) => {
  // Destructure the state
  const { setFilter, setBloodline, setStat, setEffect, setRarity } = props.state;
  const { filter, rarity } = props.state;
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
  // Show filtering widget
  return (
    <div className="flex flex-col">
      <SelectField
        id="filter"
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
      {filter === "Bloodline" && bloodlines && (
        <SelectField id="filter" onChange={(e) => setBloodline(e.target.value)}>
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
        <SelectField id="filter" onChange={(e) => setStat(e.target.value as StatType)}>
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
          id="filter"
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
  };
};

/** State for the Jutsu Filtering component */
export const useFiltering = () => {
  // State variables
  const [filter, setFilter] = useState<FilterType>(mainFilters[0]);
  const [bloodline, setBloodline] = useState<string | undefined>(undefined);
  const [stat, setStat] = useState<StatType>(statFilters[0]);
  const [effect, setEffect] = useState<EffectType>(effectFilters[0]);
  const [rarity, setRarity] = useState<RarityType>(rarities[0]);
  // Return all
  return {
    filter,
    bloodline,
    stat,
    effect,
    rarity,
    setFilter,
    setBloodline,
    setStat,
    setEffect,
    setRarity,
  };
};

/** State type */
export type JutsuFilteringState = ReturnType<typeof useFiltering>;
