# Preview trust boundary

I’m-Ditto 0.1 is a trusted-native application package host, not an OS sandbox, a malware scanner or a completed public marketplace.

- Bound to 127.0.0.1 only; strict Host/Origin and browser fetch-site checks; no public listener/tunnel is created.
- Owner/dashboard session is separate from the tool session. Tools discover and operate running apps; install/start/update/rollback/remove require the local owner session.
- Install checks a reviewable manifest, limits and exact content hashes. The owner trusts the exact bundle SHA-256; the hash is not a publisher signature and does not certify safety.
- Package traversal, case-collision, device paths and symlink/junction paths are rejected. Immutable code is rehashed before launch/CLI execution. Updates stop first, retain old releases, and preserve the app's separate data folder.
- Each app is a host-owned child process with graceful shutdown. Its own external-tool cleanup is part of its tested contract. Processes run as your Windows user. Native code can access resources beyond declared permissions; the manifest is not OS enforcement.
- Same-user malicious software or a malicious trusted package is outside this boundary. Do not install unreviewed third-party packages. No security certification is claimed.
- Existing PC Bridge/Chaff and their access policies are not changed. The upstream BridgeCore is used in a separate paused/read-only profile for durable receipts; its transport and personal UI stay separate from the new shell/package host.
- No arbitrary download/install hooks, automatic AI-authorized package grants, store payments, silent upgrades or credential copying.

Before a public executable marketplace: establish signing/identity, a review/update policy, stronger app isolation or an explicit trust model, supply-chain and abuse handling, and independent security assessment. This build does not claim those are complete.
