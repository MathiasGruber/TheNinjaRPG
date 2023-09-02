import { type NextPage } from "next";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { useRequiredUserData } from "../utils/UserContext";
import { useRequireInVillage } from "../utils/village";

const Home: NextPage = () => {
  const { data: userData, refetch } = useRequiredUserData();
  useRequireInVillage();

  const { mutate: toggleSleep, isLoading: isTogglingSleep } =
    api.home.toggleSleep.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          await refetch();
          show_toast("Home", data.message, "success");
        } else {
          show_toast("Home", data.message, "error");
        }
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
          <Link href="/traininggrounds">
            <Image
              className="hover:opacity-30"
              alt="train"
              src="/home/train.webp"
              width={256}
              height={256}
            />
            Go train
          </Link>
          <Link href="/ramenshop">
            <Image
              className="hover:opacity-30"
              alt="eat"
              src="/home/eat.webp"
              width={256}
              height={256}
            />
            Get Food
          </Link>
          {isTogglingSleep && <Loader explanation="Toggling sleep status" />}
          {!isTogglingSleep && (
            <div className="cursor-pointer" onClick={() => toggleSleep()}>
              {userData.status === "ASLEEP" ? (
                <>
                  <Image
                    className="hover:opacity-30"
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
                    className="hover:opacity-30"
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
