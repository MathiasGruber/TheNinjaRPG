import { type NextPage } from "next";
import ContentBox from "../layout/ContentBox";
import Link from "next/link";
import Image from "next/image";

const GitHub: NextPage = () => {
  const link_t3 = (
    <Link className="font-bold" href="https://create.t3.gg/">
      T3 stack
    </Link>
  );
  const link_github = (
    <Link className="font-bold" href="https://github.com/MathiasGruber/TheNinjaRPG">
      GitHub
    </Link>
  );
  const link_issues = (
    <Link
      className="font-bold"
      href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
    >
      GitHub Issues
    </Link>
  );
  return (
    <ContentBox title="Contribute to TNR" subtitle="Learn to code and improve TNR">
      <p>
        Coding is a skill that has become increasingly important in today&rsquo;s
        digital age. It involves using computer programming languages to create
        software, websites, apps, and other digital tools that help automate and
        simplify various tasks. With coding, you can bring to life anything you can
        imagine and make a real impact on the world.
      </p>
      <p className="mt-3">
        <i>
          &quot;Personally, the countless hours I spent coding TNR as a youth have been
          extremely beneficial both personally and in my professional life. With this
          latest version of TNR, I hope that by enabling others to contribute to the
          codebase, we can inspire more people, young and old, to learn to code, while
          also creating an inclusive, supportive and awesome developmer community&quot;.
          ~Terr
        </i>
      </p>
      <h2 className="mt-3 text-2xl">How to Contribute?</h2>
      <p>
        The latest version of TNR is based on the {link_t3} and the source code is made
        available on {link_github}. You&rsquo;re highly encouraged to check out the
        codebase, as well as the {link_issues} to see if there&rsquo;s anything you can
        help with. As we progress the game, we expect to add more information how to
        contribute, so that if you are more inexperienced, we can help you get started.
        For now, you are encouraged to read up on the T3 stack and the technologies
        it&rsquo;s composed of yourself, and from there open a pull request on GitHub.
      </p>
      <h2 className="mt-3 text-2xl">Feature Requests</h2>
      <p>
        Even if you have not coding skills or desire to learn, {link_issues} is where
        you can request new game features, or help giving feedback during development of
        new features.
      </p>
      <div className="flex flex-row justify-center p-5">
        <Link
          href="https://github.com/MathiasGruber/TheNinjaRPG"
          className="flex flex-col items-center font-bold hover:opacity-50"
        >
          <Image
            src={"/images/github-mark.png"}
            width={100}
            height={100}
            alt="GitHub Logo"
            className="hover:opacity-50"
          />
          <p>Go to GitHub</p>
        </Link>
      </div>
    </ContentBox>
  );
};

export default GitHub;
