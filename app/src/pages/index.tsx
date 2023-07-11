import React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { useUserData } from "../utils/UserContext";
import Loader from "../layout/Loader";
import Welcome from "./welcome";
import type { NextPage } from "next";

/**
 * Either shows welcome page, user creation page, or profile
 */
const Home: NextPage = () => {
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { data: userData, status: userStatus } = useUserData();

  if (isLoaded && !isSignedIn) {
    return <Welcome />;
  }
  if (userStatus !== "loading" && !userData) {
    void router.push("/register");
  }
  if (userData && userId) {
    void router.push("/profile");
  }
  return <Loader explanation="Fetching user data..." />;
};

export default Home;
