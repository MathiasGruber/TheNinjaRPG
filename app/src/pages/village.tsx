import { type NextPage } from "next";
import Link from "next/link";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import StatusBar from "@/layout/StatusBar";
import Loader from "@/layout/Loader";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import type { VillageStructure } from "../../drizzle/schema";

const VillageOverview: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const village_id = userData?.village?.id as string;
  const { data, isFetching } = api.village.get.useQuery(
    { id: village_id },
    { enabled: village_id !== undefined, staleTime: Infinity },
  );

  const title = userData?.village ? `${userData.village.name} Village` : "Village";

  const subtitle =
    data && userData?.village ? `Population: ${data.population}` : "Your Community";

  if (!userData) return <Loader explanation="Loading userdata" />;

  const specialStructures = ["Protectors", "Walls"];

  return (
    <ContentBox
      title={title}
      subtitle={subtitle}
      topRightContent={
        <div className="flex flex-row">
          {data?.villageData.structures
            .filter((s) => specialStructures.includes(s.name))
            .map((structure, i) => (
              <div key={i} className="w-32 pb-1 px-2">
                <Building
                  structure={structure}
                  key={structure.id}
                  textPosition="right"
                />
              </div>
            ))}
        </div>
      }
    >
      <div className="grid grid-cols-3 items-center sm:grid-cols-4">
        {data && userData && userData.village && (
          <>
            {data.villageData.structures
              .filter((s) => !specialStructures.includes(s.name))
              .map((structure, i) => (
                <div key={i} className="p-2">
                  <Link href={`/${structure.name.toLowerCase().replace(" ", "")}`}>
                    <Building
                      structure={structure}
                      key={structure.id}
                      textPosition="bottom"
                      showBar
                    />
                  </Link>
                </div>
              ))}
          </>
        )}
      </div>
      {isFetching && <Loader explanation="Loading Village Information" />}
    </ContentBox>
  );
};

export default VillageOverview;

interface BuildingProps {
  structure: VillageStructure;
  showBar?: boolean;
  textPosition: "bottom" | "right";
}

const Building: React.FC<BuildingProps> = (props) => {
  // Blocks
  const TextBlock = (
    <div className="text-xs">
      <p className="font-bold">{props.structure.name}</p>
      <p>Lvl. {props.structure.level}</p>
    </div>
  );
  const ImageBlock = (
    <Image
      src={props.structure.image}
      alt={props.structure.name}
      width={200}
      height={200}
      priority={true}
    />
  );
  // Render
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        props.structure.level > 0 ? "hover:opacity-80" : "opacity-30"
      }`}
    >
      {props.showBar && (
        <div className="w-2/3">
          <StatusBar
            title=""
            tooltip="Health"
            color="bg-red-500"
            showText={false}
            current={props.structure.curSp}
            total={props.structure.maxSp}
          />
        </div>
      )}
      <div
        className={`grid ${props.textPosition === "right" ? "grid-cols-2" : ""} items-center`}
      >
        {ImageBlock}
        {TextBlock}
      </div>
    </div>
  );
};
