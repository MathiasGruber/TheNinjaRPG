import { nanoid } from "nanoid";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useUserData } from "@/utils/UserContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { CloudArrowDownIcon, UsersIcon } from "@heroicons/react/24/solid";
import { ArrowTopRightOnSquareIcon, TrashIcon } from "@heroicons/react/24/solid";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";
import Toggle from "../../../layout/Toggle";
import ContentBox from "../../../layout/ContentBox";
import Button from "../../../layout/Button";
import InputField from "../../../layout/InputField";
import SelectField from "../../../layout/SelectField";
import { damageUser } from "../../../libs/combat/tags";
import { calcLevel, calcHP } from "../../../libs/profile";
import { StatType, GeneralType } from "../../../libs/combat/constants";
import { statSchema, actSchema } from "../../../libs/combat/types";
import { api } from "@/utils/api";
import { show_toast } from "../../../libs/toast";
import { Chart as ChartJS } from "chart.js/auto";
import type { DamageSimulation } from "@/drizzle/schema";
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

const ManualDamageSimulator: NextPage = () => {
  // Fetch user data
  const { data: userData } = useUserData();

  // Colors for chart
  const colors = [
    "#1f77b4",
    "#aec7e8",
    "#ff7f0e",
    "#ffbb78",
    "#2ca02c",
    "#98df8a",
    "#d62728",
    "#ff9896",
    "#9467bd",
    "#c5b0d5",
    "#8c564b",
    "#c49c94",
    "#e377c2",
    "#f7b6d2",
    "#7f7f7f",
    "#c7c7c7",
    "#bcbd22",
    "#dbdb8d",
    "#17becf",
    "#9edae5",
  ];

  // Route information
  const router = useRouter();
  const damageSimulationId = router.query.damageSimulationId
    ? (router.query.damageSimulationId[0] as string)
    : undefined;

  // Chart ref
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Page state
  const [selectedDmg, setSelectedDmg] = useState<number | undefined>(undefined);
  const [showInline, setShowInline] = useState<boolean>(false);
  const [showAll, setShowAll] = useState<boolean>(true);

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

  // Query for fetching previous entries
  const { data, refetch } = api.simulator.getDamageSimulations.useQuery(undefined, {
    enabled: !!userData,
    staleTime: Infinity,
  });
  const { data: previous } = api.simulator.getDamageSimulation.useQuery(
    { id: damageSimulationId ? damageSimulationId : "" },
    { enabled: !!damageSimulationId, staleTime: Infinity },
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
  // TODO: USE THIS FOR UX
  // const isMutating = isSaving || isUpdating || isDeleting;

  // Calculate experience from stats
  const calcExperience = (values: StatSchema) => {
    return statNames.map((k) => values[k]).reduce((a, b) => a + b, 0) - 120;
  };

  // Extract information from schema to use for showing forms
  const attExp = calcExperience(attValues);
  const attLevel = calcLevel(attExp);
  const attHp = calcHP(attLevel);
  const defExp = calcExperience(defValues);
  const defLevel = calcLevel(defExp);
  const defHp = calcHP(defLevel);

  // Monkey-wrap the damage function
  const getDamage = (
    attValues: StatSchema,
    defValues: StatSchema,
    actValues: ActSchema,
  ) => {
    const attacker = {
      ...attValues,
      experience: calcExperience(attValues),
    } as unknown as BattleUserState;
    const defender = {
      ...defValues,
      experience: calcExperience(defValues),
    } as unknown as BattleUserState;
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
    damageUser(effect, attacker, defender, consequences, 1);
    const result = consequences.get(effect.id)?.damage as number;
    return parseFloat(result.toFixed(2));
  };

  // Update the chart
  useEffect(() => {
    const ctx = chartRef?.current?.getContext("2d");
    if (ctx && data && data?.length > 0) {
      const myChart = new ChartJS(ctx, {
        type: "scatter",
        options: {
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: { display: true, text: "Previous Calculation" },
            },
            y: {
              type: "linear",
              ticks: { stepSize: 1 },
              title: { display: true, text: "Damage" },
            },
          },
        },
        data: {
          datasets: data
            .map((entry, i) => {
              return { ...entry, colorId: i };
            })
            .filter((e) => e.active === 1)
            .map((entry, i) => {
              const { attacker, defender, action } = entry.state as {
                attacker: StatSchema;
                defender: StatSchema;
                action: ActSchema;
              };
              const stateDmg = getDamage(attacker, defender, action);
              return {
                data: [{ x: i + 1, y: stateDmg }],
                backgroundColor: colors[entry.colorId % colors.length],
                borderColor: colors[entry.colorId % colors.length],
              };
            }),
        },
      });
      return () => {
        myChart.destroy();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Handle updating current form values whenever retrieve entry changes
  useEffect(() => {
    if (previous?.state) activateEntry(previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previous]);

  // Handle updating damage whenever form changes
  useEffect(() => {
    setSelectedDmg(getDamage(attValues, defValues, actValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attValues, defValues, actValues]);

  // Handle simulation
  const onSubmit = attForm.handleSubmit(
    () => saveEntry({ attacker: attValues, defender: defValues, action: actValues }),
    (errors) => console.error(errors),
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

  // Handle setting user data into form
  const setUserData = (form: UseFormReturn<StatSchema>) => {
    statNames.forEach((stat) => {
      form.setValue(stat, userData?.[stat] ?? 0);
    });
  };

  return (
    <>
      <ContentBox
        title="Damage Simulator"
        subtitle="Benchmark your build"
        back_href="/manual"
        padding={false}
        topRightContent={
          <div className="flex flex-row">
            <Toggle
              value={showInline}
              setShowActive={setShowInline}
              labelActive="Inline"
              labelInactive="Inline"
            />
            <Toggle
              value={showAll}
              setShowActive={setShowAll}
              labelActive="Focus"
              labelInactive="Focus"
            />
          </div>
        }
      >
        <div className="grid grid-cols-2">
          <div>
            <div className="flex flex-row items-center">
              <p className="px-3 pt-3 text-lg font-bold">Attacker</p>
              <div className="grow"></div>
              <UsersIcon
                className="h-5 w-5 mr-3 mt-3"
                onClick={() => setUserData(attForm)}
              />
            </div>
            <p className="px-3 italic text-sm">Experience: {attExp}</p>
            <p className="px-3 pb-1 italic text-sm">Level: {attLevel}</p>
            <p className="px-3 pb-1 italic text-sm">Health: {attHp}</p>
            <hr />
            <UserInput
              id="u1"
              showInline={showInline}
              ignoreContains={showAll ? "Defence" : "None"}
              selectForm={attForm}
            />
          </div>
          <div>
            <div className="flex flex-row items-center">
              <p className="px-3 pt-3 text-lg font-bold">Defender</p>
              <div className="grow"></div>
              <UsersIcon
                className="h-5 w-5 mr-3 mt-3"
                onClick={() => setUserData(defForm)}
              />
            </div>
            <p className="px-3 italic text-sm">Experience: {defExp}</p>
            <p className="px-3 pb-1 italic text-sm">Level: {defLevel}</p>
            <p className="px-3 pb-1 italic text-sm">Health: {defHp}</p>
            <hr />
            <UserInput
              id="u2"
              showInline={showInline}
              ignoreContains={showAll ? "Offence" : "None"}
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
          {selectedDmg && (
            <div>
              <p className="text-2xl text-center mt-3 font-bold">
                Damage: {selectedDmg}
              </p>
              <p className="text-base text-center mb-3 italic">
                [{((100 * selectedDmg) / defHp)?.toFixed(1)}% of Defender HP]
              </p>
            </div>
          )}

          <Button
            id="return"
            label="Save Calculation"
            onClick={onSubmit}
            image={<CloudArrowDownIcon className="mr-1 h-5 w-5" />}
          />
        </div>
      </ContentBox>
      {userData && (
        <ContentBox
          title={`Damage Results`}
          subtitle="Compare & recall calculations"
          initialBreak={true}
        >
          <div className="grid grid-cols-3">
            <div className="col-span-2 text-center mr-5">
              <canvas ref={chartRef} id="overview"></canvas>
            </div>
            <div>
              <div className="text-lg font-bold flex flex-row">
                <p>History</p>
                <div className="grow"></div>
                <EyeIcon
                  className={`h-5 w-5 mr-1 hover:text-orange-500 hover:cursor-pointer`}
                  onClick={() => updateEntry({ active: true })}
                />
                <EyeSlashIcon
                  className={`h-5 w-5 mr-1 hover:text-orange-500 hover:cursor-pointer`}
                  onClick={() => updateEntry({ active: false })}
                />
              </div>
              <hr />
              <p className="my-1"></p>
              {data?.map((entry, i) => {
                return (
                  <div key={i} className="flex flex-row items-center">
                    {entry.active === 1 && (
                      <EyeIcon
                        className={`h-5 w-5 mr-1 hover:cursor-pointer`}
                        style={{ color: colors[i % colors.length] }}
                        onClick={() => updateEntry({ id: entry.id, active: false })}
                      />
                    )}
                    {entry.active === 0 && (
                      <EyeSlashIcon
                        className="h-5 w-5 mr-1 hover:text-orange-500 hover:cursor-pointer"
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
                            show_toast("Simulator", "Could not create link", "error");
                          },
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
      )}
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
