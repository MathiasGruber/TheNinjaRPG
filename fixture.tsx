import React from "react";
import { createRoot } from "react-dom/client";
import { GuideHub } from "@/layout/GuideHub";
import ContentBox from "@/layout/ContentBox";
import TutorialAssistant from "@/layout/TutorialAssistant";
import { navigate, trace, usePublicPathname, user } from "./state";

history.replaceState({}, "", "/guide");
const articles = [
  { id: "fixture-start", slug: "getting-started", title: "Getting started", excerpt: "Find your way around the game and learn the basics.", category: "getting-started", published: true, image: "fixture" },
];
const App = () => {
  const pathname = usePublicPathname();
  return <>
    <div className="qa-banner">LOCAL UI FIXTURE · Production GuideHub + TutorialAssistant · Mock profile and navigation</div>
    <header className="qa-header"><strong>TheNinja-RPG</strong><nav><button onClick={() => navigate("/profile")}>Profile</button><button onClick={() => navigate("/guide")}>Guide</button><button onClick={() => navigate("/rules")}>Rules</button></nav></header>
    <main className="qa-main">
      <div className="qa-status"><strong>Requested route:</strong> /guide <span>Current route: <b data-route>{pathname}</b></span><span>Tutorial on · Step {user.tutorialStep} unchanged</span></div>
      {pathname === "/guide" ? <GuideHub articles={articles as any} /> : <ContentBox title="Profile" subtitle="Local fixture placeholder for the destination page"><p>The tutorial redirected the Guide request to this profile placeholder.</p><div id="tutorial-strength-weaknesses" className="qa-profile">Strengths &amp; Weaknesses <p>Profile content placeholder in local fixture.</p></div></ContentBox>}
      <p className="qa-trace">Navigation trace: {trace.length ? trace.join("; ") : "No redirect — Guide remains readable"}</p>
    </main>
    <TutorialAssistant rightSideBarOpen={false} setRightSideBarOpen={() => {}} rightSideBarRef={{ current: null }} />
  </>;
};
createRoot(document.getElementById("root")!).render(<App />);
