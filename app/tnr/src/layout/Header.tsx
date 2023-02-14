import React from "react";
import Head from "next/head";

const Header: React.FC = () => {
  return (
    <>
      <Head>
        <title>The Ninja-RPG.com - a free browser based mmorpg</title>
        <meta
          name="description"
          content="A free browser based online game set in the ninja world of the Seichi!"
        />
        <meta
          name="keywords"
          content="mmorpg, online, rpg, game, anime, manga, strategy, multiplayer, ninja, community, core 3, theninja-rpg"
        />
        <meta name="distribution" content="Global" />
        <meta name="copyright" content="TheNinja-RPG.com" />
        <meta name="revisit-after" content="1 day" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        ></meta>

        <link rel="icon" href="/favicon.ico" />
      </Head>
    </>
  );
};

export default Header;
