import { useState, useEffect } from "react";
import SelectField from "@/layout/SelectField";
import ItemWithEffects from "@/layout/ItemWithEffects";
import { useSafePush } from "@/utils/routing";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import type { GenericObject } from "@/layout/ItemWithEffects";
import type { NextPage } from "next";

const Arena: NextPage = () => {
  // Data from database
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [aiId, setAiId] = useState<string | undefined>(undefined);

  // Ensure user is in village
  useRequireInVillage();

  // Router for forwarding
  const router = useSafePush();

  // Queries
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { data: ai } = api.profile.getAi.useQuery(
    { userId: aiId ?? "" },
    { staleTime: Infinity, enabled: !!aiId },
  );

  const sortedAis = aiData
    ?.filter((ai) => !ai.isSummon)
    .sort((a, b) => {
      if (userData?.level) {
        return Math.abs(a.level - userData.level) - Math.abs(b.level - userData.level);
      }
      return 1;
    });

  // Mutation for starting a fight
  const { mutate: attack, isLoading: isAttacking } =
    api.combat.startArenaBattle.useMutation({
      onMutate: () => {
        document.body.style.cursor = "wait";
      },
      onSuccess: async (data) => {
        if (data.success) {
          await refetchUser();
          await router.push("/combat");
        } else {
          show_toast("Error attacking", data.message, "info");
        }
      },
      onError: (error) => {
        show_toast("Error attacking", error.message, "error");
      },
      onSettled: () => {
        document.body.style.cursor = "default";
      },
    });

  // Set initially selected AI
  useEffect(() => {
    if (!aiId) {
      const selectedAI = sortedAis?.[0];
      if (selectedAI) {
        setAiId(selectedAI.userId);
      }
    }
  }, [sortedAis, aiId]);

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox title="Battle Arena" subtitle="Fight Training" back_href="/village">
      The arena is a fairly basic circular and raw battleground, where you can train &
      test your skills as a ninja. Opponents are various creatures or ninja deemed to be
      at your level.
      {!isAttacking && (
        <>
          <h1
            className="cursor-pointer pb-3 pt-5 text-center font-fontasia text-8xl hover:text-orange-800"
            onClick={() => ai && attack({ aiId: ai.userId })}
          >
            Enter The Arena
          </h1>
          <div className="rounded-2xl bg-slate-200 mt-3">
            <SelectField id="ai_id" onChange={(e) => setAiId(e.target.value)}>
              {sortedAis?.map((ai) => (
                <option key={ai.userId} value={ai.userId} defaultValue={aiId}>
                  {ai.username} (lvl {ai.level})
                </option>
              ))}
            </SelectField>
            {ai && (
              <ItemWithEffects
                item={
                  {
                    id: ai.userId,
                    name: ai.username,
                    image: ai.avatar,
                    description: "",
                    rarity: "COMMON",
                    effects: [],
                    href: `/users/${ai.userId}`,
                    attacks: ai.jutsus?.map((jutsu) =>
                      "jutsu" in jutsu ? jutsu.jutsu?.name : "Unknown",
                    ),
                    ...ai,
                  } as GenericObject
                }
                showStatistic="ai"
              />
            )}
          </div>
        </>
      )}
      {isAttacking && (
        <div className="min-h-64">
          <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-95">
            <div className="m-auto text-center text-white">
              <p className="text-5xl">Entering the Arena</p>
              <Loader />
            </div>
          </div>
        </div>
      )}
    </ContentBox>
  );
};

export default Arena;
