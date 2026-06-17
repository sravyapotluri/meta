'use strict';

// ── Elements ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const video         = $('video');
const overlay       = $('overlay');
const modelStatus   = $('modelStatus');
const fpsCounter    = $('fpsCounter');
const btnSwitchView = $('btnSwitchView');

// Result panel
const resultEmpty   = $('resultEmpty');
const resultCard    = $('resultCard');
const resultUnknown = $('resultUnknown');
const resultPhoto   = $('resultPhoto');
const resultName    = $('resultName');
const resultTitle   = $('resultTitle');
const resultCompany = $('resultCompany');
const resultConfidence = $('resultConfidence');

// Admin
const btnAddPerson  = $('btnAddPerson');
const personGrid    = $('personGrid');

// Modal
const personModal       = $('personModal');
const modalTitle        = $('modalTitle');
const btnCloseModal     = $('btnCloseModal');
const btnCancelModal    = $('btnCancelModal');
const btnSavePerson     = $('btnSavePerson');
const captureVideo      = $('captureVideo');
const captureCanvas     = $('captureCanvas');
const capturePreview    = $('capturePreview');
const captureFaceBox    = $('captureFaceBox');
const btnCapture        = $('btnCapture');
const btnRetake         = $('btnRetake');
const fileInput         = $('fileInput');
const faceDetectStatus  = $('faceDetectStatus');
const fieldName         = $('fieldName');
const fieldTitle        = $('fieldTitle');
const fieldCompany      = $('fieldCompany');
const fieldPhone        = $('fieldPhone');
const fieldEmail        = $('fieldEmail');
const fieldNotes        = $('fieldNotes');

// ── State ─────────────────────────────────────────────────────
let currentView       = 'recognition'; // 'recognition' | 'admin'
let recognitionLoop   = null;
let captureStream     = null;
let capturedDescriptor = null;
let capturedPhotoUrl  = null;
let editingPersonId   = null;
let lastResult        = null;
let frameCount        = 0;
let fpsTime           = Date.now();
let announceCooldown  = {};

// ── Boot ─────────────────────────────────────────────────────
(async () => {
  // Load face-api models
  try {
    await Recognizer.loadModels(msg => {
      if (msg === 'ready') {
        modelStatus.textContent = 'Models ready';
        modelStatus.className   = 'status-badge ready';
        startRecognition();
      } else {
        modelStatus.textContent = msg;
      }
    });
  } catch (e) {
    modelStatus.textContent = 'Model load failed';
    modelStatus.className   = 'status-badge error';
    showToast('Failed to load face recognition models. Check console.', 'error');
    console.error(e);
  }

  await Recognizer.rebuildIndex();
})();

// ── Camera ────────────────────────────────────────────────────
async function startCamera(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });
    videoEl.srcObject = stream;
    return stream;
  } catch (e) {
    if (videoEl === video) $('noCamera').classList.remove('hidden');
    return null;
  }
}

function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

// ── Recognition loop ──────────────────────────────────────────
async function startRecognition() {
  const stream = await startCamera(video);
  if (!stream) return;

  video.addEventListener('loadedmetadata', () => {
    overlay.width  = video.videoWidth;
    overlay.height = video.videoHeight;
  });

  async function loop() {
    if (currentView !== 'recognition') {
      recognitionLoop = requestAnimationFrame(loop);
      return;
    }

    const results = await Recognizer.detectAndMatch(video);

    // Annotate canvas
    const ctx = overlay.getContext('2d');
    overlay.width  = video.videoWidth;
    overlay.height = video.videoHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    let bestMatch = null;

    for (const r of results) {
      const box    = r.detection.box;
      const isKnown = !!r.match;
      const color   = isKnown ? '#3ddc84' : '#f44336';

      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Look up person if matched
      let label = 'Unknown';
      if (isKnown) {
        const person = await DB.getPerson(r.match.personId);
        if (person) {
          label = person.name;
          const conf = Math.round((1 - r.match.distance) * 100);
          if (!bestMatch || conf > bestMatch.conf) bestMatch = { person, conf };
        }
      }

      const fontSize = Math.max(13, Math.min(20, box.width * 0.14));
      ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color + 'cc';
      ctx.fillRect(box.x, box.y - fontSize - 8, tw + 12, fontSize + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, box.x + 6, box.y - 6);
    }

    updateResultPanel(results.length, bestMatch);

    // FPS
    frameCount++;
    const now = Date.now();
    if (now - fpsTime >= 1000) {
      fpsCounter.textContent = `${frameCount} fps`;
      frameCount = 0; fpsTime = now;
    }

    recognitionLoop = requestAnimationFrame(loop);
  }

  recognitionLoop = requestAnimationFrame(loop);
}

function updateResultPanel(faceCount, best) {
  if (faceCount === 0) {
    resultEmpty.classList.remove('hidden');
    resultCard.classList.add('hidden');
    resultUnknown.classList.add('hidden');
  } else if (best) {
    const { person, conf } = best;
    resultEmpty.classList.add('hidden');
    resultUnknown.classList.add('hidden');
    resultCard.classList.remove('hidden');

    resultName.textContent       = person.name;
    resultTitle.textContent      = person.title || '';
    resultCompany.textContent    = person.company || '';
    resultConfidence.textContent = `${conf}%`;
    resultPhoto.src = person.photoDataUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';

    setDetailRow('resultPhoneRow', 'resultPhone', person.phone);
    setDetailRow('resultEmailRow', 'resultEmail', person.email);
    setDetailRow('resultNotesRow', 'resultNotes', person.notes);

    // TTS via SpeechSynthesis (built-in browser API — speaks through whatever audio output is active)
    const now = Date.now();
    if (!announceCooldown[person.id] || now - announceCooldown[person.id] > 5000) {
      announceCooldown[person.id] = now;
      speakResult(person);
    }
  } else {
    resultEmpty.classList.add('hidden');
    resultCard.classList.add('hidden');
    resultUnknown.classList.remove('hidden');
  }
}

function setDetailRow(rowId, textId, value) {
  if (value) {
    $(rowId).classList.remove('hidden');
    $(textId).textContent = value;
  } else {
    $(rowId).classList.add('hidden');
  }
}

function speakResult(person) {
  if (!window.speechSynthesis) return;
  let text = person.name;
  if (person.title && person.company) text += `, ${person.title} at ${person.company}`;
  else if (person.title)   text += `, ${person.title}`;
  else if (person.company) text += ` from ${person.company}`;
  const utt = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

// ── View switching ────────────────────────────────────────────
btnSwitchView.addEventListener('click', () => {
  if (currentView === 'recognition') {
    currentView = 'admin';
    $('recognitionView').classList.remove('active');
    $('adminView').classList.add('active');
    btnSwitchView.textContent = 'Live Camera';
    loadAdminGrid();
  } else {
    currentView = 'recognition';
    $('adminView').classList.remove('active');
    $('recognitionView').classList.add('active');
    btnSwitchView.textContent = 'Admin Panel';
  }
});

// ── Admin grid ────────────────────────────────────────────────
async function loadAdminGrid() {
  const persons = await DB.getAllPersons();
  if (persons.length === 0) {
    personGrid.innerHTML = `
      <div class="empty-grid">
        <div style="font-size:3rem">👤</div>
        <p>No people enrolled yet.<br>Click <strong>+ Add Person</strong> to get started.</p>
      </div>`;
    return;
  }
  personGrid.innerHTML = persons.map(p => `
    <div class="person-card" data-id="${p.id}">
      <div class="person-card-photo">
        ${p.photoDataUrl
          ? `<img src="${p.photoDataUrl}" alt="${p.name}" />`
          : '👤'}
      </div>
      <div class="person-card-info">
        <div class="person-card-name">${escHtml(p.name)}</div>
        <div class="person-card-sub">${escHtml([p.title, p.company].filter(Boolean).join(' · ')) || '—'}</div>
      </div>
      <div class="person-card-actions">
        <button class="btn btn-sm btn-outline btn-edit" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${p.id}">Delete</button>
      </div>
    </div>`).join('');

  personGrid.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openModal(Number(btn.dataset.id)); }));
  personGrid.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); deletePerson(Number(btn.dataset.id)); }));
}

async function deletePerson(id) {
  if (!confirm('Delete this person and their face data?')) return;
  await DB.deletePerson(id);
  await Recognizer.rebuildIndex();
  loadAdminGrid();
  showToast('Person deleted');
}

btnAddPerson.addEventListener('click', () => openModal(null));

// ── Modal ─────────────────────────────────────────────────────
async function openModal(personId) {
  editingPersonId   = personId;
  capturedDescriptor = null;
  capturedPhotoUrl   = null;

  modalTitle.textContent = personId ? 'Edit Person' : 'Add Person';
  btnSavePerson.textContent = personId ? 'Save Changes' : 'Enroll Person';
  btnSavePerson.disabled = true;

  // Reset photo section
  capturePreview.classList.add('hidden');
  capturePreview.src = '';
  captureCanvas.classList.add('hidden');
  captureFaceBox.classList.add('hidden');
  captureVideo.classList.remove('hidden');
  btnCapture.classList.remove('hidden');
  btnRetake.classList.add('hidden');
  faceDetectStatus.textContent = '';

  // Reset form
  fieldName.value    = '';
  fieldTitle.value   = '';
  fieldCompany.value = '';
  fieldPhone.value   = '';
  fieldEmail.value   = '';
  fieldNotes.value   = '';

  if (personId) {
    const p = await DB.getPerson(personId);
    if (p) {
      fieldName.value    = p.name    || '';
      fieldTitle.value   = p.title   || '';
      fieldCompany.value = p.company || '';
      fieldPhone.value   = p.phone   || '';
      fieldEmail.value   = p.email   || '';
      fieldNotes.value   = p.notes   || '';
      if (p.photoDataUrl) {
        capturePreview.src = p.photoDataUrl;
        capturePreview.classList.remove('hidden');
        captureVideo.classList.add('hidden');
        btnCapture.classList.add('hidden');
        btnRetake.classList.remove('hidden');
        capturedPhotoUrl = p.photoDataUrl;
        // Allow save without re-capturing face
        updateSaveButton();
      }
    }
  }

  personModal.classList.remove('hidden');
  captureStream = await startCamera(captureVideo);
  fieldName.addEventListener('input', updateSaveButton);
}

function closeModal() {
  personModal.classList.add('hidden');
  stopStream(captureStream);
  captureStream = null;
  fieldName.removeEventListener('input', updateSaveButton);
}

function updateSaveButton() {
  const hasName  = fieldName.value.trim().length > 0;
  const hasPhoto = !!capturedPhotoUrl;
  btnSavePerson.disabled = !(hasName && (hasPhoto || editingPersonId));
}

btnCloseModal.addEventListener('click',  closeModal);
btnCancelModal.addEventListener('click', closeModal);
personModal.addEventListener('click', e => { if (e.target === personModal) closeModal(); });

// Capture button
btnCapture.addEventListener('click', async () => {
  if (!captureStream) return;

  // Draw current frame to canvas
  captureCanvas.width  = captureVideo.videoWidth;
  captureCanvas.height = captureVideo.videoHeight;
  captureCanvas.getContext('2d').drawImage(captureVideo, 0, 0);
  captureCanvas.classList.remove('hidden');

  faceDetectStatus.textContent = 'Detecting face…';
  btnCapture.disabled = true;

  const result = await Recognizer.computeDescriptor(captureCanvas);

  if (!result) {
    faceDetectStatus.textContent = '⚠ No face detected. Try again with better lighting.';
    captureCanvas.classList.add('hidden');
    btnCapture.disabled = false;
    return;
  }

  capturedDescriptor = result.descriptor;

  // Show captured photo
  capturedPhotoUrl = captureCanvas.toDataURL('image/jpeg', 0.85);
  capturePreview.src = capturedPhotoUrl;
  capturePreview.classList.remove('hidden');
  captureCanvas.classList.add('hidden');
  captureVideo.classList.add('hidden');
  btnCapture.classList.add('hidden');
  btnRetake.classList.remove('hidden');

  // Draw face box on preview
  const previewW  = capturePreview.offsetWidth || 240;
  const scaleX    = previewW / captureCanvas.width;
  const scaleY    = previewW / captureCanvas.height;
  const box       = result.box;
  captureFaceBox.style.left   = `${box.x * scaleX}px`;
  captureFaceBox.style.top    = `${box.y * scaleY}px`;
  captureFaceBox.style.width  = `${box.width * scaleX}px`;
  captureFaceBox.style.height = `${box.height * scaleY}px`;
  captureFaceBox.classList.remove('hidden');

  const conf = Math.round(100);
  faceDetectStatus.textContent = `✓ Face captured`;
  btnCapture.disabled = false;
  updateSaveButton();
});

btnRetake.addEventListener('click', async () => {
  capturedDescriptor = null;
  capturedPhotoUrl   = null;
  capturePreview.classList.add('hidden');
  capturePreview.src = '';
  captureCanvas.classList.add('hidden');
  captureFaceBox.classList.add('hidden');
  captureVideo.classList.remove('hidden');
  btnCapture.classList.remove('hidden');
  btnRetake.classList.add('hidden');
  faceDetectStatus.textContent = '';
  if (!captureStream) captureStream = await startCamera(captureVideo);
  updateSaveButton();
});

// File upload
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = async () => {
    faceDetectStatus.textContent = 'Detecting face in image…';

    // Draw to canvas for processing
    captureCanvas.width  = img.naturalWidth;
    captureCanvas.height = img.naturalHeight;
    captureCanvas.getContext('2d').drawImage(img, 0, 0);
    captureCanvas.classList.remove('hidden');

    const result = await Recognizer.computeDescriptor(captureCanvas);
    captureCanvas.classList.add('hidden');

    if (!result) {
      faceDetectStatus.textContent = '⚠ No face detected in this image.';
      return;
    }

    capturedDescriptor = result.descriptor;
    capturedPhotoUrl   = captureCanvas.toDataURL('image/jpeg', 0.85);
    capturePreview.src = capturedPhotoUrl;
    capturePreview.classList.remove('hidden');
    captureVideo.classList.add('hidden');
    stopStream(captureStream); captureStream = null;
    btnCapture.classList.add('hidden');
    btnRetake.classList.remove('hidden');
    faceDetectStatus.textContent = '✓ Face found in uploaded image';
    updateSaveButton();
  };
  img.src = URL.createObjectURL(file);
  fileInput.value = '';
});

// Save person
btnSavePerson.addEventListener('click', async () => {
  const name = fieldName.value.trim();
  if (!name) { fieldName.focus(); return; }

  btnSavePerson.disabled = true;
  btnSavePerson.textContent = 'Saving…';

  const person = {
    name,
    title:       fieldTitle.value.trim(),
    company:     fieldCompany.value.trim(),
    phone:       fieldPhone.value.trim(),
    email:       fieldEmail.value.trim(),
    notes:       fieldNotes.value.trim(),
    photoDataUrl: capturedPhotoUrl || null
  };

  if (editingPersonId) person.id = editingPersonId;

  const personId = await DB.savePerson(person);
  const savedId  = editingPersonId || personId;

  if (capturedDescriptor) {
    await DB.saveDescriptor(savedId, capturedDescriptor);
  }

  await Recognizer.rebuildIndex();
  closeModal();
  loadAdminGrid();
  showToast(`${name} enrolled successfully!`, 'success');
});

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className   = `toast${type ? ' ' + type : ''}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function escHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
