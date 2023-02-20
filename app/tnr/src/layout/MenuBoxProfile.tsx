import React from "react";
import Link from "next/link";
import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { useUser } from "../utils/UserContext";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/solid";

const MenuBoxProfile: React.FC = () => {
  const { data: userData } = useUser();
  if (!userData) {
    return <div></div>;
  }
  return (
    <MenuBox
      title={"Hi " + userData.username}
      link={
        <Link href="/avatar">
          <WrenchScrewdriverIcon className="h-6 w-6 hover:fill-orange-500" />
        </Link>
      }
    >
      <div className="flex-col items-center justify-center">
        <Link href="/avatar">
          <AvatarImage
            href={userData.avatar}
            alt={userData.username}
            size={100}
            priority
          />
        </Link>

        <StatusBar
          title="HP"
          tooltip="Health"
          color="bg-red-500"
          showText={true}
          current={userData.cur_health}
          total={userData.max_health}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          showText={true}
          current={userData.cur_chakra}
          total={userData.max_chakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          showText={true}
          current={userData.cur_stamina}
          total={userData.max_stamina}
        />
      </div>
    </MenuBox>
  );
};

export default MenuBoxProfile;
