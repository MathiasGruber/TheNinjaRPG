# 🤖 Open Hands Guide 👐

In an attempt to speed up development and surf the wave of AI becoming better at software engineering, we are currently experimenting with using Open Hands to resolve smaller feature requests and bug reports within the game. This document describes the expected workflow for how to use this technology.

**Step 1:** Someone reports a new issue on githubm, following e.g. the bug report guidelines, and essentially writing the report with enough context that a developer completely unfamiliar with the game should be able to figure out how to solve it. Assume the AI has almost no context.

**Step 2:** To start OpenHands assign the `fix-me` label to the issue. This should start Open Hands, which will try to resolve the issue and write comments explaining its progress on the issue.

![image](https://github.com/user-attachments/assets/46d1d08a-5a1b-48b4-8e17-9c1424ef6e33)

**Step 3:** If the model does not believe it managed to solve the issue, then it'll comment with how far it got, and a human developer will take over. If, however, it believes it has managed to solve the issue at hand, it will create a pull request, which you can now go review.

Before the fix or feature can be merged, it must pass all our automatic checks. You can also review the code changes to see if they make sense from a logical point of view. And finally, and most importantly, you may actually test out the change on a preview deployment, which should also be linked on the pull request, i.e. click the "View Deployment" button:

![image](https://github.com/user-attachments/assets/67c323ae-b540-434b-80dc-8f8a8dc1b501)

**Step 4:** If OpenHands did not properly solve the issue, you can iterate with the AI to improve its solution. To do so, either

    a) Create a new comment containing @openhands-agent, which will prompt the AI to revise its solution according to your comment, or

    b) Add the 'fix-me' label to the PR, which will prompt the AI to read the entire PR conversation and try to revise its solution.

**Step 5:** If the solution looks OK and you're reviewed the changes, create a comment on the PR with the result of your test and tag me @MathiasGruber, then I will perform a final review and merge the code.
