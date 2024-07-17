"use client";

import Loader from "@/layout/Loader";
import { ClanProfile } from "@/layout/Clan";
import { useRequireInVillage } from "@/utils/UserContext";

export default function ClanInfo({ params }: { params: { clanid: string } }) {
  // Get ID
  const clanId = params.clanid;

  // Must be in allied village
  const { userData, access } = useRequireInVillage("/clanhall");

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Clan Hall" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw clans" />;

  // Render
  return <ClanProfile back_href="/clanhall" clanId={clanId} />;
}
