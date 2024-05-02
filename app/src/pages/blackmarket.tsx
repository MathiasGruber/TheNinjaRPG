import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Shop from "@/layout/Shop";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import { CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { useRequiredUserData } from "@/utils/UserContext";
import type { NextPage } from "next";

const BlackMarket: NextPage = () => {
  // Tab selection
  const [tab, setTab] = useState<"Bloodline" | "Item" | "Ryo" | null>(null);

  // Settings
  const { data: userData } = useRequiredUserData();

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Render
  return (
    <>
      <ContentBox
        title="Black Market"
        subtitle="Special Abilities and Items"
        back_href="/village"
        topRightContent={
          <NavTabs
            id="hospital-page"
            current={tab}
            options={["Bloodline", "Item", "Ryo"]}
            setValue={setTab}
          />
        }
      >
        <div>
          Welcome to the Black Market. Here you can purchase special abilities, items,
          and currency. You can:
          <ol className="pt-3">
            <li>
              <i> - Have a bloodline genetically infused.</i>
            </li>
            <li>
              <i> - Buy special items.</i>
            </li>
            <li>
              <i> - Exchange ryo for reputation points.</i>
            </li>
          </ol>
        </div>
      </ContentBox>
      {tab === "Bloodline" && <Bloodline />}
      {tab === "Item" && (
        <Shop
          userData={userData}
          defaultType="CONSUMABLE"
          initialBreak={true}
          minRepsCost={1}
          subtitle="Buy rare items"
        />
      )}
      {tab === "Ryo" && <RyoShop />}
    </>
  );
};

export default BlackMarket;

/**
 * Purchase & Remove Bloodlines
 */
const Bloodline: React.FC = () => {
  // Settings
  const { data: userData } = useRequiredUserData();

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Derived
  const bloodlineId = userData.bloodlineId;

  return (
    <>
      {bloodlineId && <CurrentBloodline bloodlineId={bloodlineId} />}
      {!bloodlineId && <PurchaseBloodline />}
    </>
  );
};

const RyoShop: React.FC = () => {
  return (
    <ContentBox
      title="Ryo Shop"
      subtitle="Trade for reputation points"
      initialBreak={true}
    >
      Work In Progress
    </ContentBox>
  );
};
