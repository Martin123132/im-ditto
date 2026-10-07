# Local command interface

Run from `D:\PC-Bridge-Public-Demo\im-ditto-studio-example` after the owner starts the studio locally with `Launch-Studio.cmd`. Every success is JSON on stdout. Every failure is JSON on stderr with a nonzero exit code.

```powershell
Set-Location 'D:\PC-Bridge-Public-Demo\im-ditto-studio-example'
node studio.js help
```

Replace uppercase IDs below with IDs returned by `inspect`, `projects`, `render start` or `render list`. Use quoted paths for filenames containing spaces.

## Project and media commands

| Command | Effect |
| --- | --- |
| `node studio.js status` | Server identity, installed versions and active project; excludes the local mutation token |
| `node studio.js projects` | List saved projects and the active selection |
| `node studio.js create --name "My video"` | Create a saved project |
| `node studio.js select PROJECT_ID` | Change the shared active project |
| `node studio.js inspect` | Read the full current saved project, asset IDs, shot IDs and revision |
| `node studio.js inspect --project PROJECT_ID` | Read a specified saved project |
| `node studio.js import "demo-assets/01-signal.png" --kind image` | Copy one chosen picture into the active project |
| `node studio.js import "demo-assets/neon-atlas-original.wav" --kind audio` | Copy one chosen soundtrack into the project |
| `node studio.js set --name "New title" --format portrait` | Change project name and/or format |
| `node studio.js shot add ASSET_ID --duration 4 --caption "Opening"` | Append an image shot; defaults are 4 seconds and an empty caption |
| `node studio.js shot edit SHOT_ID --duration 3.5 --caption "New caption"` | Change duration and/or caption; use `--caption=` to clear it |
| `node studio.js shot move SHOT_ID --to 1` | Move a shot to a one-based storyboard position |
| `node studio.js shot remove SHOT_ID` | Remove a storyboard shot; the imported asset remains available |
| `node studio.js audio set ASSET_ID` | Choose the project's soundtrack |
| `node studio.js audio set none` | Clear the soundtrack selection |

## Render commands

| Command | Effect |
| --- | --- |
| `node studio.js render start` | Snapshot the current saved revision and start rendering; returns a render ID |
| `node studio.js render list` | List render jobs for the selected project |
| `node studio.js render status RENDER_ID` | Get current status, progress and output metadata |
| `node studio.js render wait RENDER_ID` | Poll every 750 ms until completed or a terminal failure |
| `node studio.js render wait RENDER_ID --timeout 120` | Stop waiting after 120 seconds; this does not cancel the render |
| `node studio.js render cancel RENDER_ID` | Cancel that studio-owned render |
| `node studio.js render open RENDER_ID` | Ask the local studio to open the completed MP4 |

`render wait` exits successfully only for `completed`. It exits nonzero for `failed`, `cancelled`, `interrupted` or timeout. Ctrl+C stops the wait command; use `render cancel` explicitly to cancel the job.

## Shared state and concurrent edits

Both the browser UI and CLI edit `data/projects/PROJECT_ID/project.json` through the same server. `select` changes the active selection saved in `data/session.json`. No second project representation or chat-only copy is used.

Mutating commands read the current project revision immediately before requesting the change. The server rejects a stale revision. For an exact expected state, add `--project PROJECT_ID --revision N` to project edits, imports or render start. A conflict is reported; the CLI does not silently fetch and overwrite somebody else's newer edit.

```powershell
$p = node studio.js inspect | ConvertFrom-Json
node studio.js shot edit $p.shots[0].id --caption 'ORBIT' --project $p.id --revision $p.revision
```

Use `--url http://127.0.0.1:8788` when running on a different local port. Only HTTP loopback URLs are accepted. The CLI obtains a per-session local token from `/api/health` and adds it to mutations. The token is an application boundary for the loopback interface; the studio is a local application, not a multi-user access service.

## App lifecycle and Bridge control

Use the ordinary Local PC Bridge Test connection and explicit Bridge project ID `731c5ded-33e2-43c5-98d9-7782cbbfb5b5`. Set `cwd` to `im-ditto-studio-example` for every command. The studio's saved project IDs are different from this Bridge project ID.

| Command | Effect |
| --- | --- |
| `node tools/app-lifecycle.js start --open` | Owner's normal local terminal only: start or reuse this folder's studio and open its browser |
| `node tools/app-lifecycle.js status` | Check app/root/PID/instance identity and report the local URL |
| `node tools/app-lifecycle.js open` | Open the running studio without creating another server |
| `node tools/app-lifecycle.js stop` | Request graceful shutdown of the exact recorded live app instance |
| `node tools/app-lifecycle.js restart --open` | Owner's normal local terminal only: stop and reopen, preserving saved projects and outputs |

**Required setup:** the owner must double-click `Launch-Studio.cmd` outside Bridge once. A persistent Bridge-managed server occupies this connector's command lane, and Bridge cleanup ends background children launched from its commands. This example does not bypass that cleanup boundary. Startup and restart belong in the owner's normal local terminal; status, editing, render control and graceful stop can use finite Bridge commands after local startup.

`start` launches Node directly from the owner's normal local desktop terminal. Its process record is `data/app-process.json`; logs are `data/app-stdout.log` and `data/app-stderr.log`. `stop` checks the live PID, instance ID, app and folder against that record, then calls the studio's token-protected stop endpoint. A PID on its own is never used to authorize a stop.

Once the owner has launched the app locally, finite Bridge CLI commands connect while the app and browser remain open. Start a render with a short command, then use separate status or cancel commands as needed. If you choose a long `render wait` managed job, it occupies this connector's project lane until that wait ends; stopping the wait leaves the app's render running.

**Connect to the owner-launched studio and inspect the shared project:**

> Use Local PC Bridge Test. First call bridge_status with project_id 731c5ded-33e2-43c5-98d9-7782cbbfb5b5. Work only in D:/PC-Bridge-Public-Demo/im-ditto-studio-example. Run node tools/app-lifecycle.js status. If the app is stopped, tell the owner to double-click Launch-Studio.cmd locally; do not try another persistent Bridge launch route. Once local startup is confirmed, check status again and run node studio.js inspect as a separate Bridge command. Report the actual saved project and shot order. Keep the local studio running for further edits.

**Repeat the agreed portrait edit on a fresh demo copy and render:**

> Through the same Bridge project and cwd, run node tools/demo.js --new to create and select a separate fresh landscape demonstration while preserving the delivered Neon Atlas. Inspect the new active project with node studio.js inspect. Move its third shot to position 1 using the returned shot ID; change the new first shot's caption to ORBIT; set portrait format while keeping every duration unchanged. Use current revisions for changes. Start a render with node studio.js render start, retain its returned ID, and check that ID in subsequent short commands while the studio stays open. Report the actual completed output path and probe metadata.

**Cancel a render while the browser stays open:**

> Through Local PC Bridge Test with project_id 731c5ded-33e2-43c5-98d9-7782cbbfb5b5 and cwd im-ditto-studio-example, run node studio.js render list. Cancel the running studio render by its returned ID with node studio.js render cancel. Read that job's status and report the result. Leave the app and project open.

**Stop and reopen the app:**

> In the same authorized Bridge project and folder, run node tools/app-lifecycle.js status, then node tools/app-lifecycle.js stop. Report the recorded instance and actual stop result. To reopen it later, the owner double-clicks Launch-Studio.cmd locally. After that, inspect the saved project through Bridge.

### Optional finite batches

`tools/bridge-session.js` supports a structured batch in one managed job. For example, save the following as `evidence/my-edit.json` with the real IDs substituted:

```json
[
  ["inspect", "--project", "PROJECT_ID"],
  ["shot", "move", "THIRD_SHOT_ID", "--to", "1", "--project", "PROJECT_ID"],
  ["shot", "edit", "THIRD_SHOT_ID", "--caption", "ORBIT", "--project", "PROJECT_ID"],
  ["set", "--format", "portrait", "--project", "PROJECT_ID"],
  ["render", "start", "--project", "PROJECT_ID"]
]
```

```powershell
node tools/bridge-session.js --batch evidence/my-edit.json
node tools/bridge-session.js -- inspect
node tools/bridge-session.js --seed-demo -- render start
```

Only CLI argument arrays are accepted; there is no shell or JavaScript evaluation. Batch files and batch imports stay under this example folder. Put `--url` on the runner, not inside individual batch entries. The runner outputs one final JSON result; progress, when waiting for a render it owns, is written as JSON lines on stderr.

The runner reuses only a server whose app and exact storage root match. If no server is running, it starts one in that managed Node process, runs the commands, waits for each render it starts to reach a terminal state, and closes its own server. When it shares the normal recorded app, render start returns promptly and the app continues rendering.

`--preview` can keep a temporary server alive after a successful batch, but that foreground managed job occupies this connector's project command lane. If such an optional preview was started, stop its recorded owned Bridge job with `bridge_process_cancel` before submitting another command, then have the owner double-click `Launch-Studio.cmd` locally for normal ongoing work. Cancelling a managed tree that owns a render interrupts that render; its saved state is reconciled when the app restarts. UI/CLI render cancellation addresses the running render directly.

## Local HTTP contract

The CLI is the supported command surface. The API is documented here for another local client that needs the same saved project. Successful calls return JSON. Errors return `{ "error": "message", "code": "MACHINE_CODE" }` with a non-success HTTP status.

| Method and path | Body or result |
| --- | --- |
| `GET /api/health` | `{ok, app, token, versions, activeProjectId, root, pid, instanceId, startedAt}` |
| `POST /api/app/stop` | `{instanceId}` → request graceful shutdown of that verified local app |
| `GET /api/projects` | `{projects, activeProjectId}` |
| `POST /api/projects` | `{name}` → saved project |
| `POST /api/session` | `{projectId}` → selection |
| `GET /api/projects/PROJECT_ID` | Full saved project |
| `POST /api/projects/PROJECT_ID/edit` | `{revision, action, ...fields}` → saved project |
| `POST /api/projects/PROJECT_ID/media?name=FILENAME&kind=image` | Raw file bytes, `X-Project-Revision` → saved project |
| `GET /api/projects/PROJECT_ID/media/ASSET_ID` | Imported media bytes |
| `POST /api/projects/PROJECT_ID/render` | `{revision}` → render job |
| `GET /api/renders?projectId=PROJECT_ID` | `{jobs}` |
| `GET /api/renders/RENDER_ID` | Render job |
| `GET /api/renders/RENDER_ID/video` | Completed MP4, with HTTP byte-range support; incomplete outputs are rejected |
| `POST /api/renders/RENDER_ID/cancel` | Cancel the specified job |
| `POST /api/renders/RENDER_ID/open` | Open a completed output |

All mutations require `X-Studio-Token`. JSON operations use `Content-Type: application/json`; uploads use `application/octet-stream`. The media `kind` query accepts `image` or `audio`.

Edit actions:

| Action | Fields |
| --- | --- |
| `set-project` | `name?`, `format?` (`landscape` or `portrait`) |
| `add-shot` | `assetId`, `duration`, `caption` |
| `update-shot` | `shotId`, `duration?`, `caption?` |
| `move-shot` | `shotId`, `toIndex` (zero-based API index; CLI `--to` is one-based) |
| `remove-shot` | `shotId` |
| `set-audio` | `assetId` (audio ID or null) |

Project shape: `{schemaVersion:1,id,name,revision,createdAt,updatedAt,format,fps:24,fade:0.25,assets,shots,audioAssetId}`. Asset records include IDs, kind, name, stored filename and probe metadata. Shot records are `{id,assetId,duration,caption}`. Render terminal states are `completed`, `cancelled`, `failed` and `interrupted`.

Completed job metadata contains `outputFile` relative to the example folder and a verified `probe`. Use these returned values instead of constructing an output filename from user input. Media and output routes address owned IDs; the API does not accept a shell command or arbitrary filesystem read.

## Completed build evidence

[BUILD_REPORT.md](BUILD_REPORT.md) records the supervisor-assisted normal local launch, seven passing independent finite Bridge control stages, the unchanged selected demo and export hashes, and focused test-coverage limits. The completed machine-readable record is `evidence/integration-status.json`; full control receipts are in `evidence/concurrent-control.json`.
