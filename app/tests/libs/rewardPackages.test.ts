import { describe, expect, it } from "bun:test";
import { collapseRewards } from "@/libs/rewards";
import { masteryQuestTemplates } from "@/libs/masteryQuests";
import { QuestValidator, SimpleObjective } from "@/validators/objectives";
import { villageMissionContentError } from "@/validators/villageMission";
import { getNewTrackers, getReward, postProcessRewards } from "@/libs/quest";
import { buildRewardChoiceCards, getUnavailableRewardCards, requiredRewardPicks, rewardFromChoiceCards, validateRewardPicks, verifyRewardChoiceForSave } from "@/libs/rewardChoice";
import { validateQuestRewardPackages } from "@/server/api/routers/rewardPackages";
import { QuestReward, RewardNodeValidator, RewardPackageValidator } from "@/validators/rewardPackages";
import { ObjectiveReward } from "@/validators/rewards";
import type { QuestContentType } from "@/validators/objectives";

const packageReward = (id: string, data: object) => ({ id, packageId: `source-${id}`, name: `Package ${id}`, description: "", rewards: ObjectiveReward.parse(data) });
const ownership = { jutsuIds: new Set<string>(), bloodlineIds: new Set<string>(), badgeIds: new Set<string>(), sageModeIds: new Set<string>(), hasSageMode: false };

describe("reward packages", () => {
  const makeUser = (content: Record<string, unknown>, questType = "mission") =>
    ({
      userId: "u1",
      level: 50,
      rank: "JONIN",
      role: "USER",
      villageId: "v1",
      isOutlaw: false,
      bloodlineId: null,
      sector: 1,
      village: { id: "v1", sector: 1 },
      activeWars: [],
      completedQuests: [],
      dailyMissions: 0,
      senseiId: null,
      questData: [],
      userQuests: [
        {
          id: "uq-1",
          questId: "q1",
          completed: 0,
          previousAttempts: 0,
          previousCompletes: 0,
          quest: {
            id: "q1",
            name: "Quest",
            questType,
            hidden: false,
            consecutiveObjectives: false,
            maxAttempts: 10,
            maxCompletes: 10,
            content: {
              objectives: [],
              sceneBackground: "",
              sceneCharacters: [],
              ...content,
            },
          },
        },
      ],
    }) as unknown as Parameters<typeof getNewTrackers>[0];


  it("grants combined snapshots and leaves the source untouched", () => {
    const reward = QuestReward.parse({reward_money: 10, reward_packages: [packageReward("a",{reward_money: 100}), packageReward("b",{reward_money: 200, reward_items:[{ids:["item"],number:100,quantity:3}]})]});
    const before = structuredClone(reward);
    const result = getReward(makeUser({reward}), "q1");
    expect(result.rewards.reward_money).toBe(310);
    expect(result.rewards.reward_items).toEqual(["item","item","item"]);
    expect(reward).toEqual(before);
  });
  it("offers each package as one frozen bundle with its item chance", () => {
    const reward = QuestReward.parse({reward_packages:[packageReward("a",{reward_money:100,reward_exp:50,reward_items:[{ids:["item"],number:0,quantity:4}]}), packageReward("b",{reward_money:200})]});
    const result = getReward(makeUser({reward,rewardMode:"choose"}),"q1");
    expect(result.rewards.reward_money).toBe(0);
    expect(result.rewardChoice?.cards.length).toBe(2);
    const cards = result.rewardChoice!.cards;
    expect(cards[0]?.field).toBe("reward_package");
    const selected=validateRewardPicks(result.rewardChoice!,[cards[0]!.id]);
    expect(selected.success).toBe(true);
    const payout=postProcessRewards(rewardFromChoiceCards([cards[0]!]));
    expect(payout.reward_money).toBe(100);
    expect(payout.reward_exp).toBe(50);
    expect(payout.reward_items).toEqual([]);
    expect(verifyRewardChoiceForSave({reward,rewardMode:"choose",rewardPickCount:1}).check).toBe(true);
  });
  it("keeps a partially owned bundle usable, but blocks an entirely owned one", () => {
    const owner={...ownership,jutsuIds:new Set(["known"])};
    const cards=buildRewardChoiceCards(QuestReward.parse({reward_packages:[packageReward("owned",{reward_jutsus:["known"]}),packageReward("mixed",{reward_jutsus:["known"],reward_money:100})]}));
    const blocked=getUnavailableRewardCards(cards,owner);
    expect(blocked.has(cards[0]!.id)).toBe(true);
    expect(blocked.has(cards[1]!.id)).toBe(false);
    expect(requiredRewardPicks({cards,pickCount:2},blocked)).toBe(1);
  });
  it("restricts sage mode selection across direct cards and bundles", () => {
    const cards=buildRewardChoiceCards(QuestReward.parse({reward_sage_modes:["sage"],reward_packages:[packageReward("a",{reward_sage_modes:["other"],reward_money:50})],reward_money:10}));
    const picks=validateRewardPicks({id:"choice",cards,pickCount:2},cards.filter((card)=>card.field!=="reward_money").map((card)=>card.id));
    expect(picks.success).toBe(false);
  });
  it("allows approved reputation snapshots and rejects amount tampering", () => {
    const pack=packageReward("a",{reward_reputation:5});
    const content={reward:QuestReward.parse({reward_packages:[pack]}),objectives:[],sceneBackground:"",sceneCharacters:[]} satisfies QuestContentType;
    const source=[{id:pack.packageId,name:pack.name,description:"",rewards:pack.rewards,createdAt:new Date(),updatedAt:new Date()}];
    const empty={...content,reward:QuestReward.parse({})};
    expect(validateQuestRewardPackages(content,empty,source,"HEAD_CONTENT")).toBeNull();
    const tampered=structuredClone(content); tampered.reward.reward_packages![0]!.rewards.reward_reputation=500;
    expect(validateQuestRewardPackages(tampered,empty,source,"HEAD_CONTENT")).toContain("approved snapshot");
    source[0]!.rewards=ObjectiveReward.parse({reward_reputation:9});
    expect(validateQuestRewardPackages(content,content,source,"HEAD_CONTENT")).toBeNull();
  });
  it("omits scalar bundles reduced to zero at completion", () => {
    const user=makeUser({reward:QuestReward.parse({reward_packages:[packageReward("a",{reward_money:1}),packageReward("b",{reward_money:2})]}),rewardMode:"choose"});
    (user as unknown as {dailyMissions:number}).dailyMissions=1000;
    const result=getReward(user,"q1");
    expect(result.rewardChoice).toBeNull();
    const empty={id:"empty",field:"reward_package" as const,amount:1,rewards:ObjectiveReward.parse({})};
    expect(getUnavailableRewardCards([empty],ownership).has("empty")).toBe(true);
  });
  it("grants objective packages alongside completion rewards", () => {
    const objective=SimpleObjective.parse({id:"objective",task:"user_level",value:1,reward_packages:[packageReward("objective",{reward_money:40,reward_items:[{ids:["item"],number:100,quantity:2}]})]});
    const result=getReward(makeUser({reward:ObjectiveReward.parse({reward_money:20}),objectives:[objective]}),"q1");
    expect(result.rewards.reward_money).toBe(60);
    expect(result.rewards.reward_items).toEqual(["item","item"]);
  });
  it("validates custom nodes against existing reward fields", () => {
    expect(RewardNodeValidator.safeParse({name:"Currency",fields:["reward_money","reward_reputation"]}).success).toBe(true);
    expect(RewardNodeValidator.safeParse({name:"Invalid",fields:["arbitrary"]}).success).toBe(false);
    expect(RewardNodeValidator.safeParse({name:"Duplicates",fields:["reward_money","reward_money"]}).success).toBe(false);
  });
});

describe("package validation and merging", () => {
  it("rejects empty packages and incomplete mastery pairs", () => {
    expect(RewardPackageValidator.safeParse({name:"Empty",rewards:{}}).success).toBe(false);
    const template=masteryQuestTemplates()[0]!;
    for (const rewards of [{reward_mastery_rank:"ADEPT"},{reward_mastery_stat:"ninjutsuMastery"}]) {
      expect(QuestValidator.safeParse({...template,content:{...template.content,reward:ObjectiveReward.parse(rewards)}}).success).toBe(false);
    }
  });
  it("keeps the highest current rank when packages are combined", () => {
    expect(collapseRewards([ObjectiveReward.parse({reward_rank:"JONIN"}),ObjectiveReward.parse({reward_rank:"ELDER"})]).reward_rank).toBe("ELDER");
    expect(collapseRewards([ObjectiveReward.parse({reward_rank:"ELDER"}),ObjectiveReward.parse({reward_rank:"GENIN"})]).reward_rank).toBe("ELDER");
  });
  it("resolves Village Mission token packages and rejects unsupported bundle contents", () => {
    const content={reward:QuestReward.parse({reward_packages:[packageReward("tokens",{reward_tokens:50})]}), objectives:[{id:"pvp",task:"pvp_kills",description:"Win",value:1}]};
    expect(villageMissionContentError(content,false)).toBeNull();
    content.reward.reward_packages![0]!.rewards.reward_money=1;
    expect(villageMissionContentError(content,false)).toContain("only contain village tokens");
  });
});
