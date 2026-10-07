// Educational reconstructions of recorded builds, not verbatim chat transcripts.
// Selecting a brief fills an editable form; it never creates or installs an app.
export const creatorWalkthrough={
  id:'rehearsal-journey',name:'From a sentence to your own workspace',
  tag:'A real creation journey · not an app to install',
  summary:'We gave the creator one sentence about rehearsal planning. The connected AI built a different workspace from the starter. Follow the same method with your own job.',
  brief:'Keep a set list and practice notes, let me and my AI edit them, and export a session plan.',
  briefLabel:'The exact brief used for this build',
  steps:[
    ['1 · Say what your I’m should do','On Make my I’m, give it a name and describe the work, the controls you need and the output you want. This brief asked for a set list, shared practice notes and an exported plan—not a prebuilt example.'],
    ['2 · Give your connected AI the prepared prompt','Choose Prepare my I’m, then copy the generated prompt into your existing Bridge-enabled ChatGPT chat or local Codex task. The AI needs access to that build folder. The prompt identifies the separate starter, the shared-work contract, the tests and the package destination. Preparation alone has not built your app.'],
    ['3 · Ask for evidence, then review','Ask the AI to implement your brief, test it and report limitations. Return to the saved build and choose Check finished package. Inspect the source, files and declared access before trusting it. This rehearsal build passed an independent rerun of 21 core checks; a reported green test is not a security guarantee.'],
    ['4 · Try a small job both ways','Open the installed I’m, save something through its interface, and ask your connected AI to edit that same project. Read the app’s instructions and inspect first. Check the real output; then stop and reopen to test persistence.'],
    ['5 · Make it more personal','Describe one missing feature. Ask the AI to change the editable source, preserve existing saved work, test it and package a new version. Review that version before updating. Do not ask it to modify installed release files.']
  ],
  evidence:'This walkthrough comes from an existing Bridge-connected chat and a separate profile on the developer’s PC, with supervising Codex performing review and acceptance checks. It is not a clean-machine or independent novice test. Screenshots are recorded milestones, not continuous real-time footage. Native apps run as your Windows user, not inside an OS sandbox.',
  variation:'My own workspace',button:'Adapt this brief for my idea'
};
export const recipes=[
  {
    id:'bridge',name:'01 · A personal Bridge',tag:'A workspace around one person’s way of using AI',
    summary:'The original I’m: the owner’s connection between an AI conversation and the Windows work he chooses to share.',
    brief:'Design a personal AI workspace around my daily work. Let me choose which project folders are available, see what my AI is doing, review changes, and stop work locally. Start by discussing the controls and outputs I need. Reuse my existing authorized connection; do not copy credentials, widen access, or claim a secure sandbox.',
    steps:[['The job','Make an AI conversation useful on the owner’s PC, with visible work and local owner controls. This personal Bridge was I’m #1.'],['What became personal','The workflow, project controls and feedback were shaped around the owner’s needs. The connected Bridge was also used to help build further features.'],['What to borrow','Describe your own workflow and controls. For a first I’m, build a focused workspace on the existing connection; reproducing a general-purpose Bridge is a larger engineering job.']],
    evidence:'This is the existing personal Bridge, not a third bundle or a newly tested Ditto build. Its installed connection is preserved separately. Selecting this brief provides no new transport, credential setup or protection.',
    variation:'My personal workbench',button:'Adapt the workbench brief'
  },
  {
    id:'studio',appId:'im-studio',name:'02 · A music-video studio',tag:'Pictures + music → a finished video',
    summary:'An interface for images, a soundtrack, shots, captions, preview and export—shaped around making videos.',
    brief:'Build a workspace where I can bring pictures and a music track, arrange a sequence, change captions and durations, preview it, and export an MP4. Let me and my connected AI edit the same saved project. Keep rendering local and cancellable. Supply original demo material and finite AI commands. Before adding tools or dependencies, explain what is needed and ask me.',
    steps:[['Start with the output','The brief asked for a real music video from pictures and a soundtrack, plus hands-on controls for sequence, captions and timing.'],['Build the shell through the Bridge','Browser ChatGPT worked through the existing PC Bridge to create the job-specific application. Its interface and finite commands operate the same saved project.'],['Connect it to the foundation','Supervising Codex added a host adapter and separated editable project data from packaged code. The original Studio and its projects stayed separate. This was a collaborative build, not unassisted one-shot generation.'],['Try real work','The hosted Neon Atlas example rendered a 20-second, 1280×720 MP4 with sound. Playback and full decoding were checked; local lifecycle tests also cover cancellation and retained work.']],
    evidence:'Recorded milestone screenshots and receipts support the build and integration, not a continuous recording. The setup tutorial explains connection/use; it is not a recording of this entire construction. This optional example needs FFmpeg and FFprobe.',
    variation:'My video workspace',button:'Adapt this video brief'
  },
  {
    id:'board',appId:'im-board-games',name:'03 · A board-game workshop',tag:'An idea → rules, cards and a printable kit',
    summary:'A different kind of work using the same foundation: editable game rules, cards, saved projects and exports.',
    brief:'Build a workshop for inventing tabletop games. I want editable rules, cards and a board, saved projects, a printable HTML prototype and a JSON backup. Make one original demo with no borrowed characters or artwork. Let me and my connected AI edit the same project. Test a real edit and export, restart persistence, stale edits and bad inputs. Do not claim the game has been playtested.',
    steps:[['Change the job, not the connection','The next brief asked for a tabletop-game workshop. It used the existing connection and the same I’m host contract, rather than creating a second transport.'],['Build in a separate folder','Browser ChatGPT was asked to implement the workshop in its own example folder, leaving the host and Studio alone. Rules, cards, board controls, saved projects and exports were the domain-specific parts.'],['Make human and AI changes meet','Through Bridge, the AI edited the hosted Lantern Circuit project and exported HTML and JSON. The interface showed that same saved work. Supervising Codex separately checked host integration and owner controls.'],['Check an actual output','The source tests passed 10/10 in the recorded build. The printable kit and JSON export were inspected. No physical print or human playtest was claimed.']],
    evidence:'This is a reconstruction of the recorded steps and a reusable starting brief, not the verbatim chat or an uninterrupted autonomous recording. Use it to specify your own workshop; a new build still needs its own tests.',
    variation:'My tabletop workshop',button:'Adapt this workshop brief'
  }
];
