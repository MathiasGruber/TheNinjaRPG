import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";

export default function ManualMain() {
  return (
    <ContentBox
      title="Game Data & Manual"
      subtitle="Learn about the game & look up data"
    >
      <div className="grid grid-cols-4 gap-4 text-center font-bold">
        {[
          "combat",
          "travel",
          "bloodline",
          "jutsu",
          "item",
          "ai",
          "quest",
          "logs",
          "damage_calcs",
          "badge",
          "asset",
          "opinions",
        ].map((page) => (
          <Link
            key={page}
            href={`/manual/${page}`}
            className="flex flex-col items-center"
          >
            <Image
              className="rounded-2xl border-2 border-black hover:cursor-pointer hover:opacity-50"
              src={`/manual/${page}.webp`}
              alt={page}
              width={125}
              height={125}
              priority={true}
            />
            <p>{page}</p>
          </Link>
        ))}
      </div>
    </ContentBox>
  );
}
