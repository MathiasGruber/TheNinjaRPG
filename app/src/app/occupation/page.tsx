"use client";
import ContentBox from "@/layout/ContentBox";
import { useRequireInVillage } from "@/utils/UserContext";
import { OccupationMenu } from "@/components/occupation/OccupationMenu";
import Loader from "@/layout/Loader";

export default function Occupation() {
  const { userData, access, updateUser } = useRequireInVillage("/occupation");

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Occupation Menu" />;

  return (
    <ContentBox
      title="Occupation Menu"
      subtitle="Choose your path"
      back_href="/village"
      padding={false}
    >
      <OccupationMenu userData={userData} updateUser={updateUser} />
    </ContentBox>
  );
}
