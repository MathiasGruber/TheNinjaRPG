import { nanoid } from "nanoid";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CloudArrowDownIcon } from "@heroicons/react/24/solid";
import { ArrowTopRightOnSquareIcon, TrashIcon } from "@heroicons/react/24/solid";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";
import Toggle from "../../../layout/Toggle";
import ContentBox from "../../../layout/ContentBox";
import Button from "../../../layout/Button";
import InputField from "../../../layout/InputField";
import SelectField from "../../../layout/SelectField";
import { damage } from "../../../libs/combat/tags";
import { calcLevel } from "../../../libs/profile";
import { StatType, GeneralType } from "../../../libs/combat/constants";
import { statSchema, actSchema } from "../../../libs/combat/types";
import { api } from "../../../utils/api";
import { show_toast } from "../../../libs/toast";
import type { DamageSimulation } from "../../../../drizzle/schema";
import type { z } from "zod";
import type { NextPage } from "next";
import type { UseFormReturn } from "react-hook-form";
import type { UserEffect } from "../../../libs/combat/types";
import type { BattleUserState } from "../../../libs/combat/types";
import type { Consequence } from "../../../libs/combat/types";

// Default user
type StatSchema = z.infer<typeof statSchema>;
type ActSchema = z.infer<typeof actSchema>;
const defaultsStats = statSchema.parse({});
const statNames = Object.keys(defaultsStats) as (keyof typeof defaultsStats)[];
type UserStatType = typeof statNames[number];

const ManualDamageSimulator: NextPage = () => {
  // Route information
  const router = useRouter();
  const entryid = router.query.entryid
    ? (router.query.entryid[0] as string)
    : undefined;

  // Page state
  const [selectedDmg, setSelectedDmg] = useState<number | undefined>(undefined);
  const [showInline, setShowInline] = useState<boolean>(false);

  // Forms setup
  const conf1 = { defaultValues: defaultsStats, mode: "all" as const };
  const attForm = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const defForm = useForm<StatSchema>({ ...conf1, resolver: zodResolver(statSchema) });
  const conf2 = { defaultValues: actSchema.parse({}), mode: "all" as const };
  const actForm = useForm<ActSchema>({ ...conf2, resolver: zodResolver(actSchema) });

  // Watch all the forms simultaneously
  const attValues = attForm.watch();
  const defValues = defForm.watch();
  const actValues = actForm.watch();

  // Extract information from schema to use for showing forms
  const attExp = statNames.map((k) => attValues[k]).reduce((a, b) => a + b, 0) - 120;
  const attLevel = calcLevel(attExp);
  const defExp = statNames.map((k) => defValues[k]).reduce((a, b) => a + b, 0) - 120;
  const defLevel = calcLevel(defExp);

  // Query for fetching previous entries
  const { data, isLoading, refetch } = api.simulator.getDamageSimulations.useQuery(
    undefined,
    { staleTime: Infinity }
  );
  const { data: previous, isLoading: isFetchingSingle } =
    api.simulator.getDamageSimulation.useQuery(
      { id: entryid ? entryid : "" },
      { enabled: !!entryid, staleTime: Infinity }
    );

  // Mutation for creating new entry
  const { mutate: saveEntry, isLoading: isSaving } =
    api.simulator.createDamageSimulation.useMutation({
      onSuccess: () => refetch(),
      onError: (error) => {
        show_toast("Error saving calculation", error.message, "error");
      },
    });

  // Mutation for editing entry
  const { mutate: updateEntry, isLoading: isUpdating } =
    api.simulator.updateDamageSimulation.useMutation({
      onSuccess: () => refetch(),
      onError: (error) => {
        show_toast("Error updating calculation", error.message, "error");
      },
    });

  // Mutation for editing entry
  const { mutate: deleteEntry, isLoading: isDeleting } =
    api.simulator.deleteDamageSimulation.useMutation({
      onSuccess: () => refetch(),
      onError: (error) => {
        show_toast("Error deleting calculation", error.message, "error");
      },
    });

  // Total mutation loading state
  const isMutating = isSaving || isUpdating || isDeleting;

  // Monkey-wrap the damage function
  const getDamage = (
    attacker: BattleUserState,
    defender: BattleUserState,
    actValues: ActSchema
  ) => {
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

  // Handle updating current form values whenever retrieve entry changes
  useEffect(() => {
    if (previous?.state) activateEntry(previous);
  }, [previous]);

  // Handle updating damage whenever form changes
  useEffect(() => {
    const attacker = {
      ...attValues,
      experience: attExp,
    } as unknown as BattleUserState;
    const defender = {
      ...defValues,
      experience: defExp,
    } as unknown as BattleUserState;
    const result = getDamage(attacker, defender, actValues);
    setSelectedDmg(result);
  }, [attValues, defValues, actValues]);

  // Handle simulation
  const onSubmit = attForm.handleSubmit(
    () => saveEntry({ attacker: attValues, defender: defValues, action: actValues }),
    (errors) => console.error(errors)
  );

  // Handle inserting historical entry into form
  const activateEntry = (entry: DamageSimulation) => {
    const { attacker, defender, action } = entry.state as {
      attacker: StatSchema;
      defender: StatSchema;
      action: ActSchema;
    };
    let statKey: keyof typeof attacker;
    let actKey: keyof typeof action;
    for (statKey in attacker) {
      attForm.setValue(statKey, attacker[statKey]);
    }
    for (statKey in defender) {
      defForm.setValue(statKey, defender[statKey]);
    }
    for (actKey in action) {
      actForm.setValue(actKey, action[actKey]);
    }
  };

  return (
    <>
      <ContentBox
        title="Damage Simulator"
        subtitle="Benchmark your build"
        back_href="/manual"
        padding={false}
        topRightContent={
          <Toggle
            value={showInline}
            setShowActive={setShowInline}
            labelActive="Inline"
            labelInactive="Inline"
          />
        }
      >
        <div className="grid grid-cols-2">
          <div>
            <p className="px-3 pt-3 text-lg font-bold">Attacker</p>
            <p className="px-3 italic text-sm font-bold">Equal defence:</p>
            <p className="px-3 italic text-sm">Estimated Exp: {attExp}</p>
            <p className="px-3 pb-1 italic text-sm">Estimated Lvl: {attLevel}</p>
            <hr />
            <UserInput
              id="u1"
              showInline={showInline}
              ignoreContains="Defence"
              selectForm={attForm}
            />
          </div>
          <div>
            <p className="px-3 pt-3 text-lg font-bold">Defender</p>
            <p className="px-3 italic text-sm font-bold">Equal offence:</p>
            <p className="px-3 italic text-sm">Estimated Exp: {defExp}</p>
            <p className="px-3 pb-1 italic text-sm">Estimated Lvl: {defLevel}</p>
            <hr />
            <UserInput
              id="u2"
              showInline={showInline}
              ignoreContains="Offence"
              selectForm={defForm}
            />
          </div>
        </div>
        <div className="mb-3">
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
        <hr />
        <div className="grid grid-cols-2 my-2">
          <p className="text-2xl text-center my-3 font-bold">Damage: {selectedDmg}</p>
          <Button
            id="return"
            label="Save Calculation"
            onClick={onSubmit}
            image={<CloudArrowDownIcon className="mr-1 h-5 w-5" />}
          />
        </div>
      </ContentBox>
      <ContentBox
        title={`Damage Results`}
        subtitle="Compare Calculations (Work in Progress)"
        initialBreak={true}
      >
        <div className="grid grid-cols-3">
          <div className="col-span-2 text-center">[GRAPH HERE]</div>
          <div>
            <p className="text-lg font-bold">History</p>
            {data?.map((entry, i) => {
              return (
                <div key={i} className="flex flex-row items-center">
                  {entry.active === 1 && (
                    <EyeIcon
                      className="h-5 w-5 mr-1 hover:text-orange-500  hover:cursor-pointer"
                      onClick={() => updateEntry({ id: entry.id, active: false })}
                    />
                  )}
                  {entry.active === 0 && (
                    <EyeSlashIcon
                      className="h-5 w-5 mr-1 hover:text-orange-500  hover:cursor-pointer"
                      onClick={() => updateEntry({ id: entry.id, active: true })}
                    />
                  )}
                  <div
                    className=" hover:text-orange-500"
                    onClick={() => activateEntry(entry)}
                  >
                    {entry.createdAt.toLocaleString(undefined, {
                      weekday: undefined,
                      day: "numeric",
                      year: undefined,
                      month: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                      second: "numeric",
                    })}
                  </div>

                  <div className="flex-grow" />
                  <TrashIcon
                    className="mr-1 h-5 w-5 hover:text-orange-500 hover:cursor-pointer"
                    onClick={() => deleteEntry({ id: entry.id })}
                  />
                  <ArrowTopRightOnSquareIcon
                    className="ml-1 h-5 w-5 hover:text-orange-900 hover:cursor-pointer"
                    onClick={() => {
                      const origin =
                        typeof window !== "undefined" && window.location.origin
                          ? window.location.origin
                          : "";
                      const link = `${origin}/manual/damage_calcs/${entry.id}`;
                      navigator.clipboard.writeText(link).then(
                        function () {
                          show_toast("Saved", "Copied to clipboard!", "info");
                        },
                        function () {
                          show_toast("Error", "Could not create link", "error");
                        }
                      );
                    }}
                  />
                </div>
              );
            })}
            <p className="italic text-xs">- Max 20 items</p>
          </div>
        </div>
      </ContentBox>
    </>
  );
};

export default ManualDamageSimulator;

interface UserInputProps {
  id: string;
  showInline: boolean;
  ignoreContains: string;
  selectForm: UseFormReturn<StatSchema>;
}

const UserInput: React.FC<UserInputProps> = (props) => {
  const { id, showInline, selectForm } = props;
  const fields = statNames
    .filter((stat) => !stat.includes(props.ignoreContains))
    .map((stat, i) => {
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
        </div>
      );
    });
  return <div>{fields}</div>;
};
