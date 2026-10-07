# Help make I’m-Ditto useful

I’m-Ditto is an early creator-first preview. Please keep contributions small, tested and focused on helping people build and use their own workspaces.

Useful feedback starts with a real job: what you wanted to make, where you got stuck, what the screen said, and what you expected instead. Leave passwords, connection codes, personal projects and private chat history out of reports.

Keep creation as the main journey. Worked examples should teach a method, not become compulsory installations. Use ordinary language, visible owner controls and honest error messages.

For code changes: use Node 22+, run `npm run test:core` and `npm run check:release`, and use a new test profile. The release check needs full Git history, not a shallow checkout. No dependency installation is required. Run `npm test` as well when FFmpeg and FFprobe are available; this includes the real Studio render test. Record skipped checks honestly. Do not test with another person’s saved work. Preserve revision checks, exact-package review, separate mutable data and immutable releases. Never treat an AI build report as independent verification.

The Windows workflow runs core checks on Node 22 and 24 with read-only repository permissions. It does not publish a release, change access settings or run against installed Bridge or user profiles. It is not a clean-machine installation or hostile-code containment test.

For an ordinary problem, use the bug-report form and [support guide](docs/SUPPORT.md). Submit only code and assets you have permission to contribute, and identify their existing licences. The contribution checklist does not itself assign copyright or change the current licence.

Follow the per-file schedule in [LICENSE](LICENSE), not a blanket MIT assumption. Clearly identify code copied from elsewhere and its licence. Contributions intended for inclusion must be offered under the applicable file terms by someone entitled to grant them; if different terms are needed, state that before submission. No copyright assignment or right to relicense an existing contributor's work is inferred from a pull request or test pass.

Proposed changes to distribution, licensing, permissions, model billing or the future store require owner review. The company launcher is included in the current Core schedule; existing grants remain unchanged. The general contribution requirements above still apply to future contributions.
