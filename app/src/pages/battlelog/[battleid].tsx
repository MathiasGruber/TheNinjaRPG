import { type NextPage } from "next";
import { useRouter } from "next/router";
import ContentBox from "@/layout/ContentBox";
import CombatHistory from "@/layout/CombatHistory";

const BattleLog: NextPage = () => {
  const router = useRouter();
  const battleId = router.query.battleid as string;

  return (
    <ContentBox
      title="Battle Log"
      subtitle="Logs only saved for 3 hours!"
      back_href="/profile"
      padding={false}
    >
      <CombatHistory battleId={battleId} asc />
    </ContentBox>
  );
};

export default BattleLog;
