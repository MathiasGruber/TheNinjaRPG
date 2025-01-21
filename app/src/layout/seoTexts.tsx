import Link from "next/link";

export const forumText = (
  <>
    <p>
      Register an account to also dive into the world of <strong>The Ninja RPG</strong>{" "}
      on our forum. This is the place to connect with fellow players, share your
      strategies, ask questions, and explore the rich lore of the ninja world. Whether
      you&apos;re here to discuss game mechanics, brainstorm new tactics, or simply
      enjoy the camaraderie of our passionate community, this thread is your gateway to
      valuable insights and collaboration.
    </p>
    <p className="pt-2">
      Have questions about missions, combat strategies, or character builds? Share them
      here and get advice from experienced players. Looking to understand the
      intricacies of ninja ranks, clan dynamics, or crafting systems? The threads found
      on the forum is a treasure trove of tips and tricks that will help you level up
      your gameplay and enhance your ninja journey.
    </p>
    <p className="pt-2">
      Don&apos;t forget to check out the{" "}
      <Link className="font-bold" href="/manual">
        game manual
      </Link>{" "}
      for detailed guides and instructions on mastering every aspect of{" "}
      <strong>The Ninja RPG</strong>. Stay connected with our vibrant{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        Discord community
      </Link>{" "}
      for real-time discussions, announcements, and exclusive events. For the latest
      updates and contributions, visit our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        GitHub repository
      </Link>
      , where you can explore the game&apos;s development and even participate in
      shaping its future. And, of course, make sure to explore other threads in the{" "}
      <Link className="font-bold" href="/forum">
        forums
      </Link>{" "}
      to uncover even more tips, debates, and strategies.
    </p>
    <p className="pt-2">
      This forum thread is part of the thriving community that makes{" "}
      <strong>The Ninja RPG</strong> special. Whether you&apos;re a seasoned ninja or
      just starting your journey, you&apos;ll find this thread to be a welcoming and
      resourceful space. Share your ideas, learn from others, and contribute to the
      growing knowledge base of our ninja world.
    </p>
    <p className="pt-2">
      Ready to jump into the discussion? Join the conversation below and let&apos;s keep
      building the ninja legacy together. Haven&apos;t started your adventure yet?{" "}
      <Link className="font-bold" href="/login">
        sign up today
      </Link>{" "}
      at <strong>theninja-rpg.com</strong> and become part of the most immersive ninja
      RPG experience online!
    </p>
  </>
);

export const publicUserText = (username: string) => {
  return (
    <>
      Welcome to <b>{username}</b>&apos;s profile on The Ninja RPG, the ultimate
      destination for immersive ninja role-playing experiences. This profile is your
      window into {username}&apos;s in-game journey, showcasing their ninja stats, rank,
      achievements, mission history, affiliations, etc. Whether you&apos;re a seasoned
      player or a newcomer to the ninja world, this profile offers a unique look at how{" "}
      {username} has built their ninja legacy within our dynamic RPG community. <br />
      <br />
      In the ever-evolving ninja universe of The Ninja RPG, every profile tells a story.
      Explore {username}&apos;s combat skills, elemental affinities, strategic
      decisions, and progress through various ninja ranks. See how they&apos;ve tackled
      challenging missions, contributed to their clan&apos;s strength, and navigated the
      intricate politics of the ninja world. Profiles like this highlight the
      creativity, strategy, and dedication that define our players&apos; adventures.{" "}
      <br />
      <br />
      Are you ready to start or improve your own ninja journey? Equip yourself with the
      tools you need! Dive into the comprehensive{" "}
      <Link className="font-bold" href="/manual">
        game manual
      </Link>
      , your guide to mastering everything from battle mechanics and skill trees to
      mission strategies and crafting. Join the vibrant{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        Discord community
      </Link>
      , where ninjas from across the globe come together to discuss game updates, share
      strategies, and make lifelong connections. Engage directly with developers and
      fellow enthusiasts through our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        GitHub repository
      </Link>
      , where you can view the latest updates, report issues, and even contribute to the
      game&apos;s codebase. For detailed discussions, game tips, and debates about ninja
      lore, visit the bustling{" "}
      <Link className="font-bold" href="/forum">
        forums
      </Link>
      , the heart of our online ninja community.
      <br />
      <br /> User profiles on The Ninja RPG are more than just stats; they&apos;re a
      reflection of each player&apos;s unique path and impact on the game&apos;s rich,
      immersive world. By exploring profiles like {username}&apos;s, you can learn about
      different playstyles, gain inspiration for your own ninja character, and
      strategize for your next adventure. Whether you&apos;re here to compete,
      collaborate, or simply learn, every page offers a wealth of insights.
      <br />
      <br />
      Don&apos;t forget that The Ninja RPG is always growing. New missions, challenges,
      and features are constantly being added to enhance your gameplay experience. Make
      sure to stay connected through our Discord server and forums to be the first to
      hear about updates and special events. Ready to take your ninja skills to the next
      level? Sign up today at theninja-rpg.com, start building your ninja legacy, and
      become a legend in the ninja world.
    </>
  );
};

export const bloodlineText = (name: string) => {
  return (
    <>
      Welcome to the stats page for <b>{name}</b> in The Ninja RPG, your central
      resource for understanding how this distinctive bloodline influences our
      ever-expanding ninja world. Rather than delving into lore or backstory, this page
      zeroes in on numbers and core metrics—boosts, special abilities, and
      synergies—that define <b>{name}</b>&apos;s power in missions, clan battles, and
      PvP showdowns. <br /> <br /> Bloodlines in The Ninja RPG, including <b>{name}</b>,
      play a critical role in shaping your unique playstyle. By analyzing this
      bloodline’s stats, you can see how well it aligns with your chosen jutsu, items,
      and elemental affinities. Whether you specialize in stealth, brute force, or
      support, <b>{name}</b> can amplify your strengths and help you overcome even the
      toughest challenges our world has to offer. <br /> <br /> Ready to dive deeper
      into bloodlines and more? The{" "}
      <Link className="font-bold" href="/manual">
        {" "}
        game manual{" "}
      </Link>{" "}
      is your go-to source for advanced skill mechanics and mission strategies. You can
      also join our vibrant{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        {" "}
        Discord community{" "}
      </Link>{" "}
      to stay informed about the latest updates and discuss optimal builds with ninjas
      from all walks of life. If you have insights or suggestions to share, head over to
      our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        {" "}
        GitHub repository{" "}
      </Link>{" "}
      , or visit the{" "}
      <Link className="font-bold" href="/forum">
        {" "}
        forums{" "}
      </Link>{" "}
      for in-depth conversations on bloodline synergy, upcoming features, and more.{" "}
      <br /> <br /> Every bloodline, including <b>{name}</b>, offers a unique path to
      mastery, enhancing your toolkit in ways that can make or break your journey to
      become a legendary ninja. By studying the stats on this page, you&apos;ll be
      better prepared to harness the full power of <b>{name}</b>, customizing your
      gameplay for maximum impact. If you&apos;re ready to advance your skills, sign up
      or log in at theninja-rpg.com, and begin your adventure toward forging an
      unforgettable legacy in The Ninja RPG.
    </>
  );
};

export const jutsuText = (name: string) => {
  return (
    <>
      Welcome to <b>{name}</b>&apos;s stats page on The Ninja RPG, your one-stop
      resource for understanding how this technique stacks up in our ever-evolving ninja
      landscape. Here, you&apos;ll find crucial data on its power, energy usage,
      cooldowns, and other metrics that shape its effectiveness in both PvP and PvE
      scenarios. Rather than focusing solely on the lore behind <b>{name}</b>, this page
      zooms in on the numbers—helping you gauge how well it complements your build and
      fits into the broader metagame. <br /> <br /> Each jutsu in The Ninja RPG,
      including <b>{name}</b>, plays a pivotal role in balancing offensive firepower,
      defensive resilience, and supportive capabilities. By analyzing <b>{name}</b>
      &apos;s performance stats, you&apos;ll uncover key insights on synergy with other
      skills, recommended elemental affinities, and potential counterplays you may face
      in clan battles or high-stakes PvP encounters. Armed with this knowledge, you can
      make informed decisions when fine-tuning your loadout and overall playstyle.{" "}
      <br /> <br /> Looking to dig deeper into jutsu mechanics and strategy? Our{" "}
      <Link className="font-bold" href="/manual">
        {" "}
        game manual{" "}
      </Link>{" "}
      covers everything from skill trees to mission tactics, while our lively{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        {" "}
        Discord community{" "}
      </Link>{" "}
      brings ninjas from around the globe together to share jutsu insights and stay
      up-to-date on game developments. You can also submit feedback, share innovative
      ideas, or report issues in our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        {" "}
        GitHub repository{" "}
      </Link>{" "}
      , and discuss advanced jutsu concepts on the{" "}
      <Link className="font-bold" href="/forum">
        {" "}
        forums{" "}
      </Link>{" "}
      , where players collaborate to tackle every challenge the ninja world throws their
      way. <br /> <br /> Every jutsu, including <b>{name}</b>, is meticulously crafted
      to push your strategic thinking and adaptability to new heights. By examining its
      stats, you&apos;ll be better prepared to integrate <b>{name}</b> into your
      arsenal—whether you&apos;re aiming to outmaneuver enemies, support your allies, or
      achieve mastery through relentless training. Ready to level up your ninja journey?
      Head over to theninja-rpg.com, sign up today, and discover how your dedication and
      ingenuity can transform <b>{name}</b> into a cornerstone of your legacy in The
      Ninja RPG.
    </>
  );
};

export const itemText = (name: string) => {
  return (
    <>
      Welcome to the stats page for <b>{name}</b> in The Ninja RPG, your go-to
      destination for understanding this item&apos;s role and potential impact within
      our ever-evolving ninja world. Rather than diving deep into the backstory of{" "}
      <b>{name}</b>, this page focuses on the numbers—durability, power boosts, weight,
      and other key data points that can make or break your strategy in missions, clan
      battles, or PvP showdowns. <br /> <br /> Each item in The Ninja RPG, including{" "}
      <b>{name}</b>, serves a unique function in balancing your offensive, defensive,
      and supportive capabilities. By reviewing these core stats, you can determine how
      well <b>{name}</b> aligns with your build, whether you&apos;re aiming to unleash
      devastating attacks, shore up your defenses, or provide critical backup for your
      allies. Armed with this knowledge, you can fine-tune your loadout to gain an edge
      where it matters most—on the battlefield. <br /> <br /> Looking to delve even
      deeper into item synergy and advanced tactics? The{" "}
      <Link className="font-bold" href="/manual">
        {" "}
        game manual{" "}
      </Link>{" "}
      offers a comprehensive overview of equipment mechanics, skill trees, and mission
      strategies. Join our bustling{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        {" "}
        Discord community{" "}
      </Link>{" "}
      to stay informed of the latest updates and discuss gear recommendations with
      ninjas from around the globe. You can also contribute your ideas or report any
      issues in our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        {" "}
        GitHub repository{" "}
      </Link>{" "}
      , or head over to the{" "}
      <Link className="font-bold" href="/forum">
        {" "}
        forums{" "}
      </Link>{" "}
      for in-depth discussions on item builds, upcoming features, and the evolving
      landscape of The Ninja RPG. <br /> <br /> Every piece of equipment has a purpose
      and place in the game world, and <b>{name}</b> is no exception. Studying its stats
      helps you make strategic decisions that enhance your ninja skillset, ensuring you
      remain a formidable force across all of your adventures. Ready to take the next
      step toward crafting a legendary gear setup? Sign up or log in at
      theninja-rpg.com, explore more items, and continue your journey toward becoming a
      true ninja legend.
    </>
  );
};

export const aiText = (name: string) => {
  return (
    <>
      Welcome to <b>{name}</b>&apos;s stats page on The Ninja RPG, your go-to source for
      understanding how this AI opponent measures up in our ever-evolving ninja world.
      Here, you&apos;ll find vital data on battle performance—wins, losses, and other
      metrics that showcase just how formidable <b>{name}</b> can be. Rather than
      focusing on the AI&apos;s individual quirks, this page is all about numbers and
      outcomes, helping you grasp the larger role AI-controlled opponents play in
      shaping the game&apos;s competitive landscape. <br /> <br /> As one of the many
      AI-driven encounters in The Ninja RPG, <b>{name}</b> contributes to the dynamic
      balance between player ambition and in-game challenges. Analyzing its track record
      and combat success rates can help you anticipate strategies, adjust your build,
      and prepare for any scenario the ninja world throws at you. By tracking{" "}
      <b>{name}</b>&apos;s battle statistics, you gain crucial insights into the
      metagame—making every mission, PvP engagement, and clan confrontation a more
      calculated and rewarding experience. <br /> <br /> Looking to sharpen your edge
      even more? Our{" "}
      <Link className="font-bold" href="/manual">
        {" "}
        game manual{" "}
      </Link>{" "}
      provides a comprehensive guide to mechanics, skill trees, and mission approaches,
      while our bustling{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        {" "}
        Discord community{" "}
      </Link>{" "}
      brings ninjas from around the world together to swap strategies and stay updated
      on the latest AI developments. You can also contribute new ideas or report issues
      at our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        {" "}
        GitHub repository{" "}
      </Link>{" "}
      , or explore deeper discussions in the{" "}
      <Link className="font-bold" href="/forum">
        {" "}
        forums{" "}
      </Link>{" "}
      , where players collaborate on all aspects of the game. <br /> <br /> Every AI
      opponent in The Ninja RPG, including <b>{name}</b>, serves a greater purpose:
      testing your combat readiness and spurring you to refine your tactics. By
      examining the performance stats here, you can gauge how well you&apos;re prepared
      to face—and ultimately overcome—any threat the ninja world has in store. Ready to
      climb the ranks and make your mark? Sign up at theninja-rpg.com, learn from every
      encounter, and become a legend in the ever- expanding universe of The Ninja RPG.
    </>
  );
};

export const changelogText = () => {
  return (
    <>
      Welcome to The Ninja RPG&apos;s Activity Log, your central hub for tracking all
      changes and developments in our dynamic ninja world. This comprehensive log
      provides complete transparency into game updates, balance changes, new features,
      and notable player achievements. Whether you&apos;re interested in recent content
      additions, important bug fixes, or significant player milestones, this page offers
      real-time insights into everything that shapes our gaming community. <br /> <br />
      Our activity log covers a wide spectrum of updates, including gameplay mechanics
      adjustments, new missions and areas, bloodline modifications, jutsu balancing, and
      item introductions. You&apos;ll also find records of player achievements, clan
      formations, rank advancements, and other community milestones that contribute to
      our game&apos;s rich history. This transparency ensures you&apos;re always
      informed about how The Ninja RPG evolves and grows. <br /> <br />
      Want to stay even more connected to these developments? Join our active{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        Discord community
      </Link>{" "}
      for real-time discussions about updates and changes. For technical details and
      development insights, check our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        GitHub repository
      </Link>
      , where you can track issues and contribute to future improvements. The{" "}
      <Link className="font-bold" href="/manual">
        game manual
      </Link>{" "}
      is regularly updated to reflect these changes, while our{" "}
      <Link className="font-bold" href="/forum">
        forums
      </Link>{" "}
      offer in-depth discussions about updates and their impact on gameplay. <br />{" "}
      <br />
      This activity log represents our commitment to community engagement and game
      transparency. By maintaining detailed records of changes and developments, we
      ensure that every player can understand and participate in The Ninja RPG&apos;s
      evolution. Whether you&apos;re a veteran ninja or just starting your journey,
      these logs provide valuable context for your adventures and help you stay informed
      about the forces shaping our ninja world. Ready to dive deeper into the
      game&apos;s history and future? Sign up at theninja-rpg.com and become part of our
      ever-growing story.
    </>
  );
};

export const battleCalcText = () => {
  return (
    <>
      Welcome to The Ninja RPG&apos;s Battle Calculator, your essential tool for
      understanding and mastering our game&apos;s combat mechanics. This interactive
      testing ground lets you experiment with different stats, jutsu combinations, and
      equipment setups to see exactly how our damage formulas work. Whether you&apos;re
      planning your next build or analyzing combat effectiveness, this calculator
      provides valuable insights into the mathematical foundations of ninja warfare.{" "}
      <br /> <br />
      By adjusting various parameters like attack power, defense values, bloodline
      bonuses, and equipment modifiers, you can simulate battle scenarios and predict
      outcomes before risking your ninja&apos;s life in actual combat. This tool is
      invaluable for both newcomers learning the basics and veteran players optimizing
      their strategies for high-stakes PvP encounters or challenging missions.
      Understanding these mechanics is key to becoming a formidable force in our ninja
      world. <br /> <br />
      Ready to dive deeper into combat mechanics? Our{" "}
      <Link className="font-bold" href="/manual">
        game manual
      </Link>{" "}
      provides comprehensive details about combat formulas and strategies. Join our
      thriving{" "}
      <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
        Discord community
      </Link>{" "}
      to discuss builds and tactics with fellow ninjas. Found something interesting?
      Share your discoveries on our{" "}
      <Link className="font-bold" href="/forum">
        forums
      </Link>
      , or report potential issues through our{" "}
      <Link
        className="font-bold"
        href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
      >
        GitHub repository
      </Link>
      . <br /> <br />
      The Battle Calculator embodies our commitment to transparency and strategic depth
      in The Ninja RPG. By providing this tool, we empower you to make informed
      decisions about your character&apos;s development and combat approach. Whether
      you&apos;re theory-crafting new builds or validating existing strategies, these
      calculations help illuminate the path to ninja mastery. Ready to put your theories
      to the test? Sign up at theninja-rpg.com and transform your mathematical insights
      into battlefield victories.
    </>
  );
};
