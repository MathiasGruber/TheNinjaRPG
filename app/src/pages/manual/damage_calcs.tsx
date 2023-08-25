import { z } from "zod";
import { nanoid } from "nanoid";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlayCircleIcon } from "@heroicons/react/24/solid";
import { UserStatNames } from "../../../drizzle/constants";
import Toggle from "../../layout/Toggle";
import ContentBox from "../../layout/ContentBox";
import Button from "../../layout/Button";
import InputField from "../../layout/InputField";
import SelectField from "../../layout/SelectField";
import { damage } from "../../libs/combat/tags";
import { calcLevel } from "../../libs/profile";
import { StatType, GeneralType } from "../../libs/combat/constants";
import type { NextPage } from "next";
import type { UseFormReturn } from "react-hook-form";
import type { BattleUserState, Consequence, UserEffect } from "../../libs/combat/types";

// Default user
const statSchema = z.object({
  ninjutsu: z.number().min(10).max(10000000).default(10),
  taijutsu: z.number().min(10).max(10000000).default(10),
  genjutsu: z.number().min(10).max(10000000).default(10),
  bukijutsu: z.number().min(10).max(10000000).default(10),
  strength: z.number().min(10).max(10000000).default(10),
  speed: z.number().min(10).max(10000000).default(10),
  intelligence: z.number().min(10).max(10000000).default(10),
  willpower: z.number().min(10).max(10000000).default(10),
});
type StatSchema = z.infer<typeof statSchema>;
const defaultsStats = statSchema.parse({});
const statNames = Object.keys(defaultsStats) as (keyof typeof defaultsStats)[];
type UserStatType = typeof statNames[number];

// Form schema
const actSchema = z.object({
  power: z.number().min(1).max(100).default(1),
  statTypes: z.array(z.enum(StatType)).default(["Ninjutsu"]),
  generalTypes: z.array(z.enum(GeneralType)).default(["Strength"]),
});
type ActSchema = z.infer<typeof actSchema>;

// Data for plotting damage for a range of stats
type RangeResult = {
  stat: string;
  statValue: number[];
  damage: number[];
};

const ManualDamageSimulator: NextPage = () => {
  // Page state
  const [selectedDmg, setSelectedDmg] = useState<number | undefined>(undefined);
  const [rangeDmg, setRangeDmg] = useState<RangeResult | undefined>(undefined);
  const [showRanges, setShowRanges] = useState<boolean>(false);
  const [showInline, setShowInline] = useState<boolean>(false);

  // Forms setup
  const conf1 = { defaultValues: defaultsStats, mode: "all" as const };
  const attForm = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const attMin = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const attMax = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const defForm = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const defMin = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const defMax = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const conf2 = { defaultValues: actSchema.parse({}), mode: "all" as const };
  const actForm = useForm<ActSchema>({ ...conf2, resolver: zodResolver(actSchema) });
  console.log();

  // Watch all the forms simultaneously
  const attValues = attForm.watch();
  const defValues = defForm.watch();

  // Extract information from schema to use for showing forms
  const attExp = statNames.map((k) => attValues[k]).reduce((a, b) => a + b, 0) - 120;
  const attLevel = calcLevel(attExp);
  const defExp = statNames.map((k) => defValues[k]).reduce((a, b) => a + b, 0) - 120;
  const defLevel = calcLevel(defExp);

  // Monkey-wrap the damage function
  const getDamage = (attacker: BattleUserState, defender: BattleUserState) => {
    const actValues = actForm.getValues();
    const effect = {
      id: nanoid(),
      power: actValues.power,
      powerPerLevel: 0,
      level: 1,
      calculation: "formula",
      statTypes: actValues.statTypes,
      generalTypes: actValues.generalTypes,
      fromGround: false,
    } as UserEffect;
    const consequences = new Map<string, Consequence>();
    damage(effect, attacker, defender, consequences, 1);
    const result = consequences.get(effect.id)?.damage as number;
    return parseFloat(result.toFixed(2));
  };

  // Handle simulation
  const onSubmit = attForm.handleSubmit(
    () => {
      // Fetch stat ranges, if any
      const minAttValues = attMin.getValues();
      const maxAttValues = attMax.getValues();
      console.log(attValues, minAttValues, maxAttValues);
      const minDefValues = defMin.getValues();
      const maxDefValues = defMax.getValues();
      const attRanges: UserStatType[] = [];
      const defRanges: UserStatType[] = [];
      statNames.forEach((stat) => {
        if (minAttValues[stat] < maxAttValues[stat]) {
          attRanges.push(stat);
        }
        if (minDefValues[stat] < maxDefValues[stat]) {
          defRanges.push(stat);
        }
      });

      // Calculate damage for stat ranges
      console.log(attRanges, defRanges);
      // Calculate damage for selected stats
      const attacker = {
        ...attValues,
        experience: attExp,
      } as unknown as BattleUserState;
      const defender = {
        ...defValues,
        experience: defExp,
      } as unknown as BattleUserState;
      setSelectedDmg(getDamage(attacker, defender));
    },
    (errors) => console.error(errors)
  );

  return (
    <>
      <ContentBox
        title="Damage Simulator"
        subtitle="Benchmark your build (Work in Progress)"
        back_href="/manual"
        padding={false}
        topRightContent={
          <>
            <Toggle
              value={showInline}
              setShowActive={setShowInline}
              labelActive="Inline"
              labelInactive="Inline"
            />
            <Toggle
              value={showRanges}
              setShowActive={setShowRanges}
              labelActive="Ranges"
              labelInactive="Ranges"
            />
          </>
        }
      >
        <div className="grid grid-cols-2">
          <div>
            <p className="px-3 pt-3 text-lg font-bold">Attacker, Offences + Generals</p>
            <p className="px-3 italic text-sm">Assuming equal defence:</p>
            <p className="px-3 italic text-sm">Estimated Exp: {attExp}</p>
            <p className="px-3 pb-1 italic text-sm">Estimated Lvl: {attLevel}</p>
            <hr />
            <UserInput
              id="u1"
              showRanges={showRanges}
              showInline={showInline}
              selectForm={attForm}
              minForm={attMin}
              maxForm={attMax}
            />
          </div>
          <div>
            <p className="px-3 pt-3 text-lg font-bold">Defender, Defences + Generals</p>
            <p className="px-3 italic text-sm">Assuming equal offence:</p>
            <p className="px-3 italic text-sm">Estimated Exp: {defExp}</p>
            <p className="px-3 pb-1 italic text-sm">Estimated Lvl: {defLevel}</p>
            <hr />
            <UserInput
              id="u2"
              showRanges={showRanges}
              showInline={showInline}
              selectForm={defForm}
              minForm={defMin}
              maxForm={defMax}
            />
          </div>
        </div>
        <div>
          <p className="px-3 pt-3 text-lg font-bold">Attack Settings</p>
          <hr />
          <div className="px-3 grid grid-cols-3">
            <InputField
              id="power"
              type="number"
              label={`Set Power`}
              register={actForm.register}
              error={actForm.formState.errors["power"]?.message}
            />
            <SelectField
              id="statTypes"
              label="Set Stats"
              multiple={true}
              register={actForm.register}
              error={actForm.formState.errors["statTypes"]?.message}
            >
              {StatType.map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="generalTypes"
              label="Set Generals"
              multiple={true}
              register={actForm.register}
              error={actForm.formState.errors["generalTypes"]?.message}
            >
              {GeneralType.map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <Button
          id="return"
          label="Run Simulation"
          onClick={onSubmit}
          image={<PlayCircleIcon className="mr-1 h-5 w-5" />}
        />
      </ContentBox>
      {selectedDmg && (
        <ContentBox
          title={`Damage: ${selectedDmg}`}
          subtitle="Create graphs below by selecting stat ranges"
          initialBreak={true}
        >
          {!rangeDmg && <p>No stat ranges specified</p>}
        </ContentBox>
      )}
    </>
  );
};

export default ManualDamageSimulator;

interface UserInputProps {
  id: string;
  showRanges: boolean;
  showInline: boolean;
  selectForm: UseFormReturn<StatSchema>;
  minForm: UseFormReturn<StatSchema>;
  maxForm: UseFormReturn<StatSchema>;
}

const UserInput: React.FC<UserInputProps> = (props) => {
  const { id, showRanges, showInline, selectForm, minForm, maxForm } = props;
  const fields = statNames.map((stat, i) => {
    return (
      <div
        key={`${i}${id}`}
        className={`py-2 ${i % 2 === 0 ? "bg-yellow-50" : "bg-amber-100"}`}
      >
        <div className="px-3">
          <InputField
            id={stat}
            inline={showInline}
            type="number"
            label={stat}
            register={selectForm.register}
            error={selectForm.formState.errors?.[stat]?.message}
          />
        </div>
        {showRanges && (
          <div className="grid grid-cols-2 px-3 ">
            <InputField
              id={stat}
              inline={showInline}
              type="number"
              label="min"
              register={minForm.register}
              error={minForm.formState.errors?.[stat]?.message}
            />
            <InputField
              id={stat}
              inline={showInline}
              type="number"
              label="max"
              register={maxForm.register}
              error={maxForm.formState.errors?.[stat]?.message}
            />
          </div>
        )}
      </div>
    );
  });
  return <div>{fields}</div>;
};
