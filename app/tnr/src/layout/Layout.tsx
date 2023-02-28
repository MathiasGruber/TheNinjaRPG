import React from "react";
import Header from "./Header";
import Link from "next/link";
import MenuBox from "./MenuBox";
import MenuBoxProfile from "./MenuBoxProfile";
import MenuBoxGame from "./MenuBoxGame";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { ToastContainer } from "react-toastify";
import { UserContext } from "../utils/UserContext";
import { useSession } from "next-auth/react";
import { api } from "../utils/api";

const Layout: React.FC<{ children: React.ReactNode }> = (props) => {
  // Get logged in user
  const { data: sessionData } = useSession();
  const {
    data: userData,
    status: userStatus,
    refetch: refetchUser,
  } = api.profile.getUser.useQuery(undefined, {
    enabled: sessionData?.user !== undefined,
  });

  return (
    <>
      <ToastContainer />
      <Header />
      <UserContext.Provider
        value={{
          data: userData,
          status: userStatus,
          refetch: refetchUser,
        }}
      >
        <h1 className="my-2 hidden text-center font-fontasia text-5xl text-white md:block md:text-8xl">
          <Link href="/">TheNinja-RPG</Link>
        </h1>

        <div className="container">
          <div className="grid grid-cols-3 md:grid-cols-5">
            <div className="col-span-1 hidden md:block">
              {userData && (
                <>
                  <MenuBoxProfile />
                  <MenuBox title="Game Map">
                    <p>NOT IMPLEMENTED</p>
                  </MenuBox>
                </>
              )}
            </div>
            <div className="col-span-3">
              <NavBar />
              <div className="mx-1 mt-2 rounded-md bg-orange-100 p-1 md:mx-0">
                <div className="rounded-md bg-yellow-50 p-5">
                  {props.children}
                </div>
              </div>
            </div>
            <div className="col-span-1 hidden md:block">
              {userData && <MenuBoxGame />}
            </div>
            <Footer />
          </div>
        </div>
      </UserContext.Provider>
    </>
  );
};

export default Layout;
