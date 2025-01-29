import { useState } from "react";
import { Button } from "./button";
import { Card } from "./card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { toast } from "./use-toast";
import { api } from "~/app/_trpc/client";
import type { SkillTreeTier } from "~/validators/skillTree";

const TIER_NAMES = {
  "1": "Tier 1 (5% Boost)",
  "2": "Tier 2 (10% Boost)",
  "3": "Tier 3 (15% Boost)",
} as const;

const SKILL_TYPES = {
  // Combat skills
  NINJUTSU_DAMAGE: "Ninjutsu Damage",
  TAIJUTSU_DAMAGE: "Taijutsu Damage",
  BUKIJUTSU_DAMAGE: "Bukijutsu Damage",
  GENJUTSU_DAMAGE: "Genjutsu Damage",

  // Defense and utility
  ALL_DEFENSE: "All Defense",
  REGEN: "Regen",
  ELEMENTAL_DAMAGE: "Elemental Damage",
  ELEMENTAL_DEFENSE: "Elemental Defense",
  MOVEMENT_RANGE: "Movement Range",
  HEALING: "Healing",
  ELEMENT_SLOT: "Element Slot",

  // Special abilities
  STUN_RESISTANCE: "Stun Resistance",
  ABSORB: "Absorb",
  REFLECT: "Reflect",
  LIFE_STEAL: "Life Steal",
  SEAL_PREVENT: "Seal Prevent",
};

const SPECIAL_SKILLS = {
  // Special abilities with higher costs and boosts
  STUN_RESISTANCE: { boost: 30, cost: 5 },
  ABSORB: { boost: 10, cost: 5 },
  REFLECT: { boost: 10, cost: 5 },
  LIFE_STEAL: { boost: 10, cost: 5 },
  SEAL_PREVENT: { boost: 15, cost: 5 },
} as const;

export function SkillTree() {
  const [selectedTab, setSelectedTab] = useState<"1" | "2" | "3">("1");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: skillTree, refetch } = api.skillTree.get.useQuery();
  const { mutate: updateSkillTree } = api.skillTree.update.useMutation({
    onSuccess: () => {
      void refetch();
      toast({
        title: "Success",
        description: "Skill tree updated successfully",
      });
      setIsLoading(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });
  const { mutate: resetSkillTree } = api.skillTree.reset.useMutation({
    onSuccess: () => {
      void refetch();
      toast({
        title: "Success",
        description: "Skill tree reset successfully",
      });
      setIsLoading(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const handleSkillSelect = (skill: SkillTreeTier) => {
    if (isLoading) return;
    setIsLoading(true);
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some(
      (s) => s.type === skill.type && s.tier === skill.tier
    );

    if (isSelected) {
      // Check if removing this skill would break tier requirements
      const wouldBreakTier = selectedSkills.some(
        (s) => s.tier > skill.tier && s.type === skill.type && !s.isSpecial
      );
      if (wouldBreakTier) {
        toast({
          title: "Error",
          description: "Cannot remove this skill while higher tier skills depend on it",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Check if removing this skill would break special skill requirements
      const hasSpecialSkills = selectedSkills.some((s) => s.isSpecial);
      if (hasSpecialSkills && selectedSkills.length - 1 < 6) {
        toast({
          title: "Error",
          description: "Cannot remove this skill while special skills are active",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

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
    if (isLoading) return;
    setIsLoading(true);
    if (skillTree?.selectedSkills.length === 0) {
      toast({
        title: "Error",
        description: "No skills to reset",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    setIsConfirmOpen(true);
  };

  const renderSkillButton = (type: keyof typeof SKILL_TYPES, tier: number) => {
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some(
      (s) => s.type === type && s.tier === tier
    );
    const boost = tier === 1 ? 5 : tier === 2 ? 10 : 15;

    // Check if this tier is available (has lower tier skill)
    const hasLowerTier = tier === 1 || selectedSkills.some(
      (s) => s.type === type && s.tier === tier - 1
    );

    // Calculate remaining points
    const usedPoints = selectedSkills.reduce((acc, skill) => acc + skill.cost, 0);
    const availablePoints = skillTree?.points ?? 0;
    const canAfford = availablePoints >= tier;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              key={`${type}-${tier}`}
              variant={isSelected ? "default" : "outline"}
              className="w-full"
              disabled={(!hasLowerTier && tier > 1) || (!canAfford && !isSelected) || isLoading}
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
              {SKILL_TYPES[type]} (+{boost}%) - {tier} Point{tier > 1 ? "s" : ""}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasLowerTier && tier > 1 ? "Must unlock lower tier first" : !canAfford && !isSelected ? "Not enough points" : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderSpecialSkillButton = (type: keyof typeof SPECIAL_SKILLS) => {
    const selectedSkills = skillTree?.selectedSkills ?? [];
    const isSelected = selectedSkills.some((s) => s.type === type);
    const { boost, cost } = SPECIAL_SKILLS[type];

    // Calculate remaining points
    const usedPoints = selectedSkills.reduce((acc, skill) => acc + skill.cost, 0);
    const availablePoints = skillTree?.points ?? 0;
    const canAfford = availablePoints >= cost;

    // Check if user has enough points to unlock special skills
    const hasEnoughPoints = selectedSkills.length >= 6;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              key={type}
              variant={isSelected ? "default" : "outline"}
              className="w-full"
              disabled={(!canAfford && !isSelected) || !hasEnoughPoints || isLoading}
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
          </TooltipTrigger>
          <TooltipContent>
            {!hasEnoughPoints ? "Must have at least 6 skills to unlock special skills" : !canAfford && !isSelected ? "Not enough points" : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <>
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Skill Tree</h2>
          <div className="space-x-2">
            <span>
              Points: {skillTree?.points ?? 0}/20
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleReset} variant="destructive" disabled={isLoading || (skillTree?.selectedSkills.length ?? 0) === 0}>Reset</Button>
                </TooltipTrigger>
                <TooltipContent>
                  {(skillTree?.selectedSkills.length ?? 0) === 0 ? "No skills to reset" : skillTree?.resetCount === 0 ? "First reset is free" : "Costs 30 reputation"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Skill Tree</DialogTitle>
            <DialogDescription>
              {skillTree?.resetCount === 0
                ? "Are you sure you want to reset your skill tree? First reset is free."
                : "Are you sure you want to reset your skill tree? This will cost 30 reputation."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsConfirmOpen(false);
              setIsLoading(false);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => {
              resetSkillTree();
              setIsConfirmOpen(false);
            }}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
