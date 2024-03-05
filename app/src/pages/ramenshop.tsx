import { type NextPage } from "next";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { getRamenHealPercentage, calcRamenCost } from "@/utils/ramen";
import { showMutationToast } from "@/libs/toast";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/village";
import type { RamenOption } from "@/utils/ramen";
import type { UserWithRelations } from "../server/api/routers/profile";

const RamenShop: NextPage = () => {
  const { data: userData, refetch } = useRequiredUserData();
  useRequireInVillage();

  const { mutate, isPending } = api.village.buyFood.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetch();
      }
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
      {isPending && <Loader explanation="Purchasing food" />}
      {!isPending && (
        <div className="grid grid-cols-3 text-center font-bold italic p-3">
          <MenuEntry
            title="Small Bowl"
            entry="small"
            image="/ramen/small_bowl.webp"
            userData={userData}
            onPurchase={() => mutate({ ramen: "small" })}
          />
          <MenuEntry
            title="Medium Bowl"
            entry="medium"
            image="/ramen/medium_bowl.webp"
            userData={userData}
            onPurchase={() => mutate({ ramen: "medium" })}
          />
          <MenuEntry
            title="Large Bowl"
            entry="large"
            image="/ramen/large_bowl.webp"
            userData={userData}
            onPurchase={() => mutate({ ramen: "large" })}
          />
        </div>
      )}
    </ContentBox>
  );
};

export default RamenShop;

interface MenuEntryProps {
  title: string;
  entry: RamenOption;
  image: string;
  userData: NonNullable<UserWithRelations>;
  onPurchase: () => void;
}

const MenuEntry: React.FC<MenuEntryProps> = (props) => {
  // Destructure
  const { title, entry, image, userData, onPurchase } = props;

  // Convenience
  const healPerc = getRamenHealPercentage(entry);
  const cost = calcRamenCost(entry, userData);

  // Checks
  const canAfford = userData.money >= cost;
  const left = (100 * (userData.maxHealth - userData.curHealth)) / userData.maxHealth;
  const healTooMuch = healPerc > left + 10;

  // Click handler
  const onClick = () => {
    if (!canAfford) {
      showMutationToast({ success: false, message: "You don't have enough money" });
    } else if (left === 0 || healTooMuch) {
      showMutationToast({ success: false, message: "You don't need to eat that much" });
    } else {
      onPurchase();
    }
  };

  return (
    <div className="hover:cursor-pointer" onClick={onClick}>
      <Image
        alt={title}
        src={image}
        width={256}
        height={256}
        className={`hover:opacity-30 ${!canAfford || healTooMuch || left === 0 ? "grayscale opacity-50 cursor-not-allowed" : ""}`}
      />
      <p>{title}</p>
      <p className="text-green-700">+{healPerc.toFixed()}% HP</p>
      <p className="text-red-700">-{cost.toFixed(2)} ryo</p>
    </div>
  );
};
