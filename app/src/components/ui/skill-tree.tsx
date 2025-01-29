import { useState } from "react";
import { Button } from "./button";
import { Card } from "./card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { toast } from "./use-toast";
import { api } from "~/utils/api";
import type { SkillTreeTier } from "~/validators/skillTree";

const TIER_NAMES = {
  1: "Tier 1 (5% Boost)",
  2: "Tier 2 (10% Boost)",
  3: "Tier 3 (15% Boost)",
};

const SKILL_TYPES = {
  NINJUTSU_DAMAGE: "Ninjutsu Damage",
  TAIJUTSU_DAMAGE: "Taijutsu Damage",
  BUKIJUTSU_DAMAGE: "Bukijutsu Damage",
  GENJUTSU_DAMAGE: "Genjutsu Damage",
  ALL_DEFENSE: "All Defense",
  REGEN: "Regen",
  ELEMENTAL_DAMAGE: "Elemental Damage",
  ELEMENTAL_DEFENSE: "Elemental Defense",
  MOVEMENT_RANGE: "Movement Range",
  HEALING: "Healing",
  ELEMENT_SLOT: "Element Slot",
  STUN_RESISTANCE: "Stun Resistance",
  ABSORB: "Absorb",
  REFLECT: "Reflect",
  LIFE_STEAL: "Life Steal",
  SEAL_PREVENT: "Seal Prevent",
};

const SPECIAL_SKILLS = {
  STUN_RESISTANCE: { boost: 30, cost: 5 },
  ABSORB: { boost: 10, cost: 5 },
  REFLECT: { boost: 10, cost: 5 },
  LIFE_STEAL: { boost: 10, cost: 5 },
  SEAL_PREVENT: { boost: 15, cost: 5 },
};

export function SkillTree() {
  const [selectedTab, setSelectedTab] = useState("1");
  const { data: skillTree, refetch } = api.skillTree.get.useQuery();
  const { mutate: updateSkillTree } = api.skillTree.update.useMutation({
    onSuccess: () => {
      void refetch();
      toast({
        title: "Success",
        description: "Skill tree updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const { mutate: resetSkillTree } = api.skillTree.reset.useMutation({
    onSuccess: () => {
      void refetch();
      toast({
        title: "Success",
        description: "Skill tree reset successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSkillSelect = (skill: SkillTreeTier) => {
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some(
      (s) => s.type === skill.type && s.tier === skill.tier
    );

    if (isSelected) {
      // Remove skill
      updateSkillTree({
        selectedSkills: selectedSkills.filter(
          (s) => s.type !== skill.type || s.tier !== skill.tier
        ),
      });
    } else {
      // Add skill
      updateSkillTree({
        selectedSkills: [...selectedSkills, skill],
      });
    }
  };

  const handleReset = () => {
    if (
      window.confirm(
        skillTree?.resetCount === 0
          ? "Are you sure you want to reset your skill tree? First reset is free."
          : "Are you sure you want to reset your skill tree? This will cost 30 reputation."
      )
    ) {
      resetSkillTree();
    }
  };

  const renderSkillButton = (type: keyof typeof SKILL_TYPES, tier: number) => {
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some(
      (s) => s.type === type && s.tier === tier
    );
    const boost = tier === 1 ? 5 : tier === 2 ? 10 : 15;

    return (
      <Button
        key={`${type}-${tier}`}
        variant={isSelected ? "default" : "outline"}
        className="w-full"
        onClick={() =>
          handleSkillSelect({
            type,
            tier,
            boost,
            name: SKILL_TYPES[type],
            cost: tier,
            isSpecial: false,
          })
        }
      >
        {SKILL_TYPES[type]} (+{boost}%)
      </Button>
    );
  };

  const renderSpecialSkillButton = (type: keyof typeof SPECIAL_SKILLS) => {
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some((s) => s.type === type);
    const { boost, cost } = SPECIAL_SKILLS[type];

    return (
      <Button
        key={type}
        variant={isSelected ? "default" : "outline"}
        className="w-full"
        onClick={() =>
          handleSkillSelect({
            type,
            tier: 3,
            boost,
            name: SKILL_TYPES[type],
            cost,
            isSpecial: true,
          })
        }
      >
        {SKILL_TYPES[type]} (+{boost}%) - {cost} Points
      </Button>
    );
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Skill Tree</h2>
        <div className="space-x-2">
          <span>
            Points: {skillTree?.points ?? 0}/
            {skillTree?.selectedSkills ? skillTree.selectedSkills.length : 0}
          </span>
          <Button onClick={handleReset}>Reset</Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          {Object.entries(TIER_NAMES).map(([tier, name]) => (
            <TabsTrigger key={tier} value={tier}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.keys(TIER_NAMES).map((tier) => (
          <TabsContent key={tier} value={tier} className="space-y-2">
            {tier === "3" ? (
              <>
                {Object.keys(SPECIAL_SKILLS).map((type) =>
                  renderSpecialSkillButton(type as keyof typeof SPECIAL_SKILLS)
                )}
                <hr className="my-4" />
              </>
            ) : null}
            {Object.keys(SKILL_TYPES)
              .filter((type) => type !== "ELEMENT_SLOT" || tier === "2")
              .filter(
                (type) =>
                  !Object.keys(SPECIAL_SKILLS).includes(type) ||
                  tier !== "3"
              )
              .map((type) =>
                renderSkillButton(type as keyof typeof SKILL_TYPES, Number(tier))
              )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
