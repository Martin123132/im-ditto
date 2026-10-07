# I’m-Studio — AI operating guide

This is a local image/music-video editor, not an AI generation endpoint. Use the same saved project as the human. No account or paid model calls are embedded.

From the I’m-Ditto foundation folder:

    node ditto/cli.mjs list
    node ditto/cli.mjs call im-studio -- help
    node ditto/cli.mjs call im-studio -- projects
    node ditto/cli.mjs call im-studio -- inspect

Ask what the user wants changed. Read the current project and retain its ID/revision. Use `--project ID --revision NUMBER` for edits to avoid silently editing a different or changed project. Consult `help` for exact options. Finite render start/status/cancel commands leave the UI open. Do not wait for a long render in the same Bridge call when progress can be polled.

Examples (substitute observed IDs):

    node ditto/cli.mjs call im-studio -- create --name "My music video"
    node ditto/cli.mjs call im-studio -- set --format portrait --project PROJECT_ID --revision 16
    node ditto/cli.mjs call im-studio -- shot edit SHOT_ID --caption ORBIT --project PROJECT_ID --revision 17
    node ditto/cli.mjs call im-studio -- render start --project PROJECT_ID
    node ditto/cli.mjs call im-studio -- render status RENDER_ID
    node ditto/cli.mjs call im-studio -- render cancel RENDER_ID

Only import files the user has put in scope. Do not alter release files, the package registry, installed Bridge/Chaff, or security settings. Installation and app start belong to the local owner/dashboard. If stopped, say so. No alternate daemon brokers. The host supplies `--url` automatically.

Version 0.1 supports pictures plus one soundtrack, 24fps 720p landscape/portrait, shot captions and fades, and one render at a time. It is not a video-clip editor. Node, FFmpeg and FFprobe are required. Projects/outputs live outside immutable application releases and survive app removal/update.
