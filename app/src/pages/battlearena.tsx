import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";

const Arena: NextPage = () => {
  // Data from database
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Router for forwarding
  const router = useRouter();

  // Mutation for starting a fight
  const { mutate: attack, isLoading: isAttacking } =
    api.combat.startArenaBattle.useMutation({
      onMutate: () => {
        document.body.style.cursor = "wait";
      },
      onSuccess: async () => {
        await refetchUser();
        await router.push("/combat");
      },
      onError: (error) => {
        show_toast("Error attacking", error.message, "error");
      },
      onSettled: () => {
        document.body.style.cursor = "default";
      },
    });

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox title="Battle Arena" subtitle="Fight Training" back_href="/village">
      The arena is a fairly basic circular and raw battleground, where you can train &
      test your skills as a ninja. Opponents are various creatures or ninja deemed to be
      at your level.
      <h1
        className="cursor-pointer pb-3 pt-5 text-center font-fontasia text-8xl hover:text-orange-800"
        onClick={() => attack()}
      >
        Enter The Arena
      </h1>
      {isAttacking && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-95">
          <div className="m-auto text-center text-white">
            <p className="text-5xl">Entering the Arena</p>
            <Loader />
          </div>
        </div>
      )}
    </ContentBox>
  );
};

export default Arena;
