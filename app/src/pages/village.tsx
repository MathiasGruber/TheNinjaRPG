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
    { enabled: village_id !== undefined, staleTime: Infinity }
  );

  const title = userData?.village ? `${userData.village.name} Village` : "Village";

  const subtitle =
    data && userData?.village
      ? `${userData.village.name} Village, Population ${data.population}`
      : "Your shinobi community";

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <ContentBox title={title} subtitle={subtitle}>
      <div className="grid grid-cols-3 items-center lg:grid-cols-4">
        {data && userData && userData.village && (
          <>
            {data.villageData.structures.map((structure, i) => (
              <div key={i}>
                <Link href={`/${structure.name.toLowerCase().replace(" ", "")}`}>
                  <Building structure={structure} key={structure.id} />
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
}

const Building: React.FC<BuildingProps> = (props) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-5 text-center  ${
        props.structure.level > 0 ? "hover:opacity-80" : "opacity-30"
      }`}
    >
      <div className="w-2/3">
        <StatusBar
          title=""
          tooltip="Health"
          color="bg-red-500"
          showText={true}
          current={props.structure.curSp}
          total={props.structure.maxSp}
        />
      </div>
      <Image
        src={props.structure.image}
        alt={props.structure.name}
        width={200}
        height={200}
        priority={true}
      />
      {props.structure.name}
    </div>
  );
};
