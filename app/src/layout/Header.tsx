import React from "react";
import Head from "next/head";
import Script from "next/script";

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
        <meta name="viewport" content="width=device-width, initial-scale=1"></meta>

        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-5TK3T9');`}
      </Script>
    </>
  );
};

export default Header;
