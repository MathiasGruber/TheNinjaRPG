"use client";

import {
  IMG_BUILDING_PET_SANCTUARY,
  PET_SANCTUARY_LORE,
  PET_SANCTUARY_NAME,
} from "@/drizzle/constants";
import ContentBox from "@/layout/ContentBox";
import Image from "@/layout/Image";
import Loader from "@/layout/Loader";
import { PetAcquisition } from "@/layout/PetAcquisition";
import { useRequireInVillage } from "@/utils/UserContext";

export default function PetSanctuaryPage() {
  const { userData, access } = useRequireInVillage("/pets");
  if (!userData) return <Loader explanation="Loading your character..." />;
  if (!access) return <Loader explanation={`Accessing ${PET_SANCTUARY_NAME}...`} />;

  return (
    <>
      <ContentBox
        title={PET_SANCTUARY_NAME}
        subtitle="Form a bond on Wake Island"
        padding={false}
        defaultBackHref="/village"
      >
        <Image
          src={IMG_BUILDING_PET_SANCTUARY}
          alt="The Bondkeeper Sanctuary beneath Wake Island's cedars"
          width={1536}
          height={572}
          className="w-full"
          priority
        />
        <p className="p-4 leading-relaxed">{PET_SANCTUARY_LORE}</p>
      </ContentBox>
      <PetAcquisition />
    </>
  );
}
