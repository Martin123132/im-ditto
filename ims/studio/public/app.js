'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const state = {
    token: '', project: null, projects: [], selectedShotId: null,
    dirtyName: false, dirtyShot: false, busy: 0, remote: null, polling: false, generation: 0, frameRequest: null,
    filter: 'all', jobs: [], jobId: null, previewMode: 'live', loadedOutput: null,
    playing: false, time: 0, previousFrame: 0, images: new Map(),
    audio: new Audio(), audioId: null, volume: 0.75, muted: false,
    toastTimer: null, connected: false, dragId: null
  };
  const canvas = byId('preview-canvas');
  const context = canvas.getContext('2d');
  const audio = state.audio;
  audio.id = 'studio-audio';
  audio.hidden = true;
  document.body.appendChild(audio);
  audio.loop = true;
  audio.preload = 'metadata';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = id => '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  const path = suffix => '/api/projects/' + encodeURIComponent(state.project.id) + (suffix || '');
  const assetUrl = id => path('/media/' + encodeURIComponent(id));
  const asset = id => state.project?.assets.find(item => item.id === id);
  const selectedShot = () => state.project?.shots.find(shot => shot.id === state.selectedShotId);
  const isDirty = () => state.dirtyName || state.dirtyShot;
  const finished = job => job && ['completed', 'succeeded'].includes(job.status);
  const inProgress = job => job && ['queued', 'running', 'rendering', 'cancelling'].includes(job.status);
  const selectedJob = () => state.jobs.find(job => job.id === state.jobId) || state.jobs[0] || null;
  const seconds = value => (Math.round(Number(value || 0) * 10) / 10).toFixed(1);
  const clock = value => {
    const n = Math.max(0, Number(value) || 0);
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + (n % 60).toFixed(1).padStart(4, '0');
  };
  const bytes = n => n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  async function api(url, options = {}) {
    const method = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    if (method !== 'GET') headers['X-Studio-Token'] = state.token;
    let body = options.body;
    if (body !== undefined && !options.raw) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(url, { method, headers, body, cache: 'no-store' });
    let value;
    try { value = await response.json(); } catch { value = { error: 'The studio returned an unreadable response (' + response.status + ').' }; }
    if (!response.ok) {
      const error = new Error(value.error || 'Request failed (' + response.status + ').');
      error.status = response.status;
      error.code = value.code;
      throw error;
    }
    return value;
  }

  function toast(message, error = false) {
    const el = byId('toast');
    clearTimeout(state.toastTimer);
    el.textContent = message;
    el.classList.toggle('is-error', error);
    el.hidden = false;
    state.toastTimer = setTimeout(() => { el.hidden = true; }, error ? 9000 : 4000);
  }

  function connection(ok, message) {
    state.connected = ok;
    byId('connection-error').hidden = ok;
    byId('connection-error').textContent = ok ? '' : message;
    refreshStatus();
  }

  function refreshStatus() {
    const indicator = byId('save-indicator');
    indicator.classList.toggle('is-dirty', !!isDirty());
    indicator.classList.toggle('is-error', !state.connected || !!state.remote);
    byId('save-label').textContent = !state.connected ? 'Disconnected' :
      state.busy ? 'Working…' : state.remote ? 'Saved changes waiting' :
      isDirty() ? 'Unsaved fields' : state.project ? 'Saved · v' + state.project.revision : 'No project open';
    byId('save-project').disabled = !state.project || !isDirty() || !!state.busy || !!state.remote;
    byId('apply-shot').disabled = !state.dirtyShot || !!state.busy || !!state.remote;
    byId('project-name').disabled = !state.project || !!state.busy;
    byId('new-project').disabled = !!state.busy;
    for (const id of ['shot-duration','shot-caption','duration-minus','duration-plus','remove-shot']) byId(id).disabled = !!state.busy;
    const shotIndex = state.project?.shots.findIndex(shot => shot.id === state.selectedShotId) ?? -1;
    byId('move-earlier').disabled = !!state.busy || shotIndex <= 0;
    byId('move-later').disabled = !!state.busy || shotIndex < 0 || shotIndex >= (state.project?.shots.length || 0)-1;
    byId('project-picker').disabled = !!state.busy;
    byId('import-media').disabled = !state.project || !!state.busy || !!state.remote;
    byId('format-landscape').disabled = !state.project || !!state.busy || !!state.remote;
    byId('format-portrait').disabled = !state.project || !!state.busy || !!state.remote;
    byId('start-render').disabled = !state.project?.shots.length || !!state.busy || !!state.remote ||
      state.jobs.some(inProgress);
    byId('conflict').hidden = !state.remote;
    byId('preview-kicker').textContent = state.previewMode === 'render' ? 'COMPLETED MP4' :
      isDirty() ? 'LIVE STORYBOARD · PENDING FIELDS' : 'LIVE STORYBOARD';
  }

  async function run(action) {
    if (state.busy) return;
    state.busy++;
    state.generation++;
    refreshStatus();
    try {
      await action();
    } catch (error) {
      toast(error.message + (error.code ? ' [' + error.code + ']' : ''), true);
      if (error.status === 409 && state.project) {
        try {
          const latest = await api(path());
          showConflict(latest);
        } catch { /* The original error remains visible. */ }
      }
    } finally {
      state.busy--;
      refreshStatus();
    }
  }

  function draft() {
    const result = {};
    if (state.dirtyName) result.name = byId('project-name').value.trim();
    if (state.dirtyShot && state.selectedShotId) {
      result.shot = {
        shotId: state.selectedShotId,
        duration: Number(byId('shot-duration').value),
        caption: byId('shot-caption').value
      };
    }
    return result;
  }

  function validateDraft(value) {
    if (value.name !== undefined && (!value.name || value.name.length > 100)) throw new Error('Project name must contain 1–100 characters.');
    if (value.shot) {
      if (!Number.isFinite(value.shot.duration) || value.shot.duration < 0.5 || value.shot.duration > 60)
        throw new Error('Shot duration must be between 0.5 and 60 seconds.');
      if (value.shot.caption.length > 180) throw new Error('A caption can contain up to 180 characters.');
    }
  }

  async function savePending() {
    if (!isDirty()) return;
    if (state.remote) throw new Error('Saved changes are waiting. Load the saved version or apply your pending fields first.');
    const value = draft();
    validateDraft(value);
    if (value.name !== undefined) {
      state.project = await api(path('/edit'), { method: 'POST', body: {
        revision: state.project.revision, action: 'set-project', name: value.name
      }});
      state.dirtyName = false;
    }
    if (value.shot) {
      state.project = await api(path('/edit'), { method: 'POST', body: {
        revision: state.project.revision, action: 'update-shot', ...value.shot
      }});
      state.dirtyShot = false;
    }
    updateProjectListEntry();
    renderProject();
  }

  async function mutate(action, values = {}) {
    await savePending();
    if (state.remote) throw new Error('Load the saved changes before changing this project.');
    state.project = await api(path('/edit'), { method: 'POST', body: {
      revision: state.project.revision, action, ...values
    }});
    updateProjectListEntry();
    renderProject();
  }

  function showConflict(project) {
    state.remote = project;
    byId('conflict-message').textContent = project.id !== state.project?.id
      ? 'The command interface opened another project. Your pending fields are preserved. Apply them to the current project, or load the newly opened project.'
      : 'The saved project changed while you were editing. Your pending fields are preserved. Apply those fields to the latest version, or load its saved values.';
    refreshStatus();
  }

  function updateProjectListEntry() {
    if (!state.project) return;
    const p = state.project;
    const entry = {id:p.id, name:p.name, updatedAt:p.updatedAt, revision:p.revision};
    const index = state.projects.findIndex(item => item.id === p.id);
    if (index >= 0) state.projects[index] = entry;
    else state.projects.push(entry);
    renderProjectPicker();
  }

  function renderProjectPicker() {
    const select = byId('project-picker');
    select.innerHTML = state.projects.length
      ? state.projects.map(p => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>').join('')
      : '<option value="">Open project…</option>';
    select.value = state.project?.id || '';
  }

  function acceptProject(project, preserveSelection = false) {
    pause();
    const oldId = state.project?.id;
    state.project = project;
    state.remote = null;
    state.dirtyName = false;
    state.dirtyShot = false;
    if (!preserveSelection || !project.shots.some(shot => shot.id === state.selectedShotId)) state.selectedShotId = project.shots[0]?.id || null;
    if (oldId !== project.id) {
      state.images.clear();
      state.jobs = [];
      state.jobId = null;
      state.loadedOutput = null;
      state.previewMode = 'live';
    }
    state.time = Math.min(0.35, duration());
    updateProjectListEntry();
    renderProject();
  }

  function previewShots() {
    if (!state.project) return [];
    if (!state.dirtyShot) return state.project.shots;
    const durationValue = Number(byId('shot-duration').value);
    return state.project.shots.map(shot => shot.id === state.selectedShotId ? {
      ...shot,
      duration: Number.isFinite(durationValue) && durationValue >= 0.5 && durationValue <= 60 ? durationValue : shot.duration,
      caption: byId('shot-caption').value
    } : shot);
  }

  function duration() { return previewShots().reduce((total, shot) => total + shot.duration, 0); }

  function renderProject() {
    const p = state.project;
    if (!p) return;
    if (!state.dirtyName) byId('project-name').value = p.name;
    for (const format of ['landscape', 'portrait']) {
      const button = byId('format-' + format);
      button.classList.toggle('is-active', p.format === format);
      button.setAttribute('aria-pressed', String(p.format === format));
    }
    byId('asset-count').textContent = p.assets.length;
    byId('shot-count').textContent = p.shots.length;
    byId('sequence-total').textContent = seconds(duration()) + ' seconds';
    byId('output-resolution').textContent = p.format === 'portrait' ? '720 × 1280' : '1280 × 720';
    byId('output-duration').textContent = seconds(duration()) + ' sec';
    byId('project-footer').textContent = 'Saved locally · Project v' + p.revision + ' · Same project, shared controls';
    renderShelf();
    renderStoryboard();
    renderInspector();
    syncAudio();
    renderJobs();
    showPreviewMode();
    refreshStatus();
    draw();
  }

  function renderShelf() {
    const p = state.project;
    const items = p.assets.filter(item => state.filter === 'all' || item.kind === (state.filter === 'images' ? 'image' : 'audio'));
    for (const filter of ['all','images','audio']) {
      byId('filter-' + filter).classList.toggle('is-active', filter === state.filter);
      byId('filter-' + filter).setAttribute('aria-pressed', String(filter === state.filter));
    }
    byId('media-list').innerHTML = items.length ? '<div class="media-grid">' + items.map(item => {
      if (item.kind === 'audio') return '<button class="asset-audio ' + (p.audioAssetId === item.id ? 'is-selected' : '') +
        '" data-audio="' + escapeHtml(item.id) + '" title="Use ' + escapeHtml(item.name) + ' as soundtrack">' + icon('audio') +
        '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + (item.duration ? seconds(item.duration) + ' sec · ' : '') +
        bytes(item.bytes) + '</small></div><span>' + (p.audioAssetId === item.id ? 'IN USE' : '+ USE') + '</span></button>';
      return '<article class="asset-card"><button class="asset-picture" data-add="' + escapeHtml(item.id) +
        '" aria-label="Add ' + escapeHtml(item.name) + ' to storyboard" title="Add a 4-second shot"><img loading="lazy" src="' +
        assetUrl(item.id) + '" alt="' + escapeHtml(item.name) + '"><span class="asset-add">' + icon('plus') + '</span></button><strong title="' +
        escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</strong><small>' +
        (item.width && item.height ? item.width + ' × ' + item.height + ' · ' : '') + bytes(item.bytes) + '</small></article>';
    }).join('') + '</div>' : '<div class="empty-shelf">' + (state.filter === 'all' ? 'Your media will appear here.<br>Choose files to get started.' : 'No ' + state.filter + ' in this project yet.') + '</div>';
  }

  function renderStoryboard() {
    const shots = previewShots();
    let offset = 0;
    byId('storyboard-track').innerHTML = shots.length ? shots.map((shot,index) => {
      const source = asset(shot.assetId);
      const start = offset;
      offset += shot.duration;
      return '<article class="shot-card ' + (shot.id === state.selectedShotId ? 'is-selected' : '') + '" data-shot="' +
        escapeHtml(shot.id) + '" draggable="true" tabindex="0" role="button" aria-label="Shot ' + (index+1) + ', ' +
        escapeHtml(shot.caption || source?.name || 'Untitled') + ', ' + seconds(shot.duration) +
        ' seconds. Select to edit. Alt and left or right arrow to reorder." aria-pressed="' +
        (shot.id === state.selectedShotId) + '"><div class="shot-thumb"><img src="' + assetUrl(shot.assetId) +
        '" alt="" draggable="false"><span class="shot-number">' + String(index+1).padStart(2,'0') +
        '</span><span class="shot-grip" aria-hidden="true">⠿</span><span class="shot-time">' + seconds(shot.duration) +
        's</span></div><div class="shot-body"><strong>' + escapeHtml(shot.caption || source?.name || 'Untitled shot') +
        '</strong><small>' + clock(start) + ' — ' + clock(offset) + '</small></div></article>';
    }).join('') + '<button class="add-shot-tile" id="add-shot-tile" aria-label="Choose an image from the media shelf">' +
      icon('plus') + '<span>Add shot</span></button>'
      : '<div class="empty-storyboard">' + icon('plus') + '<span>Your first shot starts here. Add an image from the shelf.</span></div>';
  }

  function renderInspector() {
    const shot = selectedShot();
    byId('inspector-empty').hidden = !!shot;
    byId('shot-form').hidden = !shot;
    byId('shot-index').textContent = shot ? String(state.project.shots.indexOf(shot) + 1).padStart(2,'0') + ' / ' +
      String(state.project.shots.length).padStart(2,'0') : '—';
    if (!shot) return;
    const source = asset(shot.assetId);
    byId('selected-source').textContent = source?.name || 'Source image';
    byId('selected-source').title = source?.name || '';
    byId('selected-thumb').src = assetUrl(shot.assetId);
    byId('selected-thumb').alt = source?.name || 'Selected shot';
    if (!state.dirtyShot) {
      byId('shot-duration').value = shot.duration;
      byId('shot-caption').value = shot.caption;
    }
    byId('caption-count').textContent = byId('shot-caption').value.length + ' / 180';
    const index = state.project.shots.indexOf(shot);
    byId('move-earlier').disabled = index === 0;
    byId('move-later').disabled = index === state.project.shots.length - 1;
  }

  function markShotDirty() {
    state.dirtyShot = true;
    byId('caption-count').textContent = byId('shot-caption').value.length + ' / 180';
    byId('sequence-total').textContent = seconds(duration()) + ' seconds';
    byId('output-duration').textContent = seconds(duration()) + ' sec';
    refreshStatus();
    draw();
  }

  function syncAudio() {
    const source = asset(state.project.audioAssetId);
    const newId = source ? state.project.id + '/' + source.id : null;
    byId('audio-name').textContent = source?.name || 'No track selected';
    byId('audio-length').textContent = source?.duration ? seconds(source.duration) + 's · loops to fit' : '';
    byId('remove-audio').hidden = !source;
    document.querySelector('.audio-strip').classList.toggle('is-empty', !source);
    if (newId !== state.audioId) {
      audio.pause();
      if (source) audio.src = assetUrl(source.id);
      else { audio.removeAttribute('src'); audio.load(); }
      state.audioId = newId;
      if (state.playing && source) startAudio();
    }
  }

  function frameAt(time) {
    const shots = previewShots();
    let offset = 0;
    for (let i=0; i<shots.length; i++) {
      const shot = shots[i];
      if (time < offset + shot.duration || i === shots.length - 1)
        return { shot, index:i, local: Math.max(0,time-offset), offset };
      offset += shot.duration;
    }
    return null;
  }

  function imageFor(id) {
    if (!state.images.has(id)) {
      const image = new Image();
      image.onload = () => draw();
      image.onerror = () => { image.dataset.failed = '1'; draw(); };
      image.src = assetUrl(id);
      state.images.set(id,image);
    }
    return state.images.get(id);
  }

  function captionLines(text, maxCharacters) {
    const output = [];
    for (const paragraph of String(text).split(/\r?\n/)) {
      if (!paragraph.trim()) { output.push(''); continue; }
      let line = '';
      for (let word of paragraph.trim().split(/\s+/)) {
        while (word.length > maxCharacters) {
          if (line) { output.push(line); line = ''; }
          output.push(word.slice(0,maxCharacters));
          word = word.slice(maxCharacters);
        }
        if (!word) continue;
        if (line && line.length + word.length + 1 > maxCharacters) { output.push(line); line = word; }
        else line += (line ? ' ' : '') + word;
      }
      if (line) output.push(line);
    }
    return output;
  }

  function draw() {
    if (!state.project) return;
    const portrait = state.project.format === 'portrait';
    const width = portrait ? 720 : 1280, height = portrait ? 1280 : 720;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const total = duration();
    state.time = Math.max(0,Math.min(state.time,total));
    context.fillStyle = '#000000';
    context.fillRect(0,0,width,height);
    const current = frameAt(state.time);
    byId('preview-empty').hidden = !!current || state.previewMode === 'render';
    if (current) {
      const img = imageFor(current.shot.assetId);
      if (img.complete && img.naturalWidth) {
        const scale = Math.max(width/img.naturalWidth,height/img.naturalHeight);
        const drawWidth = img.naturalWidth*scale, drawHeight=img.naturalHeight*scale;
        context.drawImage(img,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);
      } else {
        context.fillStyle = '#163039';
        context.fillRect(0,0,width,height);
        context.font = '24px Arial';
        context.textAlign = 'center';
        context.fillStyle = '#a6c7c7';
        context.fillText(img.dataset.failed ? 'Image could not be loaded' : 'Loading image…', width/2,height/2);
      }
      if (current.shot.caption) {
        const fontSize = portrait ? 38 : 34;
        const lineHeight = Math.ceil(fontSize*1.25);
        const lines = captionLines(current.shot.caption,portrait ? 29 : 52);
        const boxHeight = lines.length*lineHeight+22;
        const boxTop = height-(portrait?70:42)-boxHeight;
        context.fillStyle = 'rgba(0,0,0,0.58)';
        context.fillRect(0,boxTop,width,boxHeight);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '700 '+fontSize+'px Arial';
        context.fillStyle = '#ffffff';
        lines.forEach((line,index) => context.fillText(line,width/2,boxTop+11+lineHeight*(index+0.5),width-48));
      }
      const fade = state.project.fade || 0.25;
      const opacity = Math.max(0,Math.min(1,current.local/fade,(current.shot.duration-current.local)/fade));
      context.fillStyle = 'rgba(0,0,0,'+(1-opacity)+')';
      context.fillRect(0,0,width,height);
      canvas.setAttribute('aria-label','Storyboard preview, shot '+(current.index+1)+': '+(current.shot.caption || asset(current.shot.assetId)?.name || 'untitled'));
    }
    byId('playback-time').innerHTML = clock(state.time)+' <span>/ '+clock(total)+'</span>';
    byId('seek-preview').max = Math.max(total,0.01);
    byId('seek-preview').value = state.time;
    byId('seek-preview').disabled = !current;
    byId('play-preview').disabled = !current;
    if (state.previewMode === 'live') byId('preview-detail').textContent = current
      ? 'Shot '+(current.index+1)+' of '+state.project.shots.length+' · 0.25s fades'
      : 'Your storyboard, in real time';
    document.querySelectorAll('.shot-card').forEach(card => card.classList.toggle('is-current',card.dataset.shot === current?.shot.id));
    const fadeOut = Math.min(1,Math.max(0,(total-state.time)/0.5));
    audio.volume = state.muted ? 0 : state.volume*fadeOut;
  }

  function syncAudioTime() {
    if (state.audioId && Number.isFinite(audio.duration) && audio.duration>0) {
      try { audio.currentTime = state.time%audio.duration; } catch { /* Metadata may not yet be ready. */ }
    }
  }

  function startAudio() {
    if (!state.audioId) return;
    syncAudioTime();
    audio.play().catch(error => toast('Audio playback: '+error.message,true));
  }

  function pause() {
    state.playing = false;
    if (state.frameRequest !== null) cancelAnimationFrame(state.frameRequest);
    state.frameRequest = null;
    audio.pause();
    byId('play-icon').setAttribute('href','#i-play');
    byId('play-preview').setAttribute('aria-label','Play storyboard');
  }

  function play() {
    if (!duration()) return;
    setPreviewMode('live');
    if (state.time >= duration()-0.01) state.time = 0;
    state.playing = true;
    state.previousFrame = performance.now();
    byId('play-icon').setAttribute('href','#i-pause');
    byId('play-preview').setAttribute('aria-label','Pause storyboard');
    startAudio();
    state.frameRequest = requestAnimationFrame(animate);
  }

  function animate(now) {
    if (!state.playing) return;
    state.time += Math.max(0,(now-state.previousFrame)/1000);
    state.previousFrame = now;
    if (state.time >= duration()) { state.time = duration(); pause(); }
    draw();
    if (state.playing) state.frameRequest = requestAnimationFrame(animate);
  }

  function setPreviewMode(mode) {
    if (mode === 'render' && !finished(selectedJob())) return;
    if (mode === 'render') pause();
    else byId('output-video').pause();
    state.previewMode = mode;
    showPreviewMode();
    refreshStatus();
    draw();
  }

  function showPreviewMode() {
    const renderMode = state.previewMode === 'render' && finished(selectedJob());
    if (!renderMode) state.previewMode = 'live';
    const job = selectedJob();
    const portrait = renderMode ? (job.height > job.width || job.format === 'portrait') : state.project?.format === 'portrait';
    byId('preview-stage').classList.toggle('is-portrait',portrait);
    byId('preview-canvas').hidden = renderMode;
    byId('output-video').hidden = !renderMode;
    byId('live-transport').hidden = renderMode;
    byId('show-live').classList.toggle('is-active',!renderMode);
    byId('show-live').setAttribute('aria-pressed',String(!renderMode));
    byId('show-render').classList.toggle('is-active',renderMode);
    byId('show-render').setAttribute('aria-pressed',String(renderMode));
    byId('show-render').disabled = !finished(job);
    if (renderMode) {
      if (state.loadedOutput !== job.id) {
        byId('output-video').src = '/api/renders/'+encodeURIComponent(job.id)+'/video';
        state.loadedOutput = job.id;
      }
      byId('preview-detail').textContent = 'Rendered '+job.format+' · project v'+job.revision;
      byId('preview-empty').hidden = true;
    }
  }

  function renderJobs() {
    const job = selectedJob();
    byId('render-job').hidden = !job;
    byId('history-wrap').hidden = !state.jobs.length;
    byId('render-history').innerHTML = state.jobs.map(item => '<option value="'+escapeHtml(item.id)+'">'+
      escapeHtml((item.format === 'portrait' ? '9:16' : '16:9')+' · v'+item.revision+' · '+item.status+
      (item.createdAt ? ' · '+new Date(item.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''))+'</option>').join('');
    if (job) byId('render-history').value = job.id;
    if (job) {
      const progress = Math.min(100,Math.max(0,Number(job.progress)||0));
      const statusLabels = {queued:'Queued',running:'Rendering',rendering:'Rendering',cancelling:'Cancelling',cancelled:'Cancelled',completed:'Your video is ready',succeeded:'Your video is ready',failed:'Render failed'};
      byId('render-status').textContent = statusLabels[job.status] || job.status;
      byId('render-percent').textContent = finished(job) ? '100%' : inProgress(job) ? Math.round(progress)+'%' : '';
      byId('render-progress').value = finished(job) ? 100 : progress;
      byId('render-stage').textContent = job.stage || '';
      byId('cancel-render').hidden = !inProgress(job);
      byId('cancel-render').disabled = job.status === 'cancelling' || !!state.busy;
      byId('watch-render').hidden = !finished(job);
      byId('open-output').hidden = !finished(job);
      byId('render-error').hidden = !job.error;
      byId('render-error').textContent = typeof job.error === 'string' ? job.error : job.error ? JSON.stringify(job.error) : '';
    }
    showPreviewMode();
    refreshStatus();
  }

  async function refreshJobs() {
    if (!state.project) return;
    const currentId = state.project.id;
    const previous = selectedJob();
    const knownJobIds = new Set(state.jobs.map(job => job.id));
    const result = await api('/api/renders?projectId='+encodeURIComponent(currentId));
    if (state.project?.id !== currentId) return;
    state.jobs = result.jobs || [];
    state.jobs.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    if (state.jobs[0] && !knownJobIds.has(state.jobs[0].id)) state.jobId = state.jobs[0].id;
    if (!state.jobs.some(job => job.id === state.jobId)) state.jobId = state.jobs[0]?.id || null;
    const next = selectedJob();
    if (previous && inProgress(previous) && finished(next) && next.id === previous.id) toast('Video rendered. Watch it here or open the output folder.');
    renderJobs();
  }

  async function chooseShot(id, seek = true) {
    if (state.selectedShotId === id) {
      if (seek) seekToShot(id);
      return;
    }
    await savePending();
    state.selectedShotId = id;
    renderStoryboard();
    renderInspector();
    if (seek) seekToShot(id);
    refreshStatus();
  }

  function seekToShot(id) {
    pause();
    let offset=0;
    for (const shot of previewShots()) {
      if (shot.id === id) { state.time=offset+Math.min(0.35,shot.duration/2); break; }
      offset += shot.duration;
    }
    setPreviewMode('live');
    draw();
    syncAudioTime();
  }

  async function moveShot(id, index) {
    await mutate('move-shot',{shotId:id,toIndex:index});
    state.selectedShotId=id;
    renderStoryboard();
    renderInspector();
    seekToShot(id);
    const card = [...document.querySelectorAll('.shot-card')].find(el => el.dataset.shot === id);
    card?.focus();
  }

  async function importFiles(files) {
    if (!state.project || !files.length) return;
    await savePending();
    const progress=byId('import-progress');
    progress.hidden=false;
    try {
      for (let i=0;i<files.length;i++) {
        const file=files[i];
        const extension=file.name.toLowerCase().split('.').pop();
        const kind=['png','jpg','jpeg','webp','bmp'].includes(extension) ? 'image' :
          ['wav','mp3','m4a','ogg','flac','aac'].includes(extension) ? 'audio' : null;
        if (!kind) throw new Error('Unsupported file: '+file.name+'. Choose a PNG, JPG, WebP, BMP or supported audio file.');
        if (file.size > (kind === 'image' ? 40 : 100)*1024*1024) throw new Error(file.name+' exceeds the '+(kind === 'image' ? '40' : '100')+' MB import limit.');
        progress.textContent='Importing '+(i+1)+' of '+files.length+': '+file.name;
        state.project=await api(path('/media?name='+encodeURIComponent(file.name)+'&kind='+kind),{
          method:'POST',body:file,raw:true,headers:{'Content-Type':'application/octet-stream','X-Project-Revision':String(state.project.revision)}
        });
        updateProjectListEntry();
        renderProject();
      }
      toast(files.length+' '+(files.length===1?'file':'files')+' imported. Images are ready to add to your sequence.');
    } finally {
      progress.hidden=true;
      byId('media-files').value='';
    }
  }

  async function poll() {
    if (state.polling || state.busy) return;
    state.polling=true;
    const generation=state.generation;
    try {
      const health=await api('/api/health');
      state.token=health.token;
      connection(true);
      const targetId=health.activeProjectId || state.project?.id;
      if (targetId) {
        const latest=await api('/api/projects/'+encodeURIComponent(targetId));
        if (!state.busy && generation===state.generation && (!state.project || latest.id !== state.project.id || latest.revision !== state.project.revision)) {
          if (isDirty()) showConflict(latest);
          else {
            const same=state.project?.id===latest.id;
            acceptProject(latest,same);
            toast('Project updated from the command interface.');
          }
        }
      }
      if (!state.busy && generation===state.generation) {
        const projects=await api('/api/projects');
        state.projects=projects.projects || [];
        renderProjectPicker();
        await refreshJobs();
      }
    } catch (error) {
      connection(false,'The local studio is not responding. Keep this tab open and restart the Windows launcher. Pending fields remain here. '+error.message);
    } finally { state.polling=false; }
  }

  byId('project-name').addEventListener('input',() => { state.dirtyName=true; refreshStatus(); });
  byId('save-project').addEventListener('click',() => run(async() => { await savePending(); toast('Project saved.'); }));
  byId('shot-duration').addEventListener('input',markShotDirty);
  byId('shot-caption').addEventListener('input',markShotDirty);
  byId('shot-form').addEventListener('submit',event => { event.preventDefault(); run(async() => { await savePending(); toast('Shot saved.'); }); });
  for (const [id,change] of [['duration-minus',-0.5],['duration-plus',0.5]]) byId(id).addEventListener('click',() => {
    byId('shot-duration').value=seconds(Math.max(0.5,Math.min(60,(Number(byId('shot-duration').value)||0.5)+change)));
    markShotDirty();
  });
  for (const [id,change] of [['move-earlier',-1],['move-later',1]]) byId(id).addEventListener('click',() => run(async() => {
    const index=state.project.shots.findIndex(shot => shot.id===state.selectedShotId);
    const next=index+change;
    if (next>=0 && next<state.project.shots.length) await moveShot(state.selectedShotId,next);
  }));
  byId('remove-shot').addEventListener('click',() => run(async() => {
    const index=state.project.shots.findIndex(shot=>shot.id===state.selectedShotId);
    await mutate('remove-shot',{shotId:state.selectedShotId});
    state.selectedShotId=state.project.shots[Math.min(index,state.project.shots.length-1)]?.id || null;
    renderProject();
    toast('Shot removed from the sequence. Its source image stays on the shelf.');
  }));
  for (const format of ['landscape','portrait']) byId('format-'+format).addEventListener('click',() => run(async() => {
    pause();
    await mutate('set-project',{format});
    setPreviewMode('live');
  }));
  for (const filter of ['all','images','audio']) byId('filter-'+filter).addEventListener('click',() => {
    state.filter=filter;
    if (state.project) renderShelf();
  });
  byId('media-list').addEventListener('click',event => {
    const image=event.target.closest('[data-add]');
    const track=event.target.closest('[data-audio]');
    if (image) run(async() => {
      await mutate('add-shot',{assetId:image.dataset.add,duration:4,caption:''});
      state.selectedShotId=state.project.shots[state.project.shots.length-1].id;
      renderProject();
      seekToShot(state.selectedShotId);
      toast('Shot added. Set its duration and caption in the inspector.');
    });
    if (track) run(() => mutate('set-audio',{assetId:track.dataset.audio}));
  });
  byId('remove-audio').addEventListener('click',() => run(() => mutate('set-audio',{assetId:null})));
  byId('import-media').addEventListener('click',() => byId('media-files').click());
  byId('media-files').addEventListener('change',event => run(() => importFiles([...event.target.files])));
  const dropZone=byId('import-zone');
  dropZone.addEventListener('dragover',event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dropZone.classList.add('is-dragging'); } });
  dropZone.addEventListener('dragleave',event => { if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragging'); });
  dropZone.addEventListener('drop',event => { event.preventDefault(); dropZone.classList.remove('is-dragging'); run(() => importFiles([...event.dataTransfer.files])); });
  const storyboard=byId('storyboard-track');
  storyboard.addEventListener('click',event => {
    const card=event.target.closest('[data-shot]');
    if (card) run(() => chooseShot(card.dataset.shot));
    if (event.target.closest('#add-shot-tile')) {
      state.filter='images';
      renderShelf();
      const image=byId('media-list').querySelector('[data-add]');
      if (image) { image.focus(); image.scrollIntoView({block:'nearest',behavior:'smooth'}); }
      else byId('import-media').click();
    }
  });
  storyboard.addEventListener('keydown',event => {
    const card=event.target.closest('[data-shot]');
    if (!card) return;
    if (event.altKey && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const index=state.project.shots.findIndex(shot=>shot.id===card.dataset.shot);
      const next=index+(event.key==='ArrowLeft'?-1:1);
      if (next>=0 && next<state.project.shots.length) run(() => moveShot(card.dataset.shot,next));
    } else if (event.key==='Enter' || event.key===' ') { event.preventDefault(); run(() => chooseShot(card.dataset.shot)); }
  });
  storyboard.addEventListener('dragstart',event => {
    const card=event.target.closest('[data-shot]');
    if (!card || state.busy || state.remote) { event.preventDefault(); return; }
    state.dragId=card.dataset.shot;
    event.dataTransfer.setData('text/plain',state.dragId);
    event.dataTransfer.effectAllowed='move';
    card.classList.add('is-dragging');
  });
  storyboard.addEventListener('dragover',event => {
    if (!state.dragId) return;
    const card=event.target.closest('[data-shot]');
    if (!card) return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    document.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));
    if (card.dataset.shot!==state.dragId) card.classList.add('is-drop-target');
  });
  storyboard.addEventListener('drop',event => {
    const card=event.target.closest('[data-shot]');
    event.preventDefault();
    const id=state.dragId;
    if (id && card && id!==card.dataset.shot) {
      const next=state.project.shots.findIndex(shot=>shot.id===card.dataset.shot);
      run(() => moveShot(id,next));
    }
    state.dragId=null;
    document.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));
  });
  storyboard.addEventListener('dragend',() => {
    state.dragId=null;
    document.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));
  });
  byId('play-preview').addEventListener('click',() => state.playing ? pause() : play());
  byId('restart-preview').addEventListener('click',() => { state.time=0; syncAudioTime(); draw(); });
  byId('seek-preview').addEventListener('input',event => { state.time=Number(event.target.value); syncAudioTime(); draw(); });
  byId('volume-preview').addEventListener('input',event => { state.volume=Number(event.target.value); draw(); });
  byId('mute-preview').addEventListener('click',() => {
    state.muted=!state.muted;
    byId('mute-preview').setAttribute('aria-pressed',String(state.muted));
    byId('mute-preview').setAttribute('aria-label',state.muted?'Unmute preview':'Mute preview');
    byId('mute-preview').title=state.muted?'Unmute preview':'Mute preview';
    byId('mute-preview').style.opacity=state.muted?'.4':'1';
    draw();
  });
  audio.addEventListener('loadedmetadata',syncAudioTime);
  byId('show-live').addEventListener('click',() => setPreviewMode('live'));
  byId('show-render').addEventListener('click',() => setPreviewMode('render'));
  byId('watch-render').addEventListener('click',() => {
    setPreviewMode('render');
    byId('output-video').play().catch(error=>toast('Video playback: '+error.message,true));
  });
  byId('render-history').addEventListener('change',event => { state.jobId=event.target.value; renderJobs(); draw(); });
  byId('start-render').addEventListener('click',() => run(async() => {
    pause();
    await savePending();
    const job=await api(path('/render'),{method:'POST',body:{revision:state.project.revision}});
    state.jobs.unshift(job);
    state.jobId=job.id;
    renderJobs();
    toast('Render started. You can keep working while it runs.');
  }));
  byId('cancel-render').addEventListener('click',() => run(async() => {
    const job=selectedJob();
    if (!job) return;
    const result=await api('/api/renders/'+encodeURIComponent(job.id)+'/cancel',{method:'POST',body:{}});
    state.jobs=state.jobs.map(item=>item.id===result.id?result:item);
    renderJobs();
  }));
  byId('open-output').addEventListener('click',() => run(async() => {
    const job=selectedJob();
    if (!finished(job)) return;
    await api('/api/renders/'+encodeURIComponent(job.id)+'/open',{method:'POST',body:{}});
    toast('Opened the render location on this computer.');
  }));
  byId('new-project').addEventListener('click',() => {
    byId('new-project-name').value='';
    byId('new-project-dialog').showModal();
    byId('new-project-name').focus();
  });
  byId('close-new-dialog').addEventListener('click',() => byId('new-project-dialog').close());
  byId('new-project-form').addEventListener('submit',event => {
    event.preventDefault();
    const name=byId('new-project-name').value.trim();
    if (!name) return;
    run(async() => {
      await savePending();
      const project=await api('/api/projects',{method:'POST',body:{name}});
      acceptProject(project);
      byId('new-project-dialog').close();
      await refreshJobs();
      toast('Project created. Import a picture and a soundtrack to begin.');
    });
  });
  byId('project-picker').addEventListener('change',event => {
    const id=event.target.value;
    if (!id || id===state.project?.id) return;
    run(async() => {
      try {
        await savePending();
        await api('/api/session',{method:'POST',body:{projectId:id}});
        acceptProject(await api('/api/projects/'+encodeURIComponent(id)));
        await refreshJobs();
      } finally { renderProjectPicker(); }
    });
  });
  byId('load-remote').addEventListener('click',() => run(async() => {
    if (!state.remote) return;
    const latest=await api('/api/projects/'+encodeURIComponent(state.remote.id));
    acceptProject(latest,true);
    await refreshJobs();
    toast('Loaded the latest saved project.');
  }));
  byId('apply-draft').addEventListener('click',() => run(async() => {
    if (!state.remote) return;
    const pending=draft();
    validateDraft(pending);
    const targetId=state.remote.id;
    const latest=await api(path());
    if (pending.shot && !latest.shots.some(shot=>shot.id===pending.shot.shotId))
      throw new Error('This shot was removed in the saved project. Copy its pending caption before loading the saved version.');
    state.project=latest;
    state.remote=null;
    await savePending();
    if (targetId!==latest.id) acceptProject(await api('/api/projects/'+encodeURIComponent(targetId)));
    else renderProject();
    await refreshJobs();
    toast('Your pending fields were saved onto the latest project version.');
  }));
  window.addEventListener('beforeunload',event => {
    if (isDirty()) { event.preventDefault(); event.returnValue=''; }
  });
  document.addEventListener('keydown',event => {
    const editable=event.target instanceof Element && event.target.matches('input,textarea,select,[contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='s') {
      event.preventDefault();
      run(async()=>{ await savePending(); toast('Project saved.'); });
    } else if (event.code==='Space' && !editable && event.target===document.body) {
      event.preventDefault();
      state.playing?pause():play();
    }
  });

  async function boot() {
    try {
      const health=await api('/api/health');
      state.token=health.token;
      connection(true);
      const list=await api('/api/projects');
      state.projects=list.projects || [];
      const id=health.activeProjectId || list.activeProjectId || state.projects[0]?.id;
      renderProjectPicker();
      if (id) {
        acceptProject(await api('/api/projects/'+encodeURIComponent(id)));
        await refreshJobs();
      } else {
        byId('save-label').textContent='Ready for a new project';
        toast('Create your first project to begin.');
      }
    } catch (error) {
      connection(false,'The studio could not connect to its local server. Start launch-studio.cmd, then refresh this page. '+error.message);
    }
    setInterval(poll,2000);
  }
  boot();
})();
