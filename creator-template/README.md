# Make your own I’m

The easiest route is **Make my I’m** in the dashboard: it copies the production starter into a separate draft folder and provides a tailored brief/build command. Preserve its generated app id and return the package at the specified output path; the owner reviews and installs through the dashboard. The generated `BUILD_BRIEF.json` and `BUILD_REPORT.md` belong outside the production source.

For a manual developer workflow, copy this directory into a new folder and follow the steps below. It is a working tiny notes workspace, not an implementation of an arbitrary brief. Human and CLI controls share the same data and revisions.

1. Choose a lowercase unique `id` in im.json. Rename the app, description, permissions, version and CLI instructions. Update the app name in /api/health too.
2. Keep the v1 `start({dataRoot,packageRoot,port,instanceId}) -> {url,close}` contract. Never write into packageRoot. Save user work only under dataRoot. Bind 127.0.0.1, port 0. Clean up your own jobs in close().
3. Build your UI and domain logic. Keep mutation authentication, input limits, correct revision handling and path checks. A package is trusted native code, not sandboxed.
4. Test it using a new empty data folder, two controllers, restart and deliberately bad inputs. Do not ship tests, logs or personal data inside the production bundle.
5. From the foundation: `node ditto/build.mjs pack YOUR_FOLDER OUTPUT.impack.json`. Place that bundle in im-catalogue and restart the host to review/install it. The bundle hash pins its bytes, not publisher identity.
6. For an update, increment x.y.z. Keep dataVersion 1 compatible. Install while the app is stopped; data is retained. Never implement silent incompatible migrations in this preview. Rollback switches to the previous retained code release.

Example creator prompt: “Using this starter, build an I’m for [job]. Keep the host contract, provide browser and finite CLI control of the same saved work, document permissions honestly, and run a real example plus persistence and bad-input tests. Do not modify the core or add credentials.”

## Reuse and notices

The original starter code and these instructions are MIT licensed in `LICENSE-DITTO-STARTER.txt`. Keep that file and `NOTICE-DITTO-STARTER.md` with copied code in both manual copies and dashboard builds. The production package command includes them; preserve them in updates too.

You can sell your own app or give it away, subject to the notices and any other material's terms. Your own additions may have separate terms, for example in `APP_LICENSE.md`; the starter does not automatically make the whole generated app MIT. Do not copy the host's restricted code into your app assuming it is starter code. The host and retained legacy dependencies have separate licences.

This is the local creator workflow. Store publication, payment processing, signatures and hostile-code isolation are not implemented.
