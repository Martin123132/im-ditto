# Help with I’m-Ditto

Start with the smallest problem you can reproduce. You do not need to understand the code to report it, and you should not have to share your private project.

## The dashboard does not open

Extract the complete Windows ZIP before running **Launch Im-Ditto.cmd**. Keep `runtime/node.exe`, `ditto/` and the launcher together. If the browser does not open but the launcher gives you a local address, open that address manually and report the browser-opening problem.

Do not disable Windows protection to get past a warning. Check that the download came from the expected repository and release. A matching checksum detects changed bytes; it does not establish that a program is safe.

## My AI cannot reach the build folder

Local Codex needs access to the intended build folder. ChatGPT needs a working PC Bridge connection with that folder authorized by you. Ditto cannot grant those permissions or bypass a paused Bridge. Use your local owner controls; do not grant access to your whole computer just to clear an error.

The build prompt is for creating a new I’m. The **Connection** check is for an already installed workspace. Copying a prompt is not proof that the AI can reach it. [Connection guide](../DITTO_CONNECT.md)

## The AI says it finished but no package is ready

Return to **Make my I’m → Check finished package**. If the output is missing, ask the AI to use the exact package destination in the generated brief and report the actual test results. Do not install a different file solely because a chat says it is ready.

A build report is supplied by the builder, not an independent safety certificate. Read the package review and trust only code you are comfortable running.

## Reply clocks are unavailable

Clocks need a compatible, running PC Bridge. Local Codex, manual use and older Bridges can still use Ditto without them. Clock availability does not determine whether a workspace is working, and an expired clock is not proof that the AI has stopped thinking.

## Studio reports missing video tools

Only the optional Studio example needs FFmpeg and FFprobe. They are not installed by Ditto. You can make an unrelated I’m or use the board-game example without them.

## Updating without losing work

Back up your `local-profile/workspaces/` folder and editable builds. Extract a new Ditto download separately; do not replace your profile with an empty one. Stop an I’m before updating it through the package review. Removing an I’m keeps its saved data. Closing the browser tab alone does not stop Ditto; use **Stop I’m-Ditto and its apps**.

## Report an ordinary problem

Use [the repository issue forms](https://github.com/Martin123132/im-ditto-public-candidate/issues/new/choose). Include:

- Ditto version and whether you used the ZIP or source checkout.
- Windows version, browser and whether you used ChatGPT/Bridge, local Codex or no AI.
- The short steps, what you expected and what actually happened.
- A short error message with private details removed.

Do not upload a full profile, logs folder, chat export or project. Screenshots can expose private tabs, names, addresses and connection codes; crop or redact them first. Do not send passwords, pairing links or runtime keys.

For private support, business or licensing enquiries, contact **Glyn, COO of Two Hands Network Ltd**, at [glyn@twohandsnetwork.co.uk](mailto:glyn@twohandsnetwork.co.uk). Include **I’m-Ditto** in the subject and keep the initial message free of confidential files and connection details.

For a security concern, follow [SECURITY.md](../SECURITY.md) instead of opening a public issue. Support response times are not guaranteed for this preview.
