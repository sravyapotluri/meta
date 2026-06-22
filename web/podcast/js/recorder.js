/* VoiceRecorder — wraps MediaRecorder + Web Audio API analyser */
class VoiceRecorder {
  constructor(canvasId) {
    this._canvas  = document.getElementById(canvasId);
    this._ctx     = this._canvas.getContext('2d');
    this._stream  = null;
    this._mr      = null;   // MediaRecorder
    this._chunks  = [];
    this._blob    = null;
    this._audioCtx  = null;
    this._analyser  = null;
    this._rafId     = null;
    this._timerIv   = null;
    this._startedAt = 0;
  }

  /* Request mic permission and wire up AudioContext */
  async init() {
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this._audioCtx.createMediaStreamSource(this._stream);
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 256;
    src.connect(this._analyser);
  }

  /* Start recording */
  start() {
    this._chunks = [];
    this._blob   = null;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this._mr = new MediaRecorder(this._stream, { mimeType });
    this._mr.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._mr.start(100);   // collect chunks every 100 ms

    this._startedAt = Date.now();
    this._drawWaveform();
    this._startTimer();
  }

  /* Stop recording — returns a Promise that resolves with the audio Blob */
  stop() {
    return new Promise(resolve => {
      this._mr.onstop = () => {
        this._blob = new Blob(this._chunks, { type: this._mr.mimeType });
        this._stopWaveform();
        this._stopTimer();
        resolve(this._blob);
      };
      this._mr.stop();
    });
  }

  getBlob() { return this._blob; }

  getBlobURL() {
    return this._blob ? URL.createObjectURL(this._blob) : null;
  }

  /* Discard current recording (for retry) */
  clear() {
    this._blob   = null;
    this._chunks = [];
    this._stopWaveform();
    this._stopTimer();
    this._drawIdle();
  }

  destroy() {
    this._stopWaveform();
    this._stopTimer();
    if (this._mr && this._mr.state !== 'inactive') this._mr.stop();
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._audioCtx) this._audioCtx.close();
  }

  /* ── private ── */

  _drawWaveform() {
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    const { width: W, height: H } = this._canvas;

    const draw = () => {
      this._rafId = requestAnimationFrame(draw);
      this._analyser.getByteFrequencyData(data);

      this._ctx.fillStyle = '#1e2530';
      this._ctx.fillRect(0, 0, W, H);

      const barW = (W / data.length) * 2.2;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const bh = (data[i] / 255) * H * 0.9;
        const hue = (i / data.length) * 50;   // deep red → orange
        this._ctx.fillStyle = `hsl(${hue}, 95%, 58%)`;
        this._ctx.fillRect(x, H - bh, barW, bh);
        x += barW + 1;
      }
    };
    draw();
  }

  _stopWaveform() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._drawDoneState();
  }

  _drawDoneState() {
    const { width: W, height: H } = this._canvas;
    this._ctx.fillStyle = '#0d2818';
    this._ctx.fillRect(0, 0, W, H);
    this._ctx.fillStyle = '#2ecc71';
    this._ctx.font = `bold 14px sans-serif`;
    this._ctx.textAlign = 'center';
    this._ctx.textBaseline = 'middle';
    this._ctx.fillText('✓  Recording saved!', W / 2, H / 2);
  }

  _drawIdle() {
    const { width: W, height: H } = this._canvas;
    this._ctx.fillStyle = '#1e2530';
    this._ctx.fillRect(0, 0, W, H);
    this._ctx.fillStyle = '#30363d';
    const midY = H / 2;
    this._ctx.fillRect(0, midY - 1, W, 2);
  }

  _startTimer() {
    const timeEl = document.getElementById('timerDisplay');
    const row    = document.getElementById('recTimer');
    if (row) row.classList.remove('hidden');

    this._timerIv = setInterval(() => {
      const sec = Math.floor((Date.now() - this._startedAt) / 1000);
      const m   = Math.floor(sec / 60);
      const s   = sec % 60;
      if (timeEl) timeEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 500);
  }

  _stopTimer() {
    clearInterval(this._timerIv);
    const row = document.getElementById('recTimer');
    if (row) row.classList.add('hidden');
  }
}
