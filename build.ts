import { readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const app = process.env.TNR_QA_APP_DIR ?? `${process.cwd()}/app`;
const dir = dirname(fileURLToPath(import.meta.url));
const { default: postcss } = await import(`${app}/node_modules/postcss/lib/postcss.mjs`);
const { default: tailwind } = await import(`${app}/node_modules/@tailwindcss/postcss/dist/index.mjs`);
const css = await readFile(`${app}/src/styles/globals.css`, "utf8");
const compiled = await postcss([tailwind({ base: app })]).process(css, { from: `${app}/src/styles/globals.css` });
await writeFile(`${dir}/style.css`, compiled.css + `
body { font-family: Arial, sans-serif; margin: 0; background: #faf7f1; color: #28251f; }
.qa-banner { background: #243b44; color: white; font-size: 12px; padding: 10px 24px; letter-spacing: .3px; position: relative; z-index: 90; }
.qa-header { display:flex; justify-content:space-between; align-items:center; padding: 22px 40px; background:#ede1cf; border-bottom:1px solid #ccbda8; }
.qa-header strong { font-size: 24px; } .qa-header nav { display: flex; gap: 25px; }
.qa-main { max-width: 1050px; margin: 32px auto; padding: 0 24px; }
.qa-status { display:flex; flex-wrap:wrap; gap: 18px; padding:15px; background:#eee9df; border:1px solid #b6b0a3; border-radius:6px; margin-bottom:25px; font-size:14px; }
.qa-status span:last-child { margin-left:auto; } .qa-trace { margin-top:22px; font: 12px monospace; color:#555; }
.qa-profile { border: 1px solid #c2b8a7; padding:25px; margin:30px 0; min-height:150px; background:#eee7da; }
.qa-profile p { margin-top:15px; font-size:14px; }
@media(max-width:700px) { .qa-header { padding:18px; } .qa-header strong { font-size:18px; } .qa-main { margin:20px auto; padding:0 14px; } .qa-status { gap:10px; } }
`);
const mocks: Record<string, string> = {
  "next/navigation": `export { router } from '${dir}/state'; import { router } from '${dir}/state'; export const useRouter=()=>router;`,
  "@/utils/routing": `export { usePublicPathname } from '${dir}/state';`,
  "@/utils/UserContext": `export { useUserData } from '${dir}/state';`,
  "@/app/_trpc/client": `export { api } from '${dir}/state';`,
  "@/hooks/tutorial": `export { steps as TUTORIAL_STEPS, useTutorialStep } from '${dir}/state'; import {steps} from '${dir}/state'; export const TUTORIAL_HOSPITALIZED_STEP=steps[1];`,
  "@/hooks/useAbVariant": `export const useAbVariant=()=>({variant:'control'});`,
  "@/layout/Logbook": `const checkRewards=()=>{}; export const useCheckRewards=()=>({checkRewards,isCheckingRewards:false});`,
  "@/layout/Objective": `export const Objective=()=>null;`,
  "@/layout/Image": `export { Image as default } from '${dir}/state';`,
  "@/layout/Link": `import React from 'react'; import {navigate} from '${dir}/state'; export default ({href,children,...props})=><a {...props} href={href} onClick={e=>{e.preventDefault(); navigate(href);}}>{children}</a>;`,
  "@/libs/objectives": `export const getActiveObjective=()=>undefined; export const isQuestComplete=()=>false; export const isQuestObjectiveAvailable=()=>false;`,
  "@/utils/permissions": `export const canChangeContent=()=>false;`,
  "@/libs/toast": `export const showMutationToast=()=>{};`,
  "@/utils/parse": `export const parseHtml=(text)=>text;`,
  "@sentry/nextjs": `export const getReplay=()=>undefined;`,
};
for (const mode of ["before", "after"]) {
  const result = await Bun.build({
    entrypoints: [`${dir}/fixture.tsx`], target: "browser", outdir: dir,
    naming: `${mode}.js`, define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "local-ui-data-fixture", setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path in mocks) return { path: args.path, namespace: "fixture" };
        if (args.path === "@/layout/TutorialAssistant" && mode === "before") return {path: `${dir}/TutorialAssistant.before.tsx`};
        if (args.path.startsWith("@/")) return {path: Bun.resolveSync(args.path.replace(/^@\/drizzle\//, `${app}/drizzle/`).replace(/^@\//, `${app}/src/`), app)};
        if (!args.path.startsWith(".") && !args.path.startsWith("/")) return {path: Bun.resolveSync(args.path, app)};
      });
      build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx" }));
    } }],
  });
  if (!result.success) throw new Error(JSON.stringify(result.logs));
  await writeFile(`${dir}/${mode}.html`, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tutorial reference navigation — ${mode} fixture</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/${mode}.js"></script></body></html>`);
}
await copyFile(`${app}/../assets/tutorial/lemu.webp`, `${dir}/lemu.webp`);
console.log("Built before/after local production-component fixtures");
