import { type NextPage } from "next";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { getRamenHealPercentage, calcRamenCost } from "@/utils/ramen";
import { show_toast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/village";

const RamenShop: NextPage = () => {
  const { data: userData, refetch } = useRequiredUserData();
  useRequireInVillage();

  const { mutate, isLoading } = api.village.buyFood.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        await refetch();
        show_toast("Ramen Shop", data.message, "success");
      } else {
        show_toast("Ramen Shop", data.message, "error");
      }
    },
    onError: (error) => {
      show_toast("Error purchasing food", error.message, "error");
    },
  });

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox
      title="Ramen Shop"
      subtitle="Get some healthy food to heal your body"
      back_href="/village"
      padding={false}
    >
      <Image
        alt="welcome"
        src="/ramen/welcome.webp"
        width={512}
        height={221}
        className="w-full"
      />
      {isLoading && <Loader explanation="Purchasing food" />}
      {!isLoading && (
        <div className="grid grid-cols-3 text-center font-bold italic p-3">
          <div
            className="hover:cursor-pointer"
            onClick={() => mutate({ ramen: "small" })}
          >
            <Image
              alt="small"
              src="/ramen/small_bowl.webp"
              width={256}
              height={256}
              className="hover:opacity-30"
            />
            <p>Small Bowl</p>
            <p className="text-green-700">
              +{getRamenHealPercentage("small").toFixed()}% HP
            </p>
            <p className="text-red-700">
              -{calcRamenCost("small", userData).toFixed(2)} ryo
            </p>
          </div>
          <div
            className="hover:cursor-pointer"
            onClick={() => mutate({ ramen: "medium" })}
          >
            <Image
              alt="medium"
              src="/ramen/medium_bowl.webp"
              width={256}
              height={256}
              className="hover:opacity-30"
            />
            <p>Medium Bowl</p>
            <p className="text-green-700">
              +{getRamenHealPercentage("medium").toFixed()}% HP
            </p>
            <p className="text-red-700">
              -{calcRamenCost("medium", userData).toFixed(2)} ryo
            </p>
          </div>
          <div
            className="hover:cursor-pointer"
            onClick={() => mutate({ ramen: "large" })}
          >
            <Image
              alt="large"
              src="/ramen/large_bowl.webp"
              width={256}
              height={256}
              className="hover:opacity-30"
            />
            <p>Large Bowl</p>
            <p className="text-green-700">
              +{getRamenHealPercentage("large").toFixed()}% HP
            </p>
            <p className="text-red-700">
              -{calcRamenCost("large", userData).toFixed(2)} ryo
            </p>
          </div>
        </div>
      )}
    </ContentBox>
  );
};

export default RamenShop;
