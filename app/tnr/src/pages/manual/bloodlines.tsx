import { type NextPage } from "next";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "../../layout/ContentBox";

const ManualBloodlines: NextPage = () => {
  return (
    <>
      <ContentBox title="Bloodlines" subtitle="What are they?" back_href="/manual">
        <p>
          Bloodlines are anomalies of the DNA that allow the wielders unique abilities,
          e.g. enhanced chakra control, enhanced stamina, regenerative effects, improved
          elemental control, etc. The name of the bloodline typically describes both the
          anomaly and the resulting techniques associated with it. Historically
          bloodlines are passed down between generations, however, in the modern age of
          the ninja world it is possible for non-bloodline ninja to acquire the genetic
          traits of bloodlines through ninjutsu-assisted surgery.
        </p>
        <p className="pt-4">
          When you reach the rank of Genin, you can go to the hospital of your village
          to take blood samples, in order to learn whether your character was born with
          an innate bloodline. If not, it is also at the hospital where they offer the
          service of implanting bloodlines into your body.
        </p>
      </ContentBox>
      <ContentBox title="Database" subtitle="All known bloodlines">
        Test
      </ContentBox>
    </>
  );
};

export default ManualBloodlines;
