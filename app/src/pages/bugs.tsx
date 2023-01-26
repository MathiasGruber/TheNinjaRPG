import ContentBox from "../layout/ContentBox";
import Image from "next/image";
import Link from "next/link";
import type { NextPage } from "next";

const BugReport: NextPage = () => {
  return (
    <ContentBox title="Report Bugs" subtitle="Found a bug? Let us know!">
      We need your help in making our gaming experience even better. Join our vibrant
      Discord community and become an integral part of our bug-reporting team. By
      sharing your valuable insights, you&lsquo;ll contribute to identifying and
      squashing those pesky bugs that occasionally pop up. Your reports will assist us
      in fine-tuning the gameplay, improving the overall user experience, and ensuring a
      seamless adventure for everyone. Together, let&lsquo;s forge a stronger connection
      and make this game the best it can be. Join our Discord today and let your voice
      be heard!
      <div className="flex flex-row justify-center p-5">
        <Link
          href="https://discord.gg/tnr"
          className="flex flex-col items-center font-bold hover:opacity-50"
        >
          <Image
            src="/images/discord_logo.png"
            alt="Discord"
            width={100}
            height={100}
          />
          <p>Go to Discord</p>
        </Link>
      </div>
    </ContentBox>
  );
};

export default BugReport;
