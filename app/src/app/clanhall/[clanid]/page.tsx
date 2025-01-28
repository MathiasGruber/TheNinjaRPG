"use client";
import { use } from "react";

import Loader from "@/layout/Loader";
import { ClanProfile } from "@/layout/Clan";
import { useRequireInVillage } from "@/utils/UserContext";

export default function ClanInfo(props: { params: Promise<{ clanid: string }> }) {
  const params = use(props.params);
  // Get ID
  const clanId = params.clanid;

  // Must be in allied village
  const { userData, access } = useRequireInVillage("/clanhall");

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Clan Hall" />;

  // Render
  return <ClanProfile back_href="/clanhall" clanId={clanId} />;
}
