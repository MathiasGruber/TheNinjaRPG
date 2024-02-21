import React from "react";
import Image from "next/image";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const Welcome: React.FC = () => {
  return (
    <>
      <div className="flex flex-col items-center lg:flex-row">
        <Image
          className="basis-1/2 lg:w-8/12"
          src="/images/frontguy5.webp"
          alt="TNR Logo"
          width={240}
          height={270}
          priority
        />
        <div className="basis-1/2 pt-5">
          <TitledBox title="Welcome to TNR">
            <div className="text-center">
              <p className="font-bold">At the Path of the Shinobi lies many routes.</p>
              <p className="pt-2">
                What route will you take? Learn the way of the Shinobi as you start as
                an aspiring Academy Student. Fight your way to the top to become the
                Kage: the single shadow that protects your village from any danger, or
                become your village&rsquo;s worst nightmare as a wandering Outlaw of
                pure darkness.
              </p>
              <p className="pt-2">
                <span className="font-bold">What?</span> This is a modernized version of
                an long-running online text-based game based on a new technology stack
                and sprinkled with a bit of AI technology.
              </p>

              <Link href="/login">
                <Button
                  id="edit_comment"
                  className="font-bold w-full mt-4 text-xl"
                  size="lg"
                >
                  <UserPlus className="h-6 w-6 mr-2" />
                  Register or Sign In
                </Button>
              </Link>
            </div>
          </TitledBox>
        </div>
      </div>
    </>
  );
};

export default Welcome;

interface TitleBoxProps {
  title: string;
  text?: string;
  children?: React.ReactNode;
}

const TitledBox: React.FC<TitleBoxProps> = (props) => {
  return (
    <>
      <h1 className="text-center text-2xl font-extrabold">{props.title}</h1>
      <div className=" sm:container">
        {props.text}
        {props.children}
      </div>
    </>
  );
};
