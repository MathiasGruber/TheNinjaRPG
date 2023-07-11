import { type NextPage } from "next";
import { useEffect } from "react";
import Image from "next/image";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { useRouter } from "next/router";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { useRequiredUserData } from "../utils/UserContext";
import { calcIsInVillage } from "../libs/travel/controls";

const Home: NextPage = () => {
  const { data: userData, refetch } = useRequiredUserData();
  const router = useRouter();

  useEffect(() => {
    if (
      userData &&
      !calcIsInVillage({
        x: userData.longitude,
        y: userData.latitude,
      })
    ) {
      void router.push("/");
    }
  }, [userData, router]);

  const { mutate: toggleSleep, isLoading: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onSuccess: async (newStatus) => {
        await refetch();
        show_toast(
          "Home",
          newStatus === "AWAKE" ? "You have woken up" : "You have gone to sleep",
          "success"
        );
      },
      onError: (error) => {
        show_toast("Error toggle sleep status", error.message, "error");
      },
    });

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <>
      <ContentBox
        title="Your Home"
        subtitle="Train, Eat, Sleep, repeat"
        back_href="/village"
      >
        <div className="grid grid-cols-3 text-center font-bold italic">
          <div className=" cursor-not-allowed">
            <Image
              alt="train"
              src="/home/train.webp"
              width={256}
              height={256}
              className="opacity-30"
            />
            Get Stronger
          </div>
          <div className=" cursor-not-allowed">
            <Image
              alt="eat"
              src="/home/eat.webp"
              width={256}
              height={256}
              className="opacity-30"
            />
            Cook & Eat
          </div>
          {isTogglingSleep && <Loader explanation="Toggling sleep status" />}
          {!isTogglingSleep && (
            <div className="cursor-pointer" onClick={() => toggleSleep()}>
              {userData.status === "ASLEEP" ? (
                <>
                  <Image
                    alt="sleeping"
                    src="/home/sleep.webp"
                    width={256}
                    height={256}
                  />
                  Wake up
                </>
              ) : (
                <>
                  <Image
                    alt="sleeping"
                    src="/home/awake.webp"
                    width={256}
                    height={256}
                  />
                  Go to Sleep
                </>
              )}
            </div>
          )}
        </div>
      </ContentBox>
      <ContentBox
        title="Overview"
        subtitle="Decorate, upgrade, host parties"
        initialBreak={true}
      >
        WIP
      </ContentBox>
      <ContentBox title="Item Storage" subtitle="Store items" initialBreak={true}>
        WIP
      </ContentBox>
    </>
  );
};

export default Home;
