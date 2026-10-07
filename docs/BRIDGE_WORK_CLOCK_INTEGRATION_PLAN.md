# Bridge reply work clocks — preview 6 integration

Status: **implemented and locally verified on 6 October 2026**. Bridge's dedicated
read-only display feed is installed after owner-approved idle activation. Ditto
preview 6 displays it in a separate test profile; the older Ditto host was left
running because it still had an open app. No Accessibility code was touched.
This implementation is included in the owner-authorized preview 6 private release.
The independent friend trial remains the next check; same-PC tests are not a
substitute for it. The Windows ZIP updates Ditto, not the installed Bridge.

Delivered scope: timing/phase, distinct chat selection, early-finish state, last
contact, checkpoint timestamp and reply number. Notes remain in Bridge; this
version deliberately does not copy private handover text or add resume controls.
The new feed is automatically discovered under the same Windows user's Bridge
profile with a separate display-only credential. There is no pairing wizard or
per-project configuration. Older Bridges and local Codex work without the feed.

Checks: 43/43 Ditto tests (including 8 new clock tests), 20/20 existing Bridge
timer/transport checks, clock desktop UI checks and the portable no-global-Node
smoke passed. The broader Bridge desktop smoke stopped at its pre-existing
“One-click trusted access did not enable” assertion in BOTH the unchanged baseline
and the candidate. That is recorded as an existing test failure, not a passing full
desktop suite. Installed activation separately verified enabled access and unchanged
connection/settings hashes. Only desktop startup/shutdown and the new display
module changed; 2,719 existing Bridge members were byte-preserved.

The sections below retain the implementation design and remaining guardrails.

## Intended experience

When a connected chat builds or operates an I’m, show a small status badge such as
“This reply · 12 minutes left”. At the appropriate boundaries, show
“Wrapping up”, “Handover requested”, or “Reply period finished”. A details panel
can show the last contact, checkpoint time and owner-requested handover notes.
Use text as well as colour, keyboard-accessible controls and restrained notices;
do not announce a changing countdown every second to a screen reader.

This belongs in the shared Ditto host. Creators should not have to add a timer to
each I’m. Creating and using an I’m remains the main product journey, not clock
configuration. Local/manual use and connections that do not go through Bridge
must continue to work without this feature.

## What is already there

- Bridge retains chat identity but owns a separate period for each reply to a new
  user message. A fresh `work_turn_id` starts 25 minutes immediately, even when the
  previous reply had time left. Calls, polls and reconnects within that reply keep
  its original ID and deadline. There is no lifetime chat budget or manual unlock.
- Warning is at 20 minutes, handover request at 23, and specified new command/write
  tools carrying the expired reply ID are held at 25. Missing reply markers receive
  advice only, not a chat-wide lockout. Existing jobs are not abruptly killed.
  Reads, status, checkpoints and cancellation keep their normal access rules.
- Bridge uses `openai/session` when supplied, scoped to its client identity, or an
  explicitly carried Bridge work-session token. Missing identity is reported as
  untracked; the project folder must not be used to guess which chat this is.
- Its own desktop receives `work_sessions` through owner-only Electron IPC. It
  also has local enable/disable and period-bound resume controls.
- MCP tool results include clock information. Calling those tools just to poll
  from Ditto is unsuitable: normal MCP handling can touch/create session state.
- Early finish uses `bridge_work_session`, or `bridge_status` with the same session
  action fields. A real finish receipt reports `action_result.action=finish`,
  `applied=true` and `phase=yielded`. Plain status is not proof of completion.
  Repeated identical finish requests are harmless; stale finish cannot end a newer
  reply. Ditto must display this receipt/state, not issue finish on the AI's behalf.
- Ditto's current connection verification proves a finite authenticated local
  command reached an I’m. It does not identify the originating chat, subscribe to
  Bridge clock state, or establish continuous provider connectivity.

The missing integration is a narrow read-only status connection and an explicit
association between a displayed chat and the relevant I’m/build, not another timer.

## Implementation design

1. **Expose minimal read-only status from Bridge.** Add a versioned, authenticated
   local display interface with feature discovery, Bridge instance identity,
   server time, configured boundaries, session ID, reply ID, period, phase, deadline,
   reply-identity source, whether the current call is advisory or enforced,
   last contact and checkpoint timestamp. Use a dedicated display credential;
   never give Ditto the existing Chaff/owner-control credential or read Bridge's
   entire private session store. Reads must not start, resume, extend or touch a
   period. Keep full notes out of the default snapshot; make any detail request
   explicitly owner-selected and preserve applicable protected-mode redaction.
2. **Add one shared Ditto adapter.** Discover the compatible local Bridge through
   its dedicated owner-local display record. No extra pairing wizard. No copied
   secrets, per-project setup ritual or repeated setup inside every generated I’m.
   Show the available chat clocks centrally; optionally let the owner associate
   one with an I’m or creator draft. Never infer a match from folder names or the
   current Ditto verification receipt. One reply using two I’ms keeps one clock;
   two chats using one folder keep separate identities and reply clocks.
3. **Render a compact badge and details panel.** Bridge remains authoritative;
   Ditto can interpolate the display between fresh snapshots but cannot invent
   new periods. Distinguish working, wrap-up, checkpoint requested, held,
   finished, awaiting-message, disabled, untracked, advisory, unsupported and
   disconnected/stale states. Label missing reply identity as advisory; never turn
   an expired displayed deadline into a host-wide or chat-wide lockout.
   Do not call a requested handover “saved” until one is recorded. Label notes
   as agent-reported and receipts as observed activity, not a verified backup.
   No manual reset is needed for a new message. Ditto does not generate reply IDs
   or auto-resume a period. Optional global enable/disable remains in Bridge's UI.
4. **Document and prepare private testing.** Update the creator guidance, connection
   help and release notes to explain “new message → work → checkpoint → finish”.
   The connected agent carries one new ID per new reply and confirms finish before
   reporting back; this guidance must match the inspected Bridge contract.
   Publish actual supported behaviour, not a promise that every ChatGPT timeout
   is prevented. Keep the private preview and current release assets unchanged
   rather than overwriting the old release. Publishing still requires approval.

Expected Ditto touchpoints: a small `ditto/bridge-status.mjs` adapter,
`ditto/server.mjs`, optional pairing/association settings in `ditto/setup.mjs`,
and the shared `ditto/ui/` shell. Update `DITTO_CONNECT.md`, creator instructions
and tests once the Bridge display contract exists. Do not copy Bridge's clock
engine into Ditto, change each example separately, or modify Chaff for this work.

## Finish with a focused check, not another research programme

Use isolated profiles and accelerated test clocks, with no provider calls needed:

- Two chats sharing a project remain independent; one reply across two I’ms retains
  its single deadline. Repeated display reads and reconnects do not change it.
- A new message before expiry gets a new 25 minutes. Early finish shows yielded;
  repeated finish is harmless and stale finish cannot close the newer reply.
  Missing markers remain advisory, without requiring an owner unlock.
- All three warning/hold boundaries, restart recovery and period changes display
  correctly; a prior-period checkpoint is clearly labelled.
- A stale, missing or incompatible feed is shown honestly. No fake “AI working”
  indicator, global access pause or interruption of unrelated local work results.
- Invalid display credentials and attempted control through the read interface
  are refused. Other chats' notes, provider identifiers and command/file contents
  are not broadcast to generated I’ms. Render returned text as untrusted content.
- Existing Bridge access, cancellation and job behaviour remain unchanged;
  accessibility checks cover keyboard use, labels and unobtrusive announcements.

Then check the new Ditto display through one short normal phone-chat exchange,
without interrupting active jobs. Verify two consecutive replies and early finish
in the displayed state. Do not wait 25 minutes for each automated test. The owner's
working Bridge is the starting point; the purpose is to check Ditto's integration,
not rebuild Bridge or I’m Accessibility.

## Limits to retain in the product wording

- This is a cooperative recoverability feature, not a hostile-agent sandbox.
  An agent-declared `work_turn_id` is not independent proof of a new user message.
- Bridge sees first tool contact, not the provider's internal turn start. It
  cannot interrupt disconnected reasoning or force a final ChatGPT message.
- Reconnection preserves a clock only when its client/session identity remains
  consistent. A provider/client/transport change is not proven to be the same chat.
- Same-user trusted-native apps are not isolated by UI tokens. The display
  interface limits accidental authority sharing; it does not create an OS sandbox.
- The inspected implementation has a 64-session creation limit. Define an
  owner-visible archive/capacity path before claiming indefinite everyday use;
  never silently evict an active session or reset its clock.

## Inspection record

Inspected the installed build and its local source/test records without invoking
Bridge tools, reading live chat notes, restarting apps or rerunning tests.

- The prior installed finish-hook build SHA-256 was:
  `b14bbc39fc8df2efe90d77cd63da1b05fa20b9cb04551fa3003faaadea9ae5ff`.
- Inspected `src/work-sessions.mjs` SHA-256:
  `8424cf8cff1e15e2a6a1f49ac5810ea53a5cfa0013124789d907e1c6eaae95f7`.
- Inspected `src/mcp.mjs` SHA-256:
  `36b40379e108e81d0f6c5b2442f40208147e63d2ad24e2e95b9d1d9a4ed6c930`.
- Desktop source confirms clock state is exposed to its own owner UI. The
  existing Chaff control endpoint has no work-clock display route.
- `MESSAGE_TIMER_RESULT.json` records the per-message correction;
  `FINISH_HOOK_RESULT.json` records 20 passing focused tests, 25 file-transfer
  checks and desktop checks. These are recorded results, not tests rerun here.
  The finish-hook engineering record did not confirm phone transport; the owner
  subsequently reports normal use now works. Do not turn that report into a claim
  that no future provider timeout is possible.

Preview 6's installed Bridge display-build SHA-256 is
`79612cd3db946be31670440c0a81ca6fb75638e4a47f69b56eb835dd181c00ec`.
The per-message timer and MCP implementations listed above remain byte-identical.
The previous archive is retained as a rollback backup outside the distributable.
