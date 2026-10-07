# Rehearsal desk · walkthrough source

This is the inspected 0.1.1 source produced by the connected ChatGPT build, retained so reviewers can examine a real result. It is **not** a fourth catalogue item or a required app.

Read [the creation story](../../docs/CREATOR_JOURNEY.md). To make your own workspace, use Make my I’m and adapt the brief; Ditto will assign your build its own identity.

The source keeps the original demonstration app ID and contains no saved rehearsal or credentials. `evidence/previous-0.1.0.impack.json` is the unchanged earlier code package, used only by compatibility tests. It is not a live profile.

From this directory, with Node 22+:

```sh
node tests/core.cjs
node tests/duplicate.cjs
```

These checks run local test servers with unique test-only data directories, stop them, and leave test receipts under `tests/runs/` (ignored by Git). They do not install into the owner’s live host. The original browser tests were performed during construction; browser automation and machine-local browser profiles are deliberately not included here.

Original content identities: 0.1.0 `c5023902ac761d982628bae3d229bbea4da34784e852d913901e3c0bf5a49aab`; 0.1.1 `ac9a45bb4ac3de153300a92afc1a9b69e22b14ce12254369c00097d9515c5f40`.

Limits: one saved rehearsal, 100 songs, no audio recording/playback, metronome, session library or JSON-import UI. Native trusted code, not an OS sandbox.
