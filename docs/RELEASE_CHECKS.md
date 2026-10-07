# Release checks

## Required launcher check — added in preview 7

Do not count `tests/portable-welcome-smoke.mjs` as browser-launch coverage: it uses
`--no-open`. For each Windows release, additionally run the packaged
**Launch Im-Ditto.cmd** in an isolated copy/profile with normal browser opening
enabled. Confirm the default browser opens that host's exact address and the
creator screen actually loads. Merely accepting the Windows open request is not
proof of page load. Stop only the test host afterward; preserve user sessions.

Preview 7: passed on 6 October 2026. CMD exited 0; the new Edge tab showed the
matching URL, creator UI and preview 7 footer through browser accessibility.
Screen capture was unavailable, so no screenshot or visual-layout pass is claimed.
48/48 host tests (with the external Bridge module) and the separate portable
smoke also passed. A default source-only suite skips one external Bridge test.

## Preview 5 record (preserved)

Validation date: 6 October 2026. These are same-PC checks, not a clean-OS installation study. No credential or raw process log is included.

## Completed checks

- Host regression suite: 35/35 passed.
- Rehearsal 0.1.1 duplication/compatibility suite: 15/15 independently passed.
- Rehearsal source/package match: 9/9 production files; unchanged declared access and data version.
- Live update: pre-existing project, HTML export and metadata remained byte-identical before feature use.
- UI and finite-command duplication both worked; revision 7 and four songs survived restart; original export unchanged.

## Portable and export checks

- Portable fresh-profile smoke test passed with global Node and FFmpeg excluded from PATH. The included runtime launched the host, a second launch reused it, and the profile started with zero installed apps.
- Missing optional Studio dependencies were reported correctly. Board-game installation, finite commands, real HTML/JSON exports, restart persistence and connection-check invalidation passed.
- A separate starter fixture completed prepare/package/review/install/start/connection-check. This mechanical fixture is not presented as AI creation evidence.
- The host-only smoke test made zero provider calls and closed its temporary host and apps.
- Curated source export excludes private profiles, original Git history, connector material, chat exports and local test output. Text/package-member credential-pattern scanning and local guide links passed. Pattern checks are not a security certification.
- GitHub repository `Martin123132/im-ditto` was created private and its visibility independently read back as private. Final archive identity is supplied with the private release rather than embedded in this document.

## Tutorial status

The existing approved setup MP4 is included. The new creation film is 180 seconds, with six actual-milestone chapters. Runtime/layout/caption checks passed and the seven-frame contact sheet was visually inspected. Its composition and assets are included for review; final MP4 export awaits the owner's visual approval, as required by the video workflow.

## What these checks do not establish

No clean Windows VM installation, independent novice test, publisher authentication, hostile-code containment, complete accessibility audit or guarantee of arbitrary-app generation is claimed. Apps run with the current Windows user's privileges.
