import { type NextPage } from "next";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "../../layout/ContentBox";

const ManualMain: NextPage = () => {
  return (
    <ContentBox title="Game Manual" subtitle="Learn about the game & look up data">
      <div className="grid grid-cols-4 gap-4 text-center font-bold">
        {["combat", "travel", "bloodlines", "jutsus", "armor", "weapons"].map(
          (page) => (
            <Link key={page} href={`/manual/${page}`}>
              <Image
                className="rounded-2xl border-2 border-black hover:cursor-pointer hover:opacity-50"
                src={`/manual/${page}.png`}
                alt={page}
                width={125}
                height={125}
                priority={true}
              />
              <p>{page}</p>
            </Link>
          )
        )}
      </div>
    </ContentBox>
  );
};

export default ManualMain;
