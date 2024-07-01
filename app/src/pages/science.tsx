import Loader from "@/layout/Loader";
import { RollBloodline, CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import type { NextPage } from "next";

const Hospital: NextPage = () => {
  // Settings
  const { userData, access } = useRequireInVillage("/science");

  // Get data from DB
  const {
    data: prevRoll,
    isPending: isPendingBlood,
    refetch: refetchBloodline,
  } = api.bloodline.getRolls.useQuery(
    {
      currentBloodlineId: userData?.bloodlineId,
    },
    { staleTime: Infinity, enabled: userData !== undefined },
  );

  // Heal finish time
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Hospital" />;

  // Derived calculations
  const hasRolled = !!prevRoll;
  const bloodlineId = userData?.bloodlineId;

  return (
    <div>
      {isPendingBlood && <Loader explanation="Loading bloodlines" />}
      {!isPendingBlood && !hasRolled && <RollBloodline refetch={refetchBloodline} />}
      {!isPendingBlood && bloodlineId && <CurrentBloodline bloodlineId={bloodlineId} />}
      {!isPendingBlood && hasRolled && !userData?.bloodlineId && <PurchaseBloodline />}
    </div>
  );
};

export default Hospital;
