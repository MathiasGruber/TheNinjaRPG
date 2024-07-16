import React from "react";
import Image from "next/image";
import Link from "next/link";
import MenuBox from "./MenuBox";
import MenuBoxProfile from "./MenuBoxProfile";
import MenuBoxGame from "./MenuBoxGame";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { Settings } from "lucide-react";
import { useUserData } from "@/utils/UserContext";

const Layout: React.FC<{ children: React.ReactNode }> = (props) => {
  const { data: userData, notifications } = useUserData();
  return (
    <>
      <div className="my-1 hidden md:block">
        <Link href="/">
          <Image
            className="ml-auto mr-auto w-auto h-auto"
            src="/logo.webp"
            width={341}
            height={122}
            alt="logo"
            priority
          />
        </Link>
      </div>
      <div className="container max-w-7xl">
        <div className="grid grid-cols-3 md:grid-cols-5">
          <div className="col-span-1 hidden md:block">
            {userData && (
              <MenuBox
                title={"Hi " + userData.username}
                link={
                  <Link href="/avatar">
                    <Settings className="h-6 w-6 hover:text-orange-500" />
                  </Link>
                }
              >
                <MenuBoxProfile />
              </MenuBox>
            )}
          </div>
          <div className="col-span-3">
            <NavBar notifications={notifications} />
            <div className="mx-1 mt-2 rounded-md bg-orange-100 p-1 md:mx-0">
              <div className="rounded-md bg-yellow-50 p-5">{props.children}</div>
            </div>
          </div>
          <div className="col-span-1 hidden md:block">
            {userData && <MenuBoxGame />}
          </div>
          <Footer />
        </div>
      </div>
    </>
  );
};

export default Layout;
