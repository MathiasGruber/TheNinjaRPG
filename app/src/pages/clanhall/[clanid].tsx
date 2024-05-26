import Loader from "@/layout/Loader";
import { useRouter } from "next/router";
import { ClanProfile } from "@/layout/Clan";
import { useRequireInVillage } from "@/utils/village";
import type { NextPage } from "next";

const ClanInfo: NextPage = () => {
  // Get ID
  const router = useRouter();
  const clanId = router.query.clanid as string;

  // Must be in allied village
  const { userData, access } = useRequireInVillage("/clanhall");

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Clan Hall" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw clans" />;

  // Render
  return <ClanProfile back_href="/clanhall" clanId={clanId} />;
};

export default ClanInfo;
