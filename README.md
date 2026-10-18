# Tutorial reference navigation screenshot evidence

These are real 1440 × 1000 screenshots rendered by headless Google Chrome of a **local UI fixture**, not captures of a deployed game session.

The fixture renders production `GuideHub`, `TutorialAssistant`, `ContentBox`, buttons, tabs, and `globals.css`. It replaces authenticated hooks, tutorial data, and Next navigation with local React state. The mock player has the tutorial enabled at step 1 (Strengths & Weaknesses). Article content, shell header, profile destination, thumbnail placeholders, and navigation trace are fixture data. No live game account, database, API, or authentication is used. This verifies the tutorial navigation behavior and visible Guide access; it does not validate deployed shell routing, authenticated fetching, or the real profile page layout.

- `before-desktop.png`: production TutorialAssistant from base commit `df02a933b` redirects `/guide` to `/profile` and displays its tutorial overlay.
- `after-desktop.png`: the patched component leaves `/guide` visible with no tutorial overlay. The stored tutorial step stays 1.
- `TutorialAssistant.before.tsx`: exact component copied using `git show df02a933b:app/src/layout/TutorialAssistant.tsx`.
- `fixture.tsx`, `state.tsx`, `build.ts`: reproducible local fixture and bundler. Source from the code PR is used for the patched component and all other real components.

## Reproduce

Run from the code PR's repository root, after `make install`. Use a separate terminal for the HTTP server. Set `qa_dir` to a directory containing the files in this evidence branch, for example by extracting its archive:

```sh
qa_dir="$(mktemp -d)"
git archive origin/tnr-screenshots/tutorial-help-navigation/20261018 | tar -x -C "$qa_dir"
TNR_QA_APP_DIR="$PWD/app" bun "$qa_dir/build.ts"
python3 -m http.server 3199 --bind localhost --directory "$qa_dir"
```

With the server running, use the same `qa_dir` value in another terminal. These commands create dedicated temporary browser profiles and do not control an existing Chrome session:

```sh
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for mode in before after; do
  "$chrome" --headless=new \
    --user-data-dir="$qa_dir/chrome-$mode" \
    --disable-extensions --disable-background-networking \
    --no-first-run --no-default-browser-check --disable-sync \
    --window-size=1440,1000 --hide-scrollbars --virtual-time-budget=3000 \
    --screenshot="$qa_dir/$mode-desktop.png" \
    --dump-dom "http://localhost:3199/$mode.html" \
    > "$qa_dir/$mode-dom.html" 2> "$qa_dir/$mode-browser.log"
done
```

The DOM snapshots show `data-route="true">/profile` before and `data-route="true">/guide` after. The fixture's route trace is driven by the real tutorial component calling the mock router; it is not a hardcoded before/after result.
