/* ============================================================
   Cars Podcast Studio — Main App
   ============================================================ */

const SCENES = ['racetrack', 'highway', 'factory', 'winner', 'vintage'];

const SCENE_META = {
  racetrack: { label: '🏁 At the Track' },
  highway:   { label: '🛣️ On the Highway' },
  factory:   { label: '🏭 In the Factory' },
  winner:    { label: '🏆 Winner\'s Circle' },
  vintage:   { label: '📚 History Page' },
};

const CAR_SVG = `<svg class="slide-car" viewBox="0 0 120 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="20" width="96" height="18" rx="5" fill="#e63946"/>
  <path d="M30,20 L44,8 L78,8 L92,20" fill="#c1121f"/>
  <rect x="46" y="9" width="13" height="11" rx="2" fill="#90d5f0" opacity=".9"/>
  <rect x="62" y="9" width="13" height="11" rx="2" fill="#90d5f0" opacity=".9"/>
  <circle cx="28" cy="40" r="7" fill="#111"/>
  <circle cx="28" cy="40" r="3.5" fill="#444"/>
  <circle cx="84" cy="40" r="7" fill="#111"/>
  <circle cx="84" cy="40" r="3.5" fill="#444"/>
  <circle cx="102" cy="26" r="3.5" fill="#ffd60a"/>
  <rect x="46" y="22" width="30" height="4" fill="#ffd60a"/>
  <rect x="2" y="27" width="9" height="5" fill="#c1121f"/>
</svg>`;

/* ── State ─────────────────────────────────────────── */
const S = {
  slides:        [],
  currentSlide:  0,
  recordings:    {},   // index -> { blob, url }
  recorder:      null,
  isRecording:   false,
  isPlaying:     false,
  previewAudio:  null,
  previewIdx:    0,
  uploadedText:  '',
};

/* ── Boot ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupUpload();
  setupRecord();
  setupPreview();
  document.getElementById('waveformCanvas') &&
    (new VoiceRecorder('waveformCanvas'))._drawIdle &&
    (() => {
      // Draw idle state on canvas at startup
      const cv = document.getElementById('waveformCanvas');
      const cx = cv.getContext('2d');
      cx.fillStyle = '#1e2530';
      cx.fillRect(0, 0, cv.width, cv.height);
    })();
});

/* ══════════════════════════════════════════════════════
   VIEW MANAGEMENT
══════════════════════════════════════════════════════ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const map = { upload: 1, processing: 1, record: 3, preview: 4 };
  const cur = map[name] || 1;
  document.querySelectorAll('.step-item').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('active', n === cur);
    el.classList.toggle('done',   n < cur);
  });
}

/* ══════════════════════════════════════════════════════
   UPLOAD / FILE PARSING
══════════════════════════════════════════════════════ */
function setupUpload() {
  const zone      = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowse = document.getElementById('btnBrowse');

  btnBrowse.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  document.getElementById('btnGenerate').addEventListener('click', generate);
}

function handleFile(file) {
  const display = document.getElementById('fileNameDisplay');
  display.textContent = `📄 ${file.name}`;
  display.classList.remove('hidden');
  showToast('Reading file…', 'info');

  parseFile(file)
    .then(text => {
      S.uploadedText = text;
      showToast(`✅ Loaded: ${file.name}`, 'success');
    })
    .catch(err => showToast(`❌ ${err.message}`, 'error'));
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt')  return parseTxt(file);
  if (ext === 'pdf')  return parsePDF(file);
  if (ext === 'pptx') return parsePPTX(file);
  throw new Error('Unsupported file type. Use .txt, .pdf, or .pptx');
}

function parseTxt(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Could not read file.'));
    r.readAsText(file);
  });
}

async function parsePDF(file) {
  /* Lazy-load PDF.js only when needed */
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg  = await pdf.getPage(i);
    const tc  = await pg.getTextContent();
    out += tc.items.map(it => it.str).join(' ') + '\n\n';
  }
  return out;
}

async function parsePPTX(file) {
  if (!window.JSZip) throw new Error('JSZip not loaded.');
  const zip     = await JSZip.loadAsync(file);
  const names   = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)[1]);
      const nb = parseInt(b.match(/(\d+)/)[1]);
      return na - nb;
    });

  const blocks = [];
  for (const name of names) {
    const xml = await zip.files[name].async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // a:t elements contain text runs
    const ns  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const els = doc.getElementsByTagNameNS(ns, 't');
    const texts = [];
    for (const el of els) {
      const t = el.textContent.trim();
      if (t) texts.push(t);
    }
    if (texts.length) blocks.push(texts.join('\n'));
  }
  return blocks.join('\n\n---\n\n');
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

/* ══════════════════════════════════════════════════════
   GENERATE SLIDES
══════════════════════════════════════════════════════ */
async function generate() {
  const pasted = document.getElementById('pasteText').value.trim();
  const prompt = document.getElementById('podcastPrompt').value.trim();
  const text   = S.uploadedText || pasted;

  if (!text) { showToast('Please upload a file or paste some notes first!', 'error'); return; }

  showView('processing');
  setProgress(0, 'Reading your notes…');
  await wait(300);

  setProgress(25, 'Breaking into slides…');
  await wait(400);

  const slides = buildSlides(text, prompt);
  S.slides       = slides;
  S.currentSlide = 0;
  S.recordings   = {};

  setProgress(60, 'Adding car animations…');
  await wait(500);

  setProgress(90, 'Almost done…');
  await wait(300);

  setProgress(100, 'Ready!');
  await wait(250);

  showView('record');
  renderSlide(0);
  renderDots();
}

function setProgress(pct, msg) {
  document.getElementById('processingMsg').textContent     = msg;
  document.getElementById('progressFill').style.width      = pct + '%';
  document.getElementById('processingDetail').textContent  =
    pct < 100 ? `${pct}% complete` : '🏁 Let\'s go!';
}

/* ── Text → Slides algorithm ── */
function buildSlides(text, prompt) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // PPT (separator blocks)
  if (text.includes('\n---\n')) {
    return text.split('\n---\n')
      .filter(b => b.trim())
      .map((b, i) => blockToSlide(b, i));
  }

  // Try heading-based sections
  const sections = detectSections(text);
  if (sections.length >= 2) {
    return sections.map((s, i) => ({
      id: i,
      title:   s.title   || `Part ${i + 1}`,
      bullets: s.bullets || [],
      script:  s.script  || s.title,
      scene:   SCENES[i % SCENES.length],
    }));
  }

  // Fallback: split by sentences
  return sentenceSplit(text, prompt);
}

function blockToSlide(block, i) {
  const lines   = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const title   = lines[0] || `Slide ${i + 1}`;
  const rest    = lines.slice(1);
  const bullets = rest.slice(0, 5).map(l => l.replace(/^[-*•]\s*/, ''));
  const script  = rest.join(' ') || title;
  return { id: i, title, bullets, script, scene: SCENES[i % SCENES.length] };
}

function detectSections(text) {
  const lines    = text.split('\n');
  const sections = [];
  let cur        = { title: '', rawLines: [] };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const isHeading =
      /^#+\s/.test(t) ||                          // markdown heading
      /^\d+[\.\)]\s/.test(t) ||                   // numbered list
      (t.length < 80 && t === t.toUpperCase() && t.length > 4) ||  // ALL CAPS
      (t.endsWith(':') && t.split(' ').length <= 8) ||             // short label:
      (!cur.title && t.split(' ').length <= 10 && /^[A-Z]/.test(t)); // first short line

    if (isHeading && cur.rawLines.length > 0) {
      sections.push(finishSection(cur, sections.length));
      cur = { title: cleanHeading(t), rawLines: [] };
    } else if (isHeading && !cur.title) {
      cur.title = cleanHeading(t);
    } else {
      cur.rawLines.push(t);
    }
  }
  if (cur.title || cur.rawLines.length) sections.push(finishSection(cur, sections.length));
  return sections;
}

function cleanHeading(t) {
  return t.replace(/^#+\s*/, '').replace(/:$/, '').trim();
}

function finishSection(cur, i) {
  const title   = cur.title || cur.rawLines[0] || `Part ${i + 1}`;
  const content = cur.rawLines;
  const script  = content.join(' ');
  const bullets = extractBullets(content);
  return { title, bullets, script };
}

function extractBullets(lines) {
  if (lines.some(l => /^[-*•]/.test(l))) {
    return lines.filter(l => /^[-*•]/.test(l))
      .map(l => l.replace(/^[-*•]\s*/, '').trim())
      .slice(0, 5);
  }
  const text = lines.join(' ');
  const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sents.slice(0, 4).map(s => s.trim());
}

function sentenceSplit(text, prompt) {
  const sents   = text.match(/[^.!?]+[.!?]+/g) || [text];
  const count   = Math.max(3, Math.min(10, Math.ceil(sents.length / 3)));
  const perSlide = Math.ceil(sents.length / count);
  const slides  = [];

  for (let i = 0; i < count; i++) {
    const chunk   = sents.slice(i * perSlide, (i + 1) * perSlide);
    const script  = chunk.join(' ').trim();
    const title   = i === 0
      ? (prompt || 'Cars History') + ' 🏎️'
      : trimTo(chunk[0], 55) || `${prompt || 'Cars'} — Part ${i + 1}`;
    const bullets = chunk.slice(1, 4).map(s => trimTo(s.trim(), 80));
    slides.push({ id: i, title, bullets, script, scene: SCENES[i % SCENES.length] });
  }

  // Add intro slide if prompt provided
  if (prompt && slides.length > 0) {
    slides.unshift({
      id: -1,
      title: prompt,
      bullets: ['Welcome to my podcast!', 'Today we\'re talking about cars 🏎️', 'Let\'s go!'],
      script: `Welcome to my Cars Podcast! Today I\'m going to tell you about: ${prompt}. Let\'s go!`,
      scene: 'racetrack',
    });
    slides.forEach((s, i) => { s.id = i; });
  }

  return slides;
}

function trimTo(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/* ══════════════════════════════════════════════════════
   SLIDE RENDERING
══════════════════════════════════════════════════════ */
function renderSlide(idx) {
  const slide = S.slides[idx];
  if (!slide) return;

  const stage = document.getElementById('slideStage');
  stage.innerHTML = buildSlideHTML(slide, !!S.recordings[idx]);

  document.getElementById('scriptText').textContent =
    slide.script || [slide.title, ...slide.bullets].join('. ');

  document.getElementById('slideCounter').textContent =
    `Slide ${idx + 1} of ${S.slides.length}`;

  document.getElementById('btnPrevSlide').disabled = idx === 0;
  document.getElementById('btnNextSlide').disabled = idx === S.slides.length - 1;

  syncRecordUI(idx);
}

function buildSlideHTML(slide, hasRec) {
  const sm = SCENE_META[slide.scene] || SCENE_META.racetrack;

  const bullets = slide.bullets.map((b, i) =>
    `<div class="slide-bullet" style="animation-delay:${0.45 + i * 0.18}s">${b}</div>`
  ).join('');

  const badge = hasRec
    ? `<div class="slide-rec-badge">🎙️ Recorded</div>` : '';

  return `
    <div class="slide-inner scene-${slide.scene}">
      ${badge}
      <div class="slide-scene-label">${sm.label}</div>
      <div class="slide-content">
        <h2 class="slide-title">${escHtml(slide.title)}</h2>
        <div class="slide-title-bar"></div>
        <div class="slide-bullets">${bullets}</div>
      </div>
      <div class="slide-car-track">
        <div class="slide-road-line"></div>
        ${CAR_SVG}
      </div>
    </div>`;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderDots() {
  const wrap = document.getElementById('slideDots');
  wrap.innerHTML = S.slides.map((_, i) =>
    `<button class="slide-dot ${i === S.currentSlide ? 'active' : ''} ${S.recordings[i] ? 'done' : ''}"
      data-i="${i}" title="Slide ${i + 1}"></button>`
  ).join('');

  wrap.querySelectorAll('.slide-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      S.currentSlide = +btn.dataset.i;
      renderSlide(S.currentSlide);
      renderDots();
    });
  });
}

/* ══════════════════════════════════════════════════════
   RECORD VIEW — controls & logic
══════════════════════════════════════════════════════ */
function setupRecord() {
  document.getElementById('btnRecord').addEventListener('click',    startRec);
  document.getElementById('btnStopRec').addEventListener('click',   stopRec);
  document.getElementById('btnListenBack').addEventListener('click', listenBack);
  document.getElementById('btnTryAgain').addEventListener('click',   tryAgain);
  document.getElementById('btnKeepNext').addEventListener('click',   keepAndNext);
  document.getElementById('btnWatchNow').addEventListener('click',   watchNow);
  document.getElementById('btnSkip').addEventListener('click',       skipSlide);

  document.getElementById('btnPrevSlide').addEventListener('click', () => {
    if (S.currentSlide > 0) { S.currentSlide--; renderSlide(S.currentSlide); renderDots(); }
  });
  document.getElementById('btnNextSlide').addEventListener('click', () => {
    if (S.currentSlide < S.slides.length - 1) {
      S.currentSlide++;
      renderSlide(S.currentSlide);
      renderDots();
    }
  });
}

function syncRecordUI(idx) {
  const has  = !!S.recordings[idx];
  const last = idx === S.slides.length - 1;

  show('btnRecord',     true);
  show('btnStopRec',    false);
  show('btnListenBack', has);
  show('btnTryAgain',   has);
  show('btnKeepNext',   has && !last);
  show('btnWatchNow',   has && last);

  // If all slides recorded, always show watch button
  const allDone = S.slides.every((_, i) => !!S.recordings[i]);
  if (allDone) { show('btnWatchNow', true); show('btnKeepNext', false); }

  const ind  = document.getElementById('recIndicator');
  const txt  = document.getElementById('recStatusText');
  if (has) {
    ind.className   = 'rec-indicator done';
    txt.textContent = '✅ Recorded!';
  } else {
    ind.className   = 'rec-indicator';
    txt.textContent = 'Ready to record';
  }
}

async function startRec() {
  if (!S.recorder) {
    try {
      S.recorder = new VoiceRecorder('waveformCanvas');
      await S.recorder.init();
    } catch {
      showToast('🎙️ Microphone blocked — please allow access and try again.', 'error');
      S.recorder = null;
      return;
    }
  }

  await countdown();

  S.isRecording = true;
  S.recorder.start();

  show('btnRecord',     false);
  show('btnStopRec',    true);
  show('btnListenBack', false);
  show('btnTryAgain',   false);
  show('btnKeepNext',   false);
  show('btnWatchNow',   false);

  const ind = document.getElementById('recIndicator');
  ind.className = 'rec-indicator recording';
  document.getElementById('recStatusText').textContent = '🔴 Recording…';
}

async function stopRec() {
  if (!S.recorder || !S.isRecording) return;
  S.isRecording = false;

  const blob = await S.recorder.stop();
  const idx  = S.currentSlide;

  // Free old URL
  if (S.recordings[idx]) URL.revokeObjectURL(S.recordings[idx].url);
  S.recordings[idx] = { blob, url: URL.createObjectURL(blob) };

  show('btnRecord',  true);
  show('btnStopRec', false);

  syncRecordUI(idx);
  renderDots();

  // Refresh slide badge
  const stage = document.getElementById('slideStage');
  const inner = stage.querySelector('.slide-inner');
  if (inner && !inner.querySelector('.slide-rec-badge')) {
    inner.insertAdjacentHTML('afterbegin', '<div class="slide-rec-badge">🎙️ Recorded</div>');
  }

  showToast('Great job! 🎉 Listen back or keep it!', 'success');
}

function listenBack() {
  const rec = S.recordings[S.currentSlide];
  if (!rec) return;
  const a = new Audio(rec.url);
  a.play();
  showToast('▶️ Playing back…', 'info');
}

function tryAgain() {
  const idx = S.currentSlide;
  if (S.recordings[idx]) { URL.revokeObjectURL(S.recordings[idx].url); delete S.recordings[idx]; }
  if (S.recorder) S.recorder.clear();
  syncRecordUI(idx);
  renderDots();

  // Remove badge from slide
  const badge = document.querySelector('.slide-rec-badge');
  if (badge) badge.remove();

  showToast('No problem — try again when ready! 🎙️', 'info');
}

function keepAndNext() {
  if (S.currentSlide < S.slides.length - 1) {
    S.currentSlide++;
    renderSlide(S.currentSlide);
    renderDots();
    showToast(`On to slide ${S.currentSlide + 1}! 🏎️`, 'info');
  }
}

function watchNow() {
  if (!Object.keys(S.recordings).length) {
    showToast('Record at least one slide first!', 'error');
    return;
  }
  showView('preview');
  buildSummary();
  renderPreviewSlide(0);
}

function skipSlide() {
  if (S.currentSlide < S.slides.length - 1) {
    S.currentSlide++;
    renderSlide(S.currentSlide);
    renderDots();
  } else if (Object.keys(S.recordings).length > 0) {
    watchNow();
  } else {
    showToast('Record at least one slide first!', 'error');
  }
}

/* ── 3-2-1 countdown ── */
async function countdown() {
  const ov  = document.getElementById('countdownOverlay');
  const num = document.getElementById('countdownNumber');
  ov.classList.remove('hidden');

  for (let n = 3; n >= 1; n--) {
    num.textContent = n;
    num.className   = 'countdown-number pop';
    await wait(850);
  }
  num.textContent = 'GO! 🎙️';
  num.className   = 'countdown-number';
  await wait(380);
  ov.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════
   PREVIEW
══════════════════════════════════════════════════════ */
function setupPreview() {
  document.getElementById('btnPlayAll').addEventListener('click',   playAll);
  document.getElementById('btnStopAll').addEventListener('click',   stopAll);
  document.getElementById('btnGoReRecord').addEventListener('click', () => {
    showView('record');
    renderSlide(S.currentSlide);
    renderDots();
  });
  document.getElementById('btnNewPodcast').addEventListener('click', startOver);
}

function renderPreviewSlide(idx) {
  const slide = S.slides[idx];
  if (!slide) return;
  const stage = document.getElementById('previewStage');
  stage.innerHTML = buildSlideHTML(slide, !!S.recordings[idx]);
  document.getElementById('previewTitle').textContent   = slide.title;
  document.getElementById('previewCounter').textContent = `${idx + 1} / ${S.slides.length}`;
  const pct = ((idx + 1) / S.slides.length) * 100;
  document.getElementById('previewProgressBar').style.width = pct + '%';
}

function buildSummary() {
  const wrap = document.getElementById('slidesSummary');
  wrap.innerHTML = S.slides.map((s, i) => `
    <div class="summary-card ${S.recordings[i] ? 'has-rec' : ''}" data-i="${i}">
      <div class="summary-card-num">Slide ${i + 1}</div>
      <div class="summary-card-title">${escHtml(s.title)}</div>
      <div class="summary-card-badge">${S.recordings[i] ? '🎙️ Recorded' : '— no recording'}</div>
    </div>
  `).join('');

  wrap.querySelectorAll('.summary-card').forEach(card => {
    card.addEventListener('click', () => {
      S.currentSlide = +card.dataset.i;
      showView('record');
      renderSlide(S.currentSlide);
      renderDots();
    });
  });
}

async function playAll() {
  S.isPlaying   = true;
  S.previewIdx  = 0;
  show('btnPlayAll', false);
  show('btnStopAll', true);
  await playSlide(0);
}

async function playSlide(idx) {
  if (!S.isPlaying || idx >= S.slides.length) {
    if (S.isPlaying) {
      stopAll();
      showToast('🎉 Amazing podcast! Great job!', 'success');
    }
    return;
  }

  renderPreviewSlide(idx);

  const rec = S.recordings[idx];
  if (rec) {
    S.previewAudio = new Audio(rec.url);
    S.previewAudio.onended = () => {
      if (S.isPlaying) { wait(600).then(() => playSlide(idx + 1)); }
    };
    S.previewAudio.onerror = () => {
      if (S.isPlaying) { wait(2000).then(() => playSlide(idx + 1)); }
    };
    S.previewAudio.play().catch(() => {
      if (S.isPlaying) wait(2500).then(() => playSlide(idx + 1));
    });
  } else {
    // No recording: show for 3 s then advance
    await wait(3000);
    if (S.isPlaying) playSlide(idx + 1);
  }
}

function stopAll() {
  S.isPlaying = false;
  if (S.previewAudio) { S.previewAudio.pause(); S.previewAudio = null; }
  show('btnPlayAll', true);
  show('btnStopAll', false);
}

function startOver() {
  stopAll();
  if (S.recorder) { S.recorder.destroy(); S.recorder = null; }
  Object.values(S.recordings).forEach(r => URL.revokeObjectURL(r.url));

  S.slides        = [];
  S.currentSlide  = 0;
  S.recordings    = {};
  S.isRecording   = false;
  S.uploadedText  = '';

  document.getElementById('pasteText').value  = '';
  document.getElementById('podcastPrompt').value = '';
  document.getElementById('fileNameDisplay').classList.add('hidden');
  document.getElementById('fileInput').value  = '';

  showView('upload');
  showToast('Ready for a new podcast! 🏎️', 'success');
}

/* ══════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════ */
function show(id, visible) {
  document.getElementById(id).classList.toggle('hidden', !visible);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let _toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.className    = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3200);
}
