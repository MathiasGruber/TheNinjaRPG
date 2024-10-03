import React, { useState, useEffect } from "react";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import ContentBox from "@/layout/ContentBox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Accordion from "@/layout/Accordion";
import { FilePlus, Trash, Save } from "lucide-react";
import { SquareArrowUp, SquareArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showMutationToast } from "@/libs/toast";
import { api } from "@/utils/api";
import { getConditionSchema, getActionSchema } from "@/validators/ai";
import { AiActionTypes, AiConditionTypes } from "@/validators/ai";
import { ActionMoveTowardsOpponent } from "@/validators/ai";
import { AvailableTargets } from "@/validators/ai";
import { tagTypes } from "@/libs/combat/types";
import type { AiRuleType, ZodAllAiCondition } from "@/validators/ai";
import type { AiConditionType, AiActionType } from "@/validators/ai";
import type { AiWithRelations } from "@/routers/profile";

interface AiProfileEditProps {
  userData: AiWithRelations;
}

const AiProfileEdit: React.FC<AiProfileEditProps> = (props) => {
  // State
  const availableTabs = ["Default", "Custom"] as const;
  const [rules, setRules] = useState<AiRuleType[]>([]);
  const [activeElement, setActiveElement] = useState<string>("");
  const aiProfileId = props.userData.aiProfileId || "Default";
  const utils = api.useUtils();

  // Data
  const { data: profile } = api.ai.getAiProfile.useQuery(
    { id: aiProfileId },
    { staleTime: Infinity },
  );

  // Mutations
  const { mutate: toggleAiProfile, isPending: isToggling } =
    api.ai.toggleAiProfile.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getAi.invalidate();
        }
      },
    });

  const { mutate: updateAiProfile, isPending: isSaving } =
    api.ai.updateAiProfile.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getAi.invalidate();
        }
      },
    });

  // Insert rules from database into client state
  useEffect(() => {
    if (profile) {
      setRules(profile.rules);
      setActiveElement(`Rule ${profile.rules.length}`);
    }
  }, [profile]);

  // Convenience method for updating rules
  const updateCondition = (
    ruleIndex: number,
    conditionIdx: number,
    field: string,
    value: string,
  ) => {
    setRules((prevRules) =>
      prevRules.map((rule, i) => {
        if (i === ruleIndex) {
          return {
            ...rule,
            conditions: rule.conditions.map((condition, j) => {
              if (j === conditionIdx) {
                return {
                  ...condition,
                  [field]: value,
                };
              }
              return condition;
            }),
          };
        }
        return rule;
      }),
    );
  };

  // Render
  return (
    <ContentBox
      title="AI Profile"
      subtitle={
        aiProfileId === "Default"
          ? "Default AI Profile [Used by Many]"
          : "Custom AI Profile [Only this AI]"
      }
      initialBreak={true}
      padding={false}
      topRightContent={
        isToggling ? (
          <Loader explanation="Toggling AI Profile" />
        ) : (
          <NavTabs
            id="profileSelection"
            current={aiProfileId === "Default" ? "Default" : "Custom"}
            options={availableTabs}
            onChange={() => toggleAiProfile({ aiId: props.userData.userId })}
          />
        )
      }
    >
      {rules.map((rule, i) => {
        const currentActionType = rule.action.type;
        const actionSchema = getActionSchema(currentActionType);
        return (
          <Accordion
            key={`rule-${i}`}
            title={`Rule ${i + 1}`}
            titlePostfix={`: ${rule.conditions.map((c) => c.type).join(", ")} -> ${rule.action.type}`}
            selectedTitle={activeElement}
            onClick={setActiveElement}
            options={
              <>
                <SquareArrowUp
                  className="w-6 h-6 hover:cursor-pointer hover:text-orange-500"
                  onClick={() => {
                    setRules((prevRules) => {
                      if (i < 1) return prevRules;
                      const newRules = [...prevRules];
                      const a = newRules[i] as AiRuleType;
                      const b = newRules[i - 1] as AiRuleType;
                      newRules[i] = b;
                      newRules[i - 1] = a;
                      return newRules;
                    });
                  }}
                />
                <SquareArrowDown
                  className="w-6 h-6 hover:cursor-pointer hover:text-orange-500"
                  onClick={() => {
                    setRules((prevRules) => {
                      if (i + 1 >= prevRules.length) return prevRules;
                      const newRules = [...prevRules];
                      const a = newRules[i] as AiRuleType;
                      const b = newRules[i + 1] as AiRuleType;
                      newRules[i] = b;
                      newRules[i + 1] = a;
                      return newRules;
                    });
                  }}
                />
              </>
            }
          >
            <div className="w-full grid grid-cols-2 gap-2">
              {/* ******************** */}
              {/*     CONDITIONS       */}
              {/* ******************** */}
              <div className="flex flex-col gap-2">
                <Select
                  defaultValue={""}
                  value={""}
                  onValueChange={(e) =>
                    setRules((prevRules) => {
                      const schema = getConditionSchema(e as AiConditionType);
                      const newRules = [...prevRules];
                      newRules?.[i]?.conditions.push(schema.parse({}));
                      return newRules;
                    })
                  }
                >
                  <Label htmlFor="available_conditions">Available Conditions</Label>
                  <SelectTrigger>
                    <SelectValue placeholder={`None`} />
                  </SelectTrigger>
                  <SelectContent id="available_conditions">
                    {AiConditionTypes.map((condition, j) => (
                      <SelectItem key={`available-condition-${j}`} value={condition}>
                        {condition}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="available_conditions">Active Conditions</Label>
                {rule.conditions.map((condition, j) => (
                  <div
                    className="relative w-full rounded-lg border p-2 flex flex-col text-xs bg-popover"
                    key={`added-condition-${j}`}
                  >
                    <b>{condition.type}</b>
                    <i>{condition.description}</i>
                    <Trash
                      className="absolute top-2 right-2 w-6 h-6 hover:cursor-pointer hover:text-orange-500"
                      onClick={() => {
                        setRules((prevRules) =>
                          prevRules.map((rule, k) => {
                            if (k === i) {
                              return {
                                ...rule,
                                conditions: rule.conditions.filter((_, l) => l !== j),
                              };
                            }
                            return rule;
                          }),
                        );
                      }}
                    />
                    {"value" in condition && (
                      <Input
                        id="value"
                        type="input"
                        value={condition.value}
                        onChange={(e) => {
                          updateCondition(i, j, "value", e.target.value);
                        }}
                      />
                    )}
                  </div>
                ))}
                {rule.conditions.length === 0 && (
                  <Badge className="bg-slate-500">None Added</Badge>
                )}
              </div>
              {/* ******************** */}
              {/*       ACTION         */}
              {/* ******************** */}
              <div className="flex flex-col gap-2">
                <Select
                  defaultValue={currentActionType}
                  value={currentActionType}
                  onValueChange={(e) =>
                    setRules((prevRules) =>
                      prevRules.map((rule, k) => {
                        if (k === i) {
                          return {
                            ...rule,
                            action: getActionSchema(e as AiActionType).parse({}),
                          };
                        }
                        return rule;
                      }),
                    )
                  }
                >
                  <Label htmlFor="available_action">Selected Action</Label>
                  <SelectTrigger>
                    <SelectValue placeholder={`None`} />
                  </SelectTrigger>
                  <SelectContent id="available_action">
                    {AiActionTypes.map((action, j) => (
                      <SelectItem key={`available-action-${j}`} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="available_conditions">Action Settings</Label>
                <div className="w-full rounded-lg border p-2 flex flex-col text-xs bg-popover gap-2">
                  <div className="flex flex-col">
                    <b>{currentActionType}</b>
                    <i>{rule.action.description}</i>
                  </div>
                  {"jutsuId" in rule.action && (
                    <Select
                      defaultValue={rule.action.jutsuId}
                      value={rule.action.jutsuId}
                      onValueChange={(e) =>
                        setRules((prevRules) =>
                          prevRules.map((rule, k) => {
                            if (k === i) {
                              return {
                                ...rule,
                                action: actionSchema.parse({
                                  ...rule.action,
                                  jutsuId: e,
                                }),
                              };
                            }
                            return rule;
                          }),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`None`} />
                      </SelectTrigger>
                      <SelectContent id="available_action">
                        {props.userData?.jutsus?.map((userjutsu, j) => (
                          <SelectItem
                            key={`rule-${i}-jutsuid-${j}`}
                            value={userjutsu.jutsuId}
                          >
                            {userjutsu.jutsu.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {"itemId" in rule.action && (
                    <Select
                      defaultValue={rule.action.itemId}
                      value={rule.action.itemId}
                      onValueChange={(e) =>
                        setRules((prevRules) =>
                          prevRules.map((rule, k) => {
                            if (k === i) {
                              return {
                                ...rule,
                                action: actionSchema.parse({
                                  ...rule.action,
                                  itemId: e,
                                }),
                              };
                            }
                            return rule;
                          }),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`None`} />
                      </SelectTrigger>
                      <SelectContent id="available_action">
                        {props.userData?.items?.map((useritem, j) => (
                          <SelectItem
                            key={`rule-${i}-itemid-${j}`}
                            value={useritem.itemId}
                          >
                            {useritem.item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {"target" in rule.action && (
                    <Select
                      defaultValue={rule.action.target}
                      value={rule.action.target}
                      onValueChange={(e) =>
                        setRules((prevRules) =>
                          prevRules.map((rule, k) => {
                            if (k === i) {
                              return {
                                ...rule,
                                action: actionSchema.parse({
                                  ...rule.action,
                                  target: e,
                                }),
                              };
                            }
                            return rule;
                          }),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`None`} />
                      </SelectTrigger>
                      <SelectContent id="available_action">
                        {AvailableTargets?.map((target, j) => (
                          <SelectItem key={`rule-${i}-target-${j}`} value={target}>
                            {target}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {"effect" in rule.action && rule.action.effect && (
                    <Select
                      defaultValue={rule.action.effect}
                      value={rule.action.effect}
                      onValueChange={(e) =>
                        setRules((prevRules) =>
                          prevRules.map((rule, k) => {
                            if (k === i) {
                              return {
                                ...rule,
                                action: actionSchema.parse({
                                  ...rule.action,
                                  effect: e,
                                }),
                              };
                            }
                            return rule;
                          }),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`None`} />
                      </SelectTrigger>
                      <SelectContent id="available_action">
                        {tagTypes?.map((effect, j) => (
                          <SelectItem key={`rule-${i}-effect-${j}`} value={effect}>
                            {effect}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          </Accordion>
        );
      })}

      <div className="p-3 flex flex-row items-center gap-2">
        {rules.length === 0 && <p>No rules added to this AI profile yet</p>}
        <div className="grow"></div>
        <Button
          onClick={() => {
            setRules((prevRules) => [
              ...prevRules,
              {
                conditions: [] as ZodAllAiCondition[],
                action: ActionMoveTowardsOpponent.parse({}),
                priority: 0,
              } as AiRuleType,
            ]);
            setActiveElement(`Rule ${rules.length + 1}`);
          }}
        >
          <FilePlus className="h-6 w-6 mr-2" /> Add Rule
        </Button>
        {rules.length > 0 && !isSaving && (
          <Button
            onClick={() => {
              updateAiProfile({ id: aiProfileId, rules: rules });
            }}
          >
            <Save className="h-6 w-6 mr-2" /> Save Profile
          </Button>
        )}
        {isSaving && <Loader />}
      </div>
    </ContentBox>
  );
};

export default AiProfileEdit;
