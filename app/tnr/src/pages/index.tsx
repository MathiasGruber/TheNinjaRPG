import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Loader from "../layout/Loader";
import Welcome from "./welcome";
import { useUser } from "../utils/UserContext";

/**
 * Either shows welcome page, user creation page, or profile
 */
const Home: NextPage = () => {
  const router = useRouter();
  const { data: sessionData, status: sessionStatus } = useSession();
  const { data: userData, status: userStatus } = useUser();

  if (sessionStatus !== "loading" && !sessionData) {
    return <Welcome />;
  }
  if (userStatus !== "loading" && !userData) {
    void router.push("/register");
  }
  if (userData && sessionData) {
    void router.push("/profile");
  }
  return <Loader explanation="Fetching user data..." />;
};

export default Home;
