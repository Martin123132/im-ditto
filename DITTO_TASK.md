# I’m-Ditto foundation and two installable I’ms

Original scope: owner-authorized local implementation, 2026-10-05. On 2026-10-06 the owner additionally authorized a new **private** GitHub review repository and private review package. No public publication, payment system, credentials, changes to installed PC Bridge/Chaff, or writes to the original studio.

This checkout starts from PC Bridge public commit 3426355814ff0bdafdcace8bb6f608c9db4c0efc. Preserve upstream code and notices. Extract a reusable package/lifecycle layer alongside the transport core; reuse the existing Bridge connection for live demonstration. Do not pretend a new user's ChatGPT connection is already configured.

Deliver: shared host, reviewable package manifest and content hashes, install/update/rollback/remove with retained user data, local start/stop, installed-app discovery and finite AI commands, creator template, packaged music-video studio, second board-game workshop, real clean-profile lifecycle and workflow tests.

Trust boundary: these are trusted native Node applications, not hostile-code OS sandboxes. Permission declarations document behavior; they do not constrain malicious native code. Installing/running a package requires local owner's explicit trust of its exact bundle digest. No automatic permission expansion, internet-facing listener, or auto-install from an AI request. Preserve old package releases and user data on remove. Do not claim marketplace-grade isolation.

Runtime contract v1: manifest id, name, version (numeric x.y.z), apiVersion=1, description, entry (relative .cjs module), cli (relative .cjs/.js), instructions (relative Markdown), permissions (array of informative strings), dependencies (array chosen from node/ffmpeg/ffprobe), dataVersion=1. An entry exports async start({dataRoot, packageRoot, port, instanceId}), returns {url, close}. It binds IPv4 loopback, supports GET /api/health with app/id/pid/instanceId and a mutation token, and graceful close. The host runs each entry in its own child process, passes IPC lifecycle messages, retains user state outside immutable releases, and checks a pinned release before launch.

CLI: host `node ditto/cli.mjs call APP_ID -- ...APP_ARGS` resolves the installed release and its running URL, invokes its declared CLI with `--url URL`, with no shell. Human UI and CLI must share data and revisions. Apps may have different internal domains; they share installation/lifecycle/discovery rather than copying that host.

Record which implementation was written by browser ChatGPT and which by supervising Codex. Capture milestones, not fictional continuous video. Tests use new named profiles and original synthetic content.
