# Third-party notices — I’m-Ditto preview

This clean I’m-Ditto repository retains the required PC Bridge core modules and original licence notices. It does **not** bundle the upstream desktop, tunnel client or npm dependencies listed in the historical section below. The public PC-Bridge repository retains that upstream distribution. No third-party component is relicensed by this extraction.

The portable Windows archive additionally includes the official Node.js runtime and its full licence at `runtime/LICENSE-node.txt`, copied from `runtime-notices/`. The Ditto host uses Node built-ins. FFmpeg/FFprobe are optional external prerequisites for Studio and are not bundled or silently installed.

The separately included creation-tutorial source uses GSAP and bundled font assets with their notices retained inside that tutorial directory. It is not a runtime dependency of Ditto.

## Historical upstream notice (preserved for provenance)

PC Bridge original Two Hands Network Ltd code retains the dual source-available terms identified in LICENSES/Legacy-PC-Bridge-Ditto.md. The entries below describe third-party software only.

Direct npm dependencies in v0.5.16 are permissively licensed:

- `@maxoperf/tunnel` 0.1.1 — MIT
- `@modelcontextprotocol/core` 2.0.0 — MIT
- `@modelcontextprotocol/node` 2.0.0 — MIT
- `@modelcontextprotocol/server` 2.0.0 — MIT
- `express` 5.2.1 — MIT
- `zod` 4.4.3 — MIT

The upstream PC Bridge distribution also bundled the official OpenAI tunnel client for Windows:

- OpenAI tunnel-client v0.0.14
- Apache License 2.0
- executable SHA-256: `fcc85a69ec0ad82518e4f8964f60c45e31787957782a0fc9c1b0c44e82d61b9b`

Its original licence, dependency licences, notice and SPDX data remain in the upstream PC Bridge `vendor/` directory, not in this clean Ditto extraction.

No Cloudflare executable is included in this repository.
