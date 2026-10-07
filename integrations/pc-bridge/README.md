# Read-only Bridge reply-clock display

`clock-display.mjs` runs inside the existing Bridge owner process. It reads the
in-memory WorkSessions snapshot without touching clocks or making MCP calls. It
offers a loopback-only authenticated GET and publishes a separate display-only
credential in `ditto-clock-display.json` under Bridge's owner profile. Ditto
discovers that file automatically. No remote/Chaff credential is reused.

Only hashed display/reply identifiers, period/phase/timing, last contact and
checkpoint timestamp are exported. Notes, receipts, paths, chat labels, raw
session tokens and provider identifiers are excluded. Protected mode hides the
whole list. Ditto's route is local-owner-only, not available to its CLI tool token.
This does not isolate trusted-native same-user programs from each other.

The host works normally without the feed. It never polls MCP, auto-resumes,
finishes an AI reply, modifies a private session file or grants access.

`tools/build-bridge-clock.mjs` builds a candidate from an explicitly hash-pinned
installed archive, adds this module and hooks desktop startup/shutdown. It checks
every unrelated member is unchanged. It does not install or restart anything.
Use the candidate's recorded hash for a separately approved idle activation, keep
the previous archive as rollback, and retain existing access/connection settings.
If desktop hook anchors or the installed hash change, inspect before rebuilding.

This integration is included as source in the Ditto repository. It is not a
replacement Bridge distribution, a tunnel installer or an automatic updater.
