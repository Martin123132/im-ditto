# I’m-Ditto release notes

The current release candidate is **0.1.0-preview.8**: creator licensing and notice preservation, support information, and automated Windows source checks. It retains the creator-first workflow, corrected Windows launcher and optional Bridge reply clocks.

[Download preview 8](https://github.com/Martin123132/im-ditto/releases/tag/v0.1.0-preview.8) · [Preview 8 changes](releases/0.1.0-preview.8.md)

## Unreleased source changes

- Keep unchanged Bridge clock details and selector labels in place during polling, and reuse date/time formatters. Countdown text, handovers, selection and protected-mode updates still refresh normally.
- Ignore late clock responses after the panel is removed. Synthetic UI tests cover unchanged content, selection, slow requests, hidden pages and error recovery.
- The PC Bridge desktop and receipt-history memory fixes live in the separate [PC Bridge source repository](https://github.com/Martin123132/PC-Bridge). This host does not bundle that desktop. Existing preview downloads are unchanged.

## Earlier versions

These notes are historical records. Their original archives remain separate and unchanged; they are not preview 8 downloads.

- [Preview 7](releases/0.1.0-preview.7.md): default-browser launcher correction.
- [Preview 6](releases/0.1.0-preview.6.md): optional Bridge reply-clock display.
- [Preview 5](releases/0.1.0-preview.5.md): creator-first private review release.

The designated starter is MIT licensed from preview 8, with separate terms for the host and inherited material. See [your creator rights](../CREATOR_RIGHTS.md) and the [file schedule](../LICENSE).
