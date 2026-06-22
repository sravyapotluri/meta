/* ============================================================
   Cars Podcast Studio — Main App
   ============================================================ */

/* ── Smart scene detection based on slide content ─ */
const SCENE_KEYWORDS = {
  racetrack: ['race','racing','track','lap','circuit','formula','nascar','speedway','pit','flag','driver','grand prix'],
  highway:   ['road','highway','drive','travel','journey','trip','route','street','traffic','freeway','distance'],
  factory:   ['build','built','factory','engine','manufacture','design','inventor','patent','invention','parts','model','assemble','engineer'],
  winner:    ['win','winner','champion','record','best','fastest','award','trophy','achievement','history','first ever','landmark'],
  vintage:   ['history','old','ancient','vintage','classic','early','original','century','1800','1900','1910','1920','1930','first','invented','origin','beginning'],
};

function detectScene(title, bullets, script) {
  const text = [title, ...(bullets||[]), script||''].join(' ').toLowerCase();
  let best = 'racetrack', bestScore = 0;
  for (const [scene, kws] of Object.entries(SCENE_KEYWORDS)) {
    const score = kws.filter(k => text.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = scene; }
  }
  return best;
}

/* ── State ─────────────────────────────────────── */
const S = {
  slides:       [],
  currentSlide: 0,
  recordings:   {},   // index -> { blob, url }
  recordAnim:   null, // SlideAnimator for record view
  previewAnim:  null, // SlideAnimator for preview view
  recInstance:  null, // VoiceRecorder
  isRecording:  false,
  isPlaying:    false,
  previewAudio: null,
  uploadedText: '',
  audioCtx:     null,
  analyser:     null,
};

/* ── Boot ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupUpload();
  setupRecord();
  setupPreview();
});

/* ══════════════════════════════════════════════════
   VIEW MANAGEMENT
══════════════════════════════════════════════════ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const map = { upload:1, processing:1, record:3, preview:4 };
  const cur = map[name]||1;
  document.querySelectorAll('.step-item').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('active', n===cur);
    el.classList.toggle('done',   n<cur);
  });

  // Start / stop animators based on view
  if (name==='record' && S.recordAnim) S.recordAnim.start();
  else if (name!=='record' && S.recordAnim) S.recordAnim.stop();

  if (name==='preview' && S.previewAnim) S.previewAnim.start();
  else if (name!=='preview' && S.previewAnim) S.previewAnim.stop();
}

/* ══════════════════════════════════════════════════
   UPLOAD / FILE PARSING
══════════════════════════════════════════════════ */
function setupUpload() {
  const zone  = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  document.getElementById('btnBrowse').addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
  input.addEventListener('change', e => { if(e.target.files[0]) handleFile(e.target.files[0]); });
  document.getElementById('btnGenerate').addEventListener('click', generate);
}

function handleFile(file) {
  const d = document.getElementById('fileNameDisplay');
  d.textContent = `📄 ${file.name}`; d.classList.remove('hidden');
  showToast('Reading file…','info');
  parseFile(file).then(t => { S.uploadedText=t; showToast(`✅ Loaded: ${file.name}`,'success'); })
    .catch(e => showToast(`❌ ${e.message}`,'error'));
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext==='txt')  return parseTxt(file);
  if (ext==='pdf')  return parsePDF(file);
  if (ext==='pptx') return parsePPTX(file);
  throw new Error('Use .txt, .pdf, or .pptx');
}

function parseTxt(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=()=>rej(new Error('Read failed')); r.readAsText(file); });
}

async function parsePDF(file) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise;
  let out='';
  for (let i=1;i<=pdf.numPages;i++) {
    const pg=await pdf.getPage(i); const tc=await pg.getTextContent();
    out+=tc.items.map(it=>it.str).join(' ')+'\n\n';
  }
  return out;
}

async function parsePPTX(file) {
  if (!window.JSZip) throw new Error('JSZip not loaded');
  const zip   = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files)
    .filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a,b)=>parseInt(a.match(/(\d+)/)[1])-parseInt(b.match(/(\d+)/)[1]));
  const blocks=[];
  for (const name of names) {
    const xml=await zip.files[name].async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const ns='http://schemas.openxmlformats.org/drawingml/2006/main';
    const els=doc.getElementsByTagNameNS(ns,'t');
    const texts=[]; for (const el of els) { const t=el.textContent.trim(); if(t) texts.push(t); }
    if (texts.length) blocks.push(texts.join('\n'));
  }
  return blocks.join('\n\n---\n\n');
}

function loadScript(src) {
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
}

/* ══════════════════════════════════════════════════
   GENERATE SLIDES
══════════════════════════════════════════════════ */
async function generate() {
  const pasted = document.getElementById('pasteText').value.trim();
  const prompt = document.getElementById('podcastPrompt').value.trim();
  const text   = S.uploadedText || pasted;
  if (!text) { showToast('Upload a file or paste notes first!','error'); return; }

  showView('processing');
  setProgress(0,'Reading your notes…'); await wait(300);
  setProgress(25,'Breaking into slides…'); await wait(400);

  const slides = buildSlides(text, prompt);
  S.slides=slides; S.currentSlide=0; S.recordings={};

  setProgress(60,'Adding animations…'); await wait(500);
  setProgress(90,'Almost done…'); await wait(300);
  setProgress(100,"Let's go! 🏎️"); await wait(250);

  // Init animators
  if (S.recordAnim)  S.recordAnim.stop();
  if (S.previewAnim) S.previewAnim.stop();
  S.recordAnim  = new SlideAnimator(document.getElementById('recordCanvas'));
  S.previewAnim = new SlideAnimator(document.getElementById('previewCanvas'));

  showView('record');
  renderSlide(0);
  renderDots();
}

function setProgress(pct, msg) {
  document.getElementById('processingMsg').textContent    = msg;
  document.getElementById('progressFill').style.width     = pct+'%';
  document.getElementById('processingDetail').textContent = pct<100 ? `${pct}% complete` : '🏁 Ready!';
}

/* ── Text → Slides ─────────────────────────────── */
function buildSlides(text, prompt) {
  text = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();

  let rawSlides;
  if (text.includes('\n---\n')) {
    rawSlides = text.split('\n---\n').filter(b=>b.trim()).map((b,i)=>blockToSlide(b,i));
  } else {
    const sections = detectSections(text);
    rawSlides = sections.length>=2
      ? sections.map((s,i)=>({ id:i, title:s.title||`Part ${i+1}`, bullets:s.bullets||[], script:s.script||s.title }))
      : sentenceSplit(text, prompt);
  }

  // Add intro slide if there's a prompt
  if (prompt) {
    rawSlides.unshift({ id:-1, title: prompt, bullets:['Let\'s find out! 🚀','Starting now…'], script:`Welcome! Today I'm talking about: ${prompt}` });
    rawSlides.forEach((s,i)=>{ s.id=i; });
  }

  // Assign scenes based on CONTENT (not round-robin)
  rawSlides.forEach(s => {
    s.scene = detectScene(s.title, s.bullets, s.script);
  });

  return rawSlides;
}

function blockToSlide(block, i) {
  const lines  = block.trim().split('\n').map(l=>l.trim()).filter(Boolean);
  const title  = lines[0]||`Slide ${i+1}`;
  const rest   = lines.slice(1);
  const bullets= rest.slice(0,5).map(l=>l.replace(/^[-*•]\s*/,''));
  const script = rest.join(' ')||title;
  return { id:i, title, bullets, script };
}

function detectSections(text) {
  const lines=[]; const sections=[]; let cur={title:'',rawLines:[]};
  for (const line of text.split('\n')) {
    const t=line.trim(); if(!t) continue;
    const isH = /^#+\s/.test(t)||/^\d+[\.\)]\s/.test(t)||
      (t.length<80&&t===t.toUpperCase()&&t.length>4)||
      (t.endsWith(':')&&t.split(' ').length<=9)||
      (!cur.title&&t.split(' ').length<=10&&/^[A-Z]/.test(t));
    if (isH && cur.rawLines.length>0) { sections.push(finishSection(cur,sections.length)); cur={title:cleanH(t),rawLines:[]}; }
    else if (isH&&!cur.title) { cur.title=cleanH(t); }
    else { cur.rawLines.push(t); }
  }
  if (cur.title||cur.rawLines.length) sections.push(finishSection(cur,sections.length));
  return sections;
}
function cleanH(t){ return t.replace(/^#+\s*/,'').replace(/:$/,'').trim(); }
function finishSection(cur,i){
  const title=cur.title||cur.rawLines[0]||`Part ${i+1}`;
  const script=cur.rawLines.join(' ');
  const bullets=extractBullets(cur.rawLines);
  return {title,bullets,script};
}
function extractBullets(lines){
  if (lines.some(l=>/^[-*•]/.test(l)))
    return lines.filter(l=>/^[-*•]/.test(l)).map(l=>l.replace(/^[-*•]\s*/,'').trim()).slice(0,5);
  const sents=(lines.join(' ').match(/[^.!?]+[.!?]+/g)||[lines.join(' ')]);
  return sents.slice(0,4).map(s=>s.trim());
}

function sentenceSplit(text, prompt) {
  const sents = text.match(/[^.!?]+[.!?]+/g)||[text];
  const count = Math.max(3,Math.min(10,Math.ceil(sents.length/3)));
  const perSlide = Math.ceil(sents.length/count);
  return Array.from({length:count},(_,i)=>{
    const chunk=sents.slice(i*perSlide,(i+1)*perSlide);
    const script=chunk.join(' ').trim();
    const title=i===0?(prompt||'Introduction')+'  🎙️':clip(chunk[0],55)||`Part ${i+1}`;
    return { id:i, title, bullets:chunk.slice(1,4).map(s=>clip(s.trim(),80)), script };
  });
}

function clip(s,n){ if(!s) return ''; return s.length>n?s.slice(0,n-1)+'…':s; }

/* ══════════════════════════════════════════════════
   SLIDE RENDERING
══════════════════════════════════════════════════ */
function renderSlide(idx) {
  const slide = S.slides[idx];
  if (!slide||!S.recordAnim) return;

  S.recordAnim.loadSlide(slide);

  document.getElementById('scriptText').textContent = slide.script||[slide.title,...(slide.bullets||[])].join('. ');
  document.getElementById('slideCounter').textContent = `Slide ${idx+1} of ${S.slides.length}`;
  document.getElementById('btnPrevSlide').disabled = idx===0;
  document.getElementById('btnNextSlide').disabled = idx===S.slides.length-1;

  syncRecUI(idx);
}

function renderDots() {
  const wrap = document.getElementById('slideDots');
  wrap.innerHTML = S.slides.map((_,i)=>
    `<button class="slide-dot ${i===S.currentSlide?'active':''} ${S.recordings[i]?'done':''}" data-i="${i}" title="Slide ${i+1}"></button>`
  ).join('');
  wrap.querySelectorAll('.slide-dot').forEach(b=>{
    b.addEventListener('click',()=>{ S.currentSlide=+b.dataset.i; renderSlide(S.currentSlide); renderDots(); });
  });
}

/* ══════════════════════════════════════════════════
   RECORD VIEW
══════════════════════════════════════════════════ */
function setupRecord() {
  document.getElementById('btnRecord').addEventListener('click',    startRec);
  document.getElementById('btnStopRec').addEventListener('click',   stopRec);
  document.getElementById('btnListenBack').addEventListener('click', listenBack);
  document.getElementById('btnTryAgain').addEventListener('click',   tryAgain);
  document.getElementById('btnKeepNext').addEventListener('click',   keepAndNext);
  document.getElementById('btnWatchNow').addEventListener('click',   watchNow);
  document.getElementById('btnSkip').addEventListener('click',       skipSlide);
  document.getElementById('btnPrevSlide').addEventListener('click',  ()=>{ if(S.currentSlide>0){ S.currentSlide--; renderSlide(S.currentSlide); renderDots(); } });
  document.getElementById('btnNextSlide').addEventListener('click',  ()=>{ if(S.currentSlide<S.slides.length-1){ S.currentSlide++; renderSlide(S.currentSlide); renderDots(); } });
}

function syncRecUI(idx) {
  const has  = !!S.recordings[idx];
  const last = idx===S.slides.length-1;
  const all  = S.slides.every((_,i)=>!!S.recordings[i]);
  show('btnRecord',    true);
  show('btnStopRec',   false);
  show('btnListenBack',has);
  show('btnTryAgain',  has);
  show('btnKeepNext',  has&&!last&&!all);
  show('btnWatchNow',  has&&(last||all));
  const ind=document.getElementById('recIndicator');
  const txt=document.getElementById('recStatusText');
  if (has){ ind.className='rec-indicator done'; txt.textContent='✅ Recorded!'; }
  else    { ind.className='rec-indicator';      txt.textContent='Ready to record'; }
}

async function startRec() {
  if (!S.recInstance) {
    try {
      S.recInstance = new VoiceRecorder('waveformCanvas');
      await S.recInstance.init();
    } catch { showToast('🎙️ Microphone blocked — please allow access','error'); S.recInstance=null; return; }
  }
  await countdown();
  S.isRecording = true;
  S.recInstance.start();
  show('btnRecord',false); show('btnStopRec',true);
  show('btnListenBack',false); show('btnTryAgain',false);
  show('btnKeepNext',false); show('btnWatchNow',false);
  document.getElementById('recIndicator').className='rec-indicator recording';
  document.getElementById('recStatusText').textContent='🔴 Recording…';
}

async function stopRec() {
  if (!S.recInstance||!S.isRecording) return;
  S.isRecording=false;
  const blob=await S.recInstance.stop();
  const idx=S.currentSlide;
  if (S.recordings[idx]) URL.revokeObjectURL(S.recordings[idx].url);
  S.recordings[idx]={blob, url:URL.createObjectURL(blob)};
  show('btnRecord',true); show('btnStopRec',false);
  syncRecUI(idx); renderDots();
  showToast('Great job! 🎉 Listen back or keep it!','success');
}

function listenBack() {
  const r=S.recordings[S.currentSlide]; if(!r) return;
  new Audio(r.url).play();
  showToast('▶️ Playing back…','info');
}

function tryAgain() {
  const idx=S.currentSlide;
  if (S.recordings[idx]){ URL.revokeObjectURL(S.recordings[idx].url); delete S.recordings[idx]; }
  if (S.recInstance) S.recInstance.clear();
  syncRecUI(idx); renderDots();
  showToast('No problem — try again! 🎙️','info');
}

function keepAndNext() {
  if (S.currentSlide<S.slides.length-1){ S.currentSlide++; renderSlide(S.currentSlide); renderDots(); }
}

function watchNow() {
  if (!Object.keys(S.recordings).length){ showToast('Record at least one slide first!','error'); return; }
  showView('preview');
  buildSummary();
  if (S.previewAnim) { S.previewAnim.loadSlide(S.slides[0],true); }
}

function skipSlide() {
  if (S.currentSlide<S.slides.length-1){ S.currentSlide++; renderSlide(S.currentSlide); renderDots(); }
  else if (Object.keys(S.recordings).length>0) watchNow();
  else showToast('Record at least one slide first!','error');
}

async function countdown() {
  const ov=document.getElementById('countdownOverlay');
  const num=document.getElementById('countdownNumber');
  ov.classList.remove('hidden');
  for (let n=3;n>=1;n--){ num.textContent=n; num.className='countdown-number pop'; await wait(850); }
  num.textContent='GO! 🎙️'; num.className='countdown-number';
  await wait(380); ov.classList.add('hidden');
}

/* ══════════════════════════════════════════════════
   PREVIEW + VIDEO EXPORT
══════════════════════════════════════════════════ */
function setupPreview() {
  document.getElementById('btnPlayAll').addEventListener('click',    playAll);
  document.getElementById('btnStopAll').addEventListener('click',    stopAll);
  document.getElementById('btnExportVideo').addEventListener('click', exportVideo);
  document.getElementById('btnGoReRecord').addEventListener('click', ()=>{ showView('record'); renderSlide(S.currentSlide); renderDots(); });
  document.getElementById('btnNewPodcast').addEventListener('click', startOver);
}

function buildSummary() {
  const wrap=document.getElementById('slidesSummary');
  wrap.innerHTML=S.slides.map((s,i)=>`
    <div class="summary-card ${S.recordings[i]?'has-rec':''}" data-i="${i}">
      <div class="summary-card-num">Slide ${i+1}</div>
      <div class="summary-card-title">${esc(s.title)}</div>
      <div class="summary-card-badge">${S.recordings[i]?'🎙️ Recorded':'— no recording'}</div>
    </div>`).join('');
  wrap.querySelectorAll('.summary-card').forEach(c=>{
    c.addEventListener('click',()=>{ S.currentSlide=+c.dataset.i; showView('record'); renderSlide(S.currentSlide); renderDots(); });
  });
}

let _previewIdx=0;

async function playAll() {
  S.isPlaying=true; _previewIdx=0;
  show('btnPlayAll',false); show('btnStopAll',true);
  // Wire up audio-reactive analyser for first slide
  await playPreviewSlide(0);
}

async function playPreviewSlide(idx) {
  if (!S.isPlaying||idx>=S.slides.length){ if(S.isPlaying){ stopAll(); showToast('🎉 Amazing podcast! Great job!','success'); } return; }
  const slide=S.slides[idx];
  S.previewAnim.loadSlide(slide,idx===0);
  document.getElementById('previewTitle').textContent     = slide.title;
  document.getElementById('previewCounter').textContent   = `${idx+1} / ${S.slides.length}`;
  document.getElementById('previewProgressBar').style.width = ((idx+1)/S.slides.length*100)+'%';

  const rec=S.recordings[idx];
  if (rec) {
    S.previewAudio=new Audio(rec.url);
    // Audio reactivity via Web Audio
    _wireAudioReactivity(S.previewAudio, S.previewAnim);
    S.previewAudio.onended=()=>{ if(S.isPlaying){ wait(500).then(()=>playPreviewSlide(idx+1)); } };
    S.previewAudio.onerror=()=>{ if(S.isPlaying){ wait(1500).then(()=>playPreviewSlide(idx+1)); } };
    S.previewAudio.play().catch(()=>{ if(S.isPlaying) wait(2500).then(()=>playPreviewSlide(idx+1)); });
  } else {
    await wait(3000); if(S.isPlaying) playPreviewSlide(idx+1);
  }
}

function _wireAudioReactivity(audioEl, animator) {
  try {
    if (!S.audioCtx) S.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const src=S.audioCtx.createMediaElementSource(audioEl);
    const an=S.audioCtx.createAnalyser(); an.fftSize=64;
    src.connect(an); src.connect(S.audioCtx.destination);
    const buf=new Uint8Array(an.frequencyBinCount);
    const tick=()=>{ if(!audioEl.paused&&!audioEl.ended){ an.getByteFrequencyData(buf); const avg=buf.reduce((a,b)=>a+b,0)/buf.length; animator.setAudioLevel(avg/128); requestAnimationFrame(tick); } else { animator.setAudioLevel(0); } };
    tick();
  } catch { /* ignore - audio reactivity is optional */ }
}

function stopAll() {
  S.isPlaying=false;
  if (S.previewAudio){ S.previewAudio.pause(); S.previewAudio=null; }
  if (S.previewAnim) S.previewAnim.setAudioLevel(0);
  show('btnPlayAll',true); show('btnStopAll',false);
}

/* ── Video Export ──────────────────────────────── */
async function exportVideo() {
  if (!Object.keys(S.recordings).length){ showToast('Record at least one slide first!','error'); return; }

  const canvas = document.getElementById('previewCanvas');
  let canvasStream;
  try { canvasStream=canvas.captureStream(30); }
  catch { showToast('Video export not supported in this browser. Try Chrome!','error'); return; }

  const exportAudioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const dest = exportAudioCtx.createMediaStreamDestination();

  const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(m=>MediaRecorder.isTypeSupported(m))||'video/webm';

  const combined = new MediaStream([...canvasStream.getVideoTracks(),...dest.stream.getAudioTracks()]);
  const mr = new MediaRecorder(combined,{mimeType,videoBitsPerSecond:4000000});
  const chunks=[]; mr.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };

  // Show export modal
  const modal=document.getElementById('exportModal');
  modal.classList.remove('hidden');
  setExportProgress(0,'Getting ready…',S.slides.length);

  mr.start(100);

  for (let i=0;i<S.slides.length;i++) {
    S.previewAnim.loadSlide(S.slides[i], i===0);
    setExportProgress(i, `Recording slide ${i+1} of ${S.slides.length}…`, S.slides.length);
    const rec=S.recordings[i];
    if (rec) {
      try {
        const ab  = await rec.blob.arrayBuffer();
        const buf = await exportAudioCtx.decodeAudioData(ab);
        const src = exportAudioCtx.createBufferSource();
        src.buffer=buf; src.connect(dest); src.start();
        await new Promise(res=>{ src.onended=res; setTimeout(res,buf.duration*1000+200); });
      } catch { await wait(2500); }
    } else { await wait(2500); }
    await wait(400);
  }

  // Outro slide
  S.previewAnim.loadSlide({
    title: '🏎️ Thanks for Watching!',
    bullets: ['Subscribe for more amazing facts! ⭐','Give this a like! 👍','See you next time! 🏁'],
    script: 'Thanks for watching! Please subscribe!',
    scene: 'winner'
  }, false);
  await wait(3500);

  mr.stop();
  exportAudioCtx.close();

  mr.onstop=()=>{
    const blob=new Blob(chunks,{type:'video/webm'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const title=S.slides[0]?.title?.replace(/[^a-zA-Z0-9 ]/g,'').trim()||'my-podcast';
    a.href=url; a.download=`${title}.webm`; a.click();
    modal.classList.add('hidden');
    showToast('🎬 Video downloaded! Share it! 🚀','success');
  };
}

function setExportProgress(current, msg, total) {
  document.getElementById('exportMsg').textContent    = msg;
  document.getElementById('exportProgressBar').style.width = ((current/total)*100)+'%';
}

function startOver() {
  stopAll();
  if (S.recInstance){ S.recInstance.destroy(); S.recInstance=null; }
  if (S.recordAnim) { S.recordAnim.stop();  S.recordAnim=null; }
  if (S.previewAnim){ S.previewAnim.stop(); S.previewAnim=null; }
  Object.values(S.recordings).forEach(r=>URL.revokeObjectURL(r.url));
  Object.assign(S,{slides:[],currentSlide:0,recordings:{},isRecording:false,isPlaying:false,uploadedText:''});
  document.getElementById('pasteText').value='';
  document.getElementById('podcastPrompt').value='';
  document.getElementById('fileNameDisplay').classList.add('hidden');
  document.getElementById('fileInput').value='';
  showView('upload');
  showToast('Ready for a new podcast! 🏎️','success');
}

/* ── Utilities ─────────────────────────────────── */
function show(id,v){ document.getElementById(id).classList.toggle('hidden',!v); }
function wait(ms)  { return new Promise(r=>setTimeout(r,ms)); }
function esc(s)    { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let _toastTimer=null;
function showToast(msg,type='info'){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=`toast show ${type}`;
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>{ el.className='toast hidden'; },3200);
}
