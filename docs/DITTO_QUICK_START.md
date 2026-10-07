# Make your own I’m

I’m-Ditto helps you build an AI workspace around your own job, controls and saved
projects. This is the Windows x64 **0.1.0-preview.5 creator-first preview**.
It uses your existing AI; it does not include a model or subscription.

## From your idea to a workspace

1. **Extract the whole ZIP** into a folder you control. Keep its folders together.
   Double-click `Launch Im-Ditto.cmd`. Node is included. Leave the host running.
2. **Start on Make my I’m.** Name your workspace and describe what comes in, what
   you and your AI should be able to do, and what useful result should come out.
   Select **Prepare my I’m**. This creates a separate editable starter, not a
   finished custom application.
3. **Copy the build prompt to your AI.** Use a local Codex task with access to the
   intended build folder, or ChatGPT through your existing PC Bridge connection
   with that folder authorized. The prompt contains the paths, instructions,
   tests and package destination. Nothing is sent automatically.
4. **Build it together.** Ask your AI to implement the actual job, show what works,
   test it and report anything unfinished. A renamed starter is not completion.
   No example app needs to be installed first.
5. **Review, install and try it.** Return to **Check finished package**, inspect
   files, access and the unverified build report, then install only if you trust
   it. In **My I’ms**, start it and try a real task. **Connection** provides a
   generated check prompt for your installed workspace.
6. **Keep shaping it.** Ask for changes in the editable build folder, a new version
   and tests that preserve saved-work compatibility. Review the resulting package
   before updating; do not edit an installed release.

## Learn how, rather than just copying an example

Open **How to Ditto** for the method and three worked build stories:

- **The personal Bridge:** an interface around its owner's way of using AI.
- **Music-video Studio:** pictures and music become an editable project and MP4.
- **Board-Game Workshop:** an idea becomes rules, cards and a printable kit.

Each story explains the brief, construction, checks and limitations. **Adapt the
brief** fills an editable form; it does not create or install anything. Briefs are
educational reconstructions, not verbatim transcripts. The finished Studio and
Board-Game Workshop packages are optional examples, not the product's limits.

A useful starting sentence is:

> I bring [materials]. I need to see and change [controls]. My AI should help with
> [work]. The useful output is [result]. We should both use the same saved project.

For instance, a rehearsal desk could keep a set list and practice notes, let you
and your AI edit them, and export a session plan. That is an idea for a new build,
not a capability this preview already supplies.

## Connecting your existing AI

- **Local Codex:** use a task that can access the intended build folder. Once the
  I’m is installed, select the local Codex route under **Connection** and paste its
  generated check prompt. No Bridge-to-Codex relay is required.
- **ChatGPT with PC Bridge:** authorize the intended folder through Bridge's
  owner controls. If not connected yet, follow the separate PC Bridge wizard.
  You can prepare a build request now and return to it after connecting.
- **Local-only use:** an installed I’m can be operated by hand; its connection
  screen offers **Just me for now**.

The included 4:40 video is a **preview 2 connection/setup reference**. Its old
Welcome/example-first screens are not the preview 5 creation journey and it does
not record an entire custom build. Open `START_HERE.html` to watch offline.

## If something does not work

- **Nothing opens:** extract the whole ZIP. Keep `runtime/node.exe` and `ditto/`
  next to the launcher. Read `local-profile/host.log`. Verify the package source;
  do not disable Windows protection to clear a warning.
- **The black launcher window closes:** this is normal after successful startup
  and a browser-opening request. The launcher uses Windows' default browser.
  If Windows rejects that request, the launcher stays open with an error and the
  dashboard address; open that address manually. The host may still be running.
- **AI cannot access the folder:** authorize that exact folder in your AI tool.
  A generated prompt does not grant access. Do not share your entire computer
  just to clear an error.
- **Finished package not found:** your AI needs to finish and package the build
  at the destination in its prompt. Preparing a starter or copying the prompt is
  not a completed build. Resume the saved request under **Your ongoing builds**.
- **Studio needs FFmpeg/FFprobe:** these are optional example dependencies. Install
  from a source you trust if you want Studio; nothing downloads silently.
- **Connection check expired or host restarted:** generate a fresh prompt. Its
  one-use code lasts 15 minutes. Copying it is not proof of a successful check.
- **Bridge is paused or ChatGPT refuses:** use Bridge's owner controls; Ditto
  does not bypass them or ChatGPT's safety decisions.
- **No ChatGPT developer mode:** availability depends on your account/workspace.
  Local Codex and local use are separate options.

## Saved work, trust and the future store

Work lives under `local-profile/workspaces/`; builds and requests under
`local-profile/creator/`. Keep your profile when updating. Use **Stop I’m-Ditto
and its apps** before moving files. Closing a browser tab alone does not stop it.

Packages are trusted native programs, not an OS sandbox. Hashes check bytes, not
publisher identity or safety; build reports are unverified text. Trying real work
and reviewing a package still matter.

Making your own and choosing a ready-made I’m can coexist. The proposed I’m-Store
would let people offer free or paid workspaces for convenience, design and support.
There are no store listings, payments or publisher certification in this preview.

Further reading: [worked examples](../EXAMPLE_RECIPES.md),
[creator contract](../creator-template/README.md),
[connection](../DITTO_CONNECT.md), [security](../DITTO_SECURITY.md),
[video chapters](DITTO_TUTORIAL.md).
