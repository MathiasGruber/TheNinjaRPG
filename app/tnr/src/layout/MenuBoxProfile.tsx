import React from "react";
import Link from "next/link";
import { UserStatus } from "@prisma/client";

import MenuBox from "./MenuBox";
import StatusBar from "./StatusBar";
import AvatarImage from "./Avatar";
import { useUserData } from "../utils/UserContext";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/solid";

const MenuBoxProfile: React.FC = () => {
  const { data: userData, battle } = useUserData();
  console.log("TODO: Show battle effects in menu box: ", battle);
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
            userId={userData.userId}
            alt={userData.username}
            size={100}
            hover_effect={true}
            priority
          />
        </Link>

        <StatusBar
          title="HP"
          tooltip="Health"
          color="bg-red-500"
          showText={true}
          status={userData.status}
          current={userData.cur_health}
          total={userData.max_health}
        />
        <StatusBar
          title="CP"
          tooltip="Chakra"
          color="bg-blue-500"
          showText={true}
          status={userData.status}
          current={userData.cur_chakra}
          total={userData.max_chakra}
        />
        <StatusBar
          title="SP"
          tooltip="Stamina"
          color="bg-green-500"
          showText={true}
          status={userData.status}
          current={userData.cur_stamina}
          total={userData.max_stamina}
        />

        <div className="mt-4">
          <hr />
          <p className="mt-2">
            <b>Status:</b>{" "}
            {userData.status === UserStatus.BATTLE ? (
              <Link className="font-bold  " href="/combat">
                BATTLE
              </Link>
            ) : (
              userData.status
            )}
          </p>
        </div>
      </div>
    </MenuBox>
  );
};

export default MenuBoxProfile;
