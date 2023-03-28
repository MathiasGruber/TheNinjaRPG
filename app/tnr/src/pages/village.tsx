import { type NextPage } from "next";

import { type VillageStructure } from "@prisma/client";
import Image from "next/image";
import ContentBox from "../layout/ContentBox";
import StatusBar from "../layout/StatusBar";

import { useRequiredUser } from "../utils/UserContext";
import { api } from "../utils/api";

const TermsOfService: NextPage = () => {
  const { data: userData } = useRequiredUser();
  const village_id = userData?.village?.id;
  const { data } = api.village.get.useQuery(
    { id: village_id },
    { enabled: village_id !== undefined }
  );
  console.log(data);

  const title = userData?.village ? `${userData.village.name} Village` : "Village";

  const villageImage = data && userData && userData.village && (
    <div className="col-span-2 row-span-2 hidden text-center xl:block">
      <Image
        src={`/map/${userData.village.name}.webp`}
        alt={userData.village.name}
        width={512}
        height={512}
        priority={true}
      />
      <span>
        {userData.village.name} Village, Population {data.population}
      </span>
    </div>
  );

  return (
    <ContentBox title={title} subtitle="Your shinobi community">
      <div className="grid grid-cols-2 items-center lg:grid-cols-3 xl:grid-cols-4 xl:grid-rows-4">
        {data && userData && userData.village && (
          <>
            {data.structures.map((structure, i) => (
              <>
                {i === 5 && villageImage}
                <Building structure={structure} key={structure.id} />
              </>
            ))}
          </>
        )}
      </div>
    </ContentBox>
  );
};

export default TermsOfService;

interface BuildingProps {
  structure: VillageStructure;
}

const Building: React.FC<BuildingProps> = (props) => {
  return (
    <div className="flex flex-col items-center justify-center p-5 text-center hover:opacity-80">
      <div className="w-1/2">
        <StatusBar
          title=""
          tooltip="Health"
          color="bg-red-500"
          showText={true}
          height={2}
          current={props.structure.cur_sp}
          total={props.structure.max_sp}
        />
      </div>
      <Image
        src={props.structure.image}
        alt={props.structure.name}
        width={512}
        height={512}
        priority={true}
      />
      {props.structure.name}
    </div>
  );
};
