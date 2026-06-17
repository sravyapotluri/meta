'use strict';

const Recognizer = (() => {
  // face-api.js model path — served from /models/ folder
  const MODEL_URL = './models';
  const MATCH_THRESHOLD = 0.5; // Euclidean distance; lower = stricter
  let _ready = false;
  let _labeledDescriptors = [];
  let _matcher = null;

  // ── Model loading ──────────────────────────────────────────── //
  async function loadModels(onProgress) {
    onProgress?.('Loading face detector…');
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    onProgress?.('Loading landmark model…');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    onProgress?.('Loading recognition model…');
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    _ready = true;
    onProgress?.('ready');
  }

  function isReady() { return _ready; }

  // ── Descriptor index ───────────────────────────────────────── //
  async function rebuildIndex() {
    const rows = await DB.getAllDescriptors();
    if (rows.length === 0) { _matcher = null; _labeledDescriptors = []; return; }

    // Group by personId
    const byPerson = {};
    for (const r of rows) {
      if (!byPerson[r.personId]) byPerson[r.personId] = [];
      byPerson[r.personId].push(r.descriptor);
    }

    _labeledDescriptors = Object.entries(byPerson).map(([id, descs]) =>
      new faceapi.LabeledFaceDescriptors(String(id), descs)
    );
    _matcher = new faceapi.FaceMatcher(_labeledDescriptors, MATCH_THRESHOLD);
  }

  // ── Detect + recognise in a frame ─────────────────────────── //
  async function detectAndMatch(videoEl) {
    if (!_ready) return [];

    const detections = await faceapi
      .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    if (!detections.length) return [];

    const dims = faceapi.matchDimensions(videoEl, { width: videoEl.videoWidth, height: videoEl.videoHeight }, true);
    const resized = faceapi.resizeResults(detections, dims);

    return resized.map(det => {
      let match = null;
      if (_matcher) {
        const result = _matcher.findBestMatch(det.descriptor);
        if (result.label !== 'unknown') {
          match = { personId: Number(result.label), distance: result.distance };
        }
      }
      return { detection: det.detection, descriptor: det.descriptor, match };
    });
  }

  /** Compute a single face descriptor from a canvas/img/bitmap */
  async function computeDescriptor(imageEl) {
    if (!_ready) throw new Error('Models not loaded');
    const det = await faceapi
      .detectSingleFace(imageEl, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    return det ? { descriptor: det.descriptor, box: det.detection.box } : null;
  }

  /** Draw bounding boxes + labels on canvas */
  function drawResults(canvas, videoEl, results) {
    const ctx = canvas.getContext('2d');
    canvas.width  = videoEl.videoWidth  || videoEl.width;
    canvas.height = videoEl.videoHeight || videoEl.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const r of results) {
      const box = r.detection.box;
      const isKnown = !!r.match;
      const color = isKnown ? '#3ddc84' : '#f44336';

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Label background
      const label     = r.label || 'Unknown';
      const fontSize  = Math.max(14, Math.min(20, box.width * 0.14));
      ctx.font        = `bold ${fontSize}px Segoe UI, sans-serif`;
      const textW     = ctx.measureText(label).width;
      const labelH    = fontSize + 8;
      ctx.fillStyle   = color + 'cc';
      ctx.fillRect(box.x, box.y - labelH, textW + 12, labelH);

      // Label text
      ctx.fillStyle   = '#ffffff';
      ctx.fillText(label, box.x + 6, box.y - 6);
    }
  }

  return { loadModels, isReady, rebuildIndex, detectAndMatch, computeDescriptor, drawResults };
})();
