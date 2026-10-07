# I’m-Ditto — local foundation preview

Make an AI workspace around the way you work. One local foundation; your own interface, tools and saved projects, operated by you and your connected AI.

## Start

Double-click **Launch Im-Ditto.cmd**. **Make my I’m** is the landing page: describe your own job and prepare a separate starter and build prompt. **How to Ditto** explains the method and the three example builds. You can adapt an example brief without installing its finished app. Your personal PC Bridge and the original Studio are not replaced.

Use your existing connected AI to implement the brief, test it and return the package. Review/trust it before installing. **My I’ms** lists only your installed workspaces; start one there. **Connection** checks that your AI can inspect that running workspace, or choose **Just me for now**. No example installation is required to create a new I’m.

The portable folder includes Node. Source checkout users need Node 22+. I’m-Studio additionally needs FFmpeg and FFprobe on PATH. Missing dependencies produce an explicit message and do not install/download anything. The board-game workshop needs only Node.

Use the host's **Stop** control for an app, or **Stop I’m-Ditto and its apps** before closing everything. Closing a browser tab alone does not stop the host. Reopen the launcher to return to your saved work.

## Applications

Three examples exist: the personal Bridge is I’m #1, Studio #2 and Board Games #3. The following two are installable in this common host; the personal Bridge remains separate.

- **I’m-Studio**: original image/music-video editor. Import selected pictures and audio, arrange shots/captions, preview and export real MP4. First start creates a separate original Neon Atlas demo in this profile; it does not copy your personal projects.
- **I’m-Board-Games**: a different domain, using the same install/start/stop/discovery/update/remove foundation. Its own documentation describes the actual finished features and tests.

The catalogue is a local collection of bundles, not an online store. No payments, accounts, publishing or auto-updates.

## AI control

See DITTO_CONNECT.md. Connection produces an exact PowerShell prompt bound to your selected workspace and profile. Paste it into your already-connected Bridge chat or local Codex task. A successful authenticated CLI command and read-only workspace inspection update the dashboard; copying instructions alone does not. No model/API calls are embedded in the local applications. New ChatGPT users still complete PC Bridge's own connection wizard; this preview provides guidance, not automatic credential provisioning.

## Install, update, rollback and remove

Every .impack.json bundle includes its manifest, exact production files, per-file hashes and one bundle SHA-256. The dashboard displays declared access and requires trust of that exact package. Updating/rollback requires the app to stop first. Saved projects are under `local-profile/workspaces/APP_ID`, outside `local-profile/releases/HASH`. Remove hides the app and stops it but **keeps its data and releases**. Reinstall restores access to that saved work. Rollback switches code only; data schema version 1 must stay backward-compatible.

## Create an I’m

Choose **Make my I’m** in the dashboard. Enter its name and describe the job. I’m-Ditto creates a separate notes starter and brief beneath your profile's `creator/` folder, then gives you an exact build prompt for your existing AI session. Nothing is sent automatically and the starter does not yet implement your idea.

Copy the prompt into your connected Bridge chat or local Codex session with access to that folder. The prompt asks for real implementation, finite tests with separate test data, a build report, and a finished `.impack.json`. Return to the same saved request and choose **Check finished package**. The dashboard checks its structure, identity and hashes without executing it, and displays its production files, declared access and unverified AI report. Review the source and trust the exact package before installing. Installation does not start it. Start it from **My I’ms**, then use **Connect my AI** to check access to the new workspace.

If the package changes after review, installation is refused until you review it again. Build requests persist across host restarts. Existing apps and Bridge settings are not changed. This preview supports 50 saved requests per profile; it has no automatic model calls, package publishing or permission grants. Native programs run with your Windows user's access: the review is not a security audit or sandbox.

For the developer contract, see creator-template/README.md. Both supplied I’ms consume the same host runtime contract. Creators supply a different entry module, CLI, UI and domain logic; they do not copy the host.

## What this is, and is not

Built from PC Bridge public commit 3426355814ff0bdafdcace8bb6f608c9db4c0efc. This clean review repository includes the three required core modules and original notices; the original desktop and tunnel remain in the separate PC-Bridge repository. I’m-Ditto adds a reusable host/package layer and uses the existing connected Bridge as transport; it does not copy a personal connection or modify the installed app. Its local receipt system reuses BridgeCore with its own paused/read-only profile.

This is a **trusted-native local preview**, not a completed public marketplace or security sandbox. See DITTO_SECURITY.md. Package integrity is not publisher identity. No claim of universal AI client integration, guaranteed security, or clean-OS installation qualification.

## Development

    npm test
    node ditto/build.mjs studio
    node ditto/build.mjs pack SOURCE OUTPUT.impack.json
    node ditto/build.mjs portable NEW_OUTPUT_DIRECTORY

Tests use uniquely named acceptance profiles and preserve receipts. The portable builder expects the matching official Node licence in runtime-notices. It does not bundle FFmpeg. No npm install is needed to run the new host, package builder or focused tests; they use Node built-ins and the existing dependency-free portions of BridgeCore.

The upstream desktop/tunnel source is not part of this repository or portable runtime. Its historical dependencies are recorded in UPSTREAM_PACKAGE_SNAPSHOT.json for provenance, not installed here. The preview’s own tests and its live operation through the existing installed Bridge are reported separately.
