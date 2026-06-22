/* SlideAnimator — canvas-based 🏎️ animation engine */

const CONFETTI_COLORS = ['#e63946','#ffd60a','#06d6a0','#118ab2','#ef476f','#ffd166','#a855f7','#fff'];

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t)  { return t * t * t; }

/* ── Particle ──────────────────────────────────── */
class Particle {
  constructor(x, y, type, W, H, spread = false) {
    this.x = x; this.y = y; this.type = type; this.W = W; this.H = H;
    this.front = (type === 'confetti');
    this.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    this.size  = 4 + Math.random() * 9;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotV     = (Math.random() - 0.5) * 0.18;
    this.life  = 0.65 + Math.random() * 0.35;
    this.decay = spread ? 0.003 + Math.random() * 0.006 : 0.006 + Math.random() * 0.014;
    if (spread) {
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = (Math.random() - 0.5) * 1.2;
    } else {
      this.vx = (Math.random() - 0.5) * 9;
      this.vy = -(Math.random() * 7 + 2);
    }
  }
  update() {
    this.x  += this.vx; this.y  += this.vy;
    this.vy += 0.14;    this.vx *= 0.99;
    this.life -= this.decay;
    this.rotation += this.rotV;
    if (this.x < -10) this.x = this.W + 10;
    if (this.x > this.W + 10) this.x = -10;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    if (this.type === 'confetti') {
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
    } else if (this.type === 'star') {
      this._drawStar(ctx, 0, 0, this.size * 0.4, this.size * 0.9, 5, this.color);
    } else { // spark
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(-this.vx * 3.5, -this.vy * 3.5);
      ctx.stroke();
    }
    ctx.restore();
  }
  _drawStar(ctx, x, y, r1, r2, pts, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a  = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const r  = i % 2 === 0 ? r2 : r1;
      i === 0 ? ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
              : ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  get alive() { return this.life > 0 && this.y < this.H + 50; }
}

/* ── SlideAnimator ─────────────────────────────── */
class SlideAnimator {
  constructor(canvasEl) {
    this.cv  = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.W   = 1280; this.H = 720;
    this.cv.width = this.W; this.cv.height = this.H;

    this.slide        = null;
    this.frame        = 0;
    this.textProgress = 0;
    this.carX         = -160;
    this.particles    = [];
    this.audioLevel   = 0;
    this._rafId       = null;
    this._enterT      = 0;   // 0→1 entrance anim
    this._entering    = false;

    // Pre-generate star field
    this._stars = Array.from({ length: 130 }, () => ({
      x: Math.random() * 1280,
      y: Math.random() * 430,
      r: Math.random() * 2.2 + 0.4,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  loadSlide(slide, instant = false) {
    this.slide        = slide;
    this.frame        = 0;
    this.textProgress = 0;
    this.carX         = -160;
    this.particles    = this._initParticles(slide.scene);
    this._enterT      = instant ? 1 : 0;
    this._entering    = !instant;
    this._burst(this.W / 2, this.H * 0.55, 28, slide.scene);
  }

  start() {
    if (this._rafId) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._update();
      this._draw();
      this.frame++;
    };
    tick();
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  setAudioLevel(v) { this.audioLevel = Math.max(0, Math.min(1, v)); }

  /* ── Update ─────────────────────────────────── */
  _update() {
    const speed = 3.8 + this.audioLevel * 5;
    this.carX += speed;
    if (this.carX > this.W + 170) this.carX = -160;

    this.textProgress = Math.min(1, this.textProgress + 0.013);

    if (this._entering) {
      this._enterT = Math.min(1, this._enterT + 0.055);
      if (this._enterT >= 1) this._entering = false;
    }

    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => p.alive);

    if (this.frame % 4 === 0) this._spawnAmbient();
  }

  /* ── Draw ───────────────────────────────────── */
  _draw() {
    if (!this.slide) {
      this.ctx.fillStyle = '#0d1117';
      this.ctx.fillRect(0, 0, this.W, this.H);
      return;
    }
    const et = easeOut(this._enterT);
    this.ctx.save();
    // Entrance: zoom-in from slightly small
    if (et < 1) {
      const sc = 0.88 + et * 0.12;
      this.ctx.translate(this.W / 2, this.H / 2);
      this.ctx.scale(sc, sc);
      this.ctx.translate(-this.W / 2, -this.H / 2);
      this.ctx.globalAlpha = et;
    }

    this._drawBg(this.slide.scene);
    this._drawSceneDecor(this.slide.scene);
    this.particles.filter(p => !p.front).forEach(p => p.draw(this.ctx));
    this._drawZippy(this.carX, this.H - 90, 1.0);
    this._drawText();
    this.particles.filter(p => p.front).forEach(p => p.draw(this.ctx));
    this._drawHUD();

    this.ctx.restore();
  }

  /* ── Backgrounds ─────────────────────────────── */
  _drawBg(scene) {
    const { ctx, W, H, frame } = this;

    if (scene === 'racetrack') {
      // Night sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#04040f'); sky.addColorStop(0.55, '#0b1230'); sky.addColorStop(1, '#15152e');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      this._drawStars();
      // Neon horizon glow
      const glow = ctx.createLinearGradient(0, H * 0.58, 0, H * 0.7);
      glow.addColorStop(0, 'rgba(230,57,70,0.15)'); glow.addColorStop(1, 'rgba(230,57,70,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, H * 0.58, W, H * 0.15);
      // Grass
      ctx.fillStyle = '#071a07'; ctx.fillRect(0, H * 0.66, W, H * 0.34);
      // Asphalt
      ctx.fillStyle = '#161616'; ctx.fillRect(0, H * 0.71, W, H * 0.2);
      // Edge lines
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, H * 0.71); ctx.lineTo(W, H * 0.71); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, H * 0.91); ctx.lineTo(W, H * 0.91); ctx.stroke();
      // Scrolling yellow dashes
      ctx.setLineDash([55, 45]);
      ctx.lineDashOffset = -(frame * 6) % 100;
      ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, H * 0.81); ctx.lineTo(W, H * 0.81); ctx.stroke();
      ctx.setLineDash([]);

    } else if (scene === 'highway') {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#060612'); sky.addColorStop(0.3, '#2d0d4e');
      sky.addColorStop(0.6, '#b54010'); sky.addColorStop(0.78, '#e87a2a');
      sky.addColorStop(1, '#3d1a05');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // Sun
      const sun = ctx.createRadialGradient(W/2, H*0.7, 5, W/2, H*0.7, 200);
      sun.addColorStop(0, 'rgba(255,220,50,0.7)'); sun.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      // Silhouette mountains
      ctx.fillStyle = '#1a0a02';
      ctx.beginPath(); ctx.moveTo(0, H*0.72);
      const mpts = [[0.08,0.52],[0.18,0.44],[0.3,0.58],[0.43,0.47],[0.55,0.55],[0.68,0.45],[0.82,0.53],[1,0.72]];
      mpts.forEach(([px,py]) => ctx.lineTo(W*px, H*py));
      ctx.fill();
      // Ground
      ctx.fillStyle = '#1e0c02'; ctx.fillRect(0, H*0.72, W, H*0.28);
      // Road (perspective)
      ctx.fillStyle = '#2c2c2c';
      ctx.beginPath(); ctx.moveTo(W*0.35, H*0.72); ctx.lineTo(W*0.65, H*0.72); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      // Dashed center line
      const off = (frame * 9) % 130;
      for (let i = -1; i < 7; i++) {
        const t  = (i + off/130) / 6;
        const y1 = H*0.72 + t * H*0.28;
        const hw = t * W * 0.22 + 4;
        ctx.fillStyle = 'rgba(255,215,60,0.85)';
        ctx.fillRect(W/2 - hw*0.08, y1, hw*0.16, Math.max(2, t*22));
      }

    } else if (scene === 'factory') {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#030810'); bg.addColorStop(1, '#0a1520');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Circuit grid
      ctx.strokeStyle = 'rgba(0,180,255,0.055)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // Neon floor
      ctx.fillStyle = '#050c18'; ctx.fillRect(0, H*0.76, W, H*0.24);
      const fl = ctx.createLinearGradient(0, H*0.76, 0, H);
      fl.addColorStop(0, 'rgba(0,180,255,0.2)'); fl.addColorStop(1, 'rgba(0,180,255,0)');
      ctx.fillStyle = fl; ctx.fillRect(0, H*0.76, W, 4);

    } else if (scene === 'winner') {
      const bg = ctx.createRadialGradient(W/2, H*0.35, 80, W/2, H*0.35, 700);
      bg.addColorStop(0, '#2e1f04'); bg.addColorStop(0.5, '#110d02'); bg.addColorStop(1, '#050302');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Crowd
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 55; col++) {
          const hue  = (col * 41 + row * 77) % 360;
          const wave = Math.sin(frame * 0.06 + col * 0.45 + row * 0.8) > 0.55;
          ctx.fillStyle = wave ? `hsl(${hue},75%,58%)` : `hsl(${hue},35%,18%)`;
          ctx.beginPath(); ctx.arc(col * (W/54), H*0.04 + row*17, 5.5, 0, Math.PI*2); ctx.fill();
        }
      }
      // Spotlights
      for (let i = 0; i < 5; i++) {
        const bx   = W * (0.1 + i * 0.2);
        const ang  = 0.5 + Math.sin(frame * 0.009 + i * 1.2) * 0.4;
        ctx.save(); ctx.translate(bx, 0);
        const beam = ctx.createLinearGradient(0,0, Math.cos(ang)*700, Math.sin(ang)*700);
        beam.addColorStop(0, 'rgba(255,255,200,0.13)'); beam.addColorStop(1, 'rgba(255,255,200,0)');
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(ang-0.08)*900, Math.sin(ang-0.08)*900);
        ctx.lineTo(Math.cos(ang+0.08)*900, Math.sin(ang+0.08)*900);
        ctx.fill(); ctx.restore();
      }
      // Floor
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, H*0.83, W, H*0.17);

    } else { // vintage
      const bg = ctx.createLinearGradient(0,0,0,H);
      bg.addColorStop(0, '#12080a'); bg.addColorStop(1, '#1e1005');
      ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
      // Paper lines
      ctx.strokeStyle = 'rgba(255,200,100,0.035)'; ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // Ornate border
      const bi = 22;
      ctx.strokeStyle = 'rgba(255,200,80,0.28)'; ctx.lineWidth = 3;
      ctx.strokeRect(bi, bi, W-bi*2, H-bi*2);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,200,80,0.15)';
      ctx.strokeRect(bi+9, bi+9, W-bi*2-18, H-bi*2-18);
      [[bi+4,bi+4],[W-bi-4,bi+4],[bi+4,H-bi-4],[W-bi-4,H-bi-4]].forEach(([cx,cy]) => {
        ctx.fillStyle = 'rgba(255,200,80,0.35)';
        ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill();
      });
      // Ground
      ctx.fillStyle = '#0e0602'; ctx.fillRect(0,H*0.78,W,H*0.22);
    }
  }

  /* ── Scene decorations ───────────────────────── */
  _drawSceneDecor(scene) {
    const { ctx, W, H, frame } = this;

    if (scene === 'factory') {
      // Gears
      [[W*0.83,H*0.22,85,12,0.016,'rgba(0,180,255,0.13)'],
       [W*0.89,H*0.47,52, 8,-0.028,'rgba(0,180,255,0.1)'],
       [W*0.06,H*0.28,65,10, 0.022,'rgba(0,180,255,0.1)']].forEach(([gx,gy,gr,gt,gs,gc]) => {
        ctx.save(); ctx.translate(gx,gy); ctx.rotate(frame*gs);
        ctx.fillStyle = gc; ctx.beginPath();
        for (let i = 0; i < gt; i++) {
          const a  = (i/gt)*Math.PI*2, a2 = ((i+0.38)/gt)*Math.PI*2;
          const a3 = ((i+0.62)/gt)*Math.PI*2, a4 = ((i+1)/gt)*Math.PI*2;
          if (i===0) ctx.moveTo(Math.cos(a)*gr, Math.sin(a)*gr);
          ctx.lineTo(Math.cos(a)*gr, Math.sin(a)*gr);
          ctx.lineTo(Math.cos(a2)*(gr+15), Math.sin(a2)*(gr+15));
          ctx.lineTo(Math.cos(a3)*(gr+15), Math.sin(a3)*(gr+15));
          ctx.lineTo(Math.cos(a4)*gr, Math.sin(a4)*gr);
        }
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(0,0,gr*0.32,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

    } else if (scene === 'racetrack') {
      // Checkered corners
      const s = 22;
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        if ((row+col)%2===0) ctx.fillStyle = 'rgba(255,255,255,0.2)';
        else ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(col*s, row*s, s, s);
        ctx.fillRect(W-(col+1)*s, row*s, s, s);
      }

    } else if (scene === 'winner') {
      // Trophy
      const tx = W*0.86, ty = H*0.42;
      const sc = 1 + Math.sin(frame*0.05)*0.04;
      ctx.save(); ctx.translate(tx,ty); ctx.scale(sc,sc);
      const tg = ctx.createRadialGradient(0,-35,5,0,-35,80);
      tg.addColorStop(0,'rgba(255,215,0,0.3)'); tg.addColorStop(1,'rgba(255,215,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(-80,-90,160,130);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.moveTo(-28,-75); ctx.bezierCurveTo(-38,-35,-32,12,-16,22);
      ctx.lineTo(16,22); ctx.bezierCurveTo(32,12,38,-35,28,-75); ctx.fill();
      ctx.strokeStyle='#ffd700'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.arc(-31,-32,13,Math.PI/2,-Math.PI/2,true); ctx.stroke();
      ctx.beginPath(); ctx.arc(31,-32,13,-Math.PI/2,Math.PI/2,true);  ctx.stroke();
      ctx.fillStyle='#b8860b'; ctx.fillRect(-22,22,44,9); ctx.fillRect(-16,31,32,9);
      ctx.restore();

    } else if (scene === 'vintage') {
      // Clock
      const cx = W*0.86, cy = H*0.22, cr = 55;
      ctx.save(); ctx.translate(cx,cy);
      ctx.fillStyle = 'rgba(255,200,80,0.08)';
      ctx.beginPath(); ctx.arc(0,0,cr,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,200,80,0.3)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,cr,0,Math.PI*2); ctx.stroke();
      const ha = frame*0.002 - Math.PI/2;
      const ma = frame*0.022 - Math.PI/2;
      ctx.strokeStyle='rgba(255,200,80,0.55)'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ha)*cr*0.52,Math.sin(ha)*cr*0.52); ctx.stroke();
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ma)*cr*0.77,Math.sin(ma)*cr*0.77); ctx.stroke();
      ctx.restore();
    }
  }

  _drawStars() {
    const { ctx, frame } = this;
    this._stars.forEach(s => {
      const a = 0.35 + Math.sin(s.phase + frame*0.032)*0.42;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    });
  }

  /* ── Zippy the Car Mascot ────────────────────── */
  _drawZippy(x, y, scale) {
    const { ctx, W, H, frame, audioLevel } = this;
    const bounce = Math.sin(frame * 0.2) * (5 + audioLevel * 22);

    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 32 - bounce*0.4, 65, 9, 0, 0, Math.PI*2); ctx.fill();

    // Body
    const bg = ctx.createLinearGradient(-60,-24, 60,24);
    bg.addColorStop(0,'#ff8088'); bg.addColorStop(0.45,'#e63946'); bg.addColorStop(1,'#8c1219');
    ctx.fillStyle = bg;
    this._rrect(-60,-24,120,34,10); ctx.fill();
    // Body top sheen
    ctx.fillStyle='rgba(255,255,255,0.13)'; this._rrect(-55,-24,120,14,[10,10,0,0]); ctx.fill();

    // Cabin
    ctx.fillStyle='#c1121f';
    ctx.beginPath(); ctx.moveTo(-26,-24); ctx.lineTo(-11,-48); ctx.lineTo(28,-48); ctx.lineTo(46,-24); ctx.closePath(); ctx.fill();

    // Windshield
    const ws = ctx.createLinearGradient(-22,-48,-22,-24);
    ws.addColorStop(0,'#7dd3fc'); ws.addColorStop(1,'#bae6fd');
    ctx.fillStyle=ws; this._rrect(-23,-46,18,21,3); ctx.fill();
    // Side window
    ctx.fillStyle='#e0f2fe'; this._rrect(-2,-46,15,21,3); ctx.fill();
    // Shine
    ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.fillRect(-22,-45,6,6);

    // Eyes (pupils)
    const blink = Math.sin(frame*0.027) > 0.965;
    if (!blink) {
      ctx.fillStyle='#0c2a4a';
      ctx.beginPath(); ctx.arc(-15,-35,5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( -1,-35,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(-13,-37,2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(  1,-37,2,0,Math.PI*2); ctx.fill();
    } else {
      ctx.strokeStyle='#0c2a4a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-20,-35); ctx.lineTo(-10,-35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6,-35);  ctx.lineTo(4,-35);   ctx.stroke();
    }

    // Racing stripe
    const stripe = ctx.createLinearGradient(-60,0,60,0);
    stripe.addColorStop(0,'rgba(255,214,10,0)'); stripe.addColorStop(0.15,'#ffd60a');
    stripe.addColorStop(0.85,'#ffd60a'); stripe.addColorStop(1,'rgba(255,214,10,0)');
    ctx.fillStyle=stripe; ctx.fillRect(-60,-6,120,8);

    // Spoiler
    ctx.fillStyle='#111'; ctx.fillRect(-60,-32,11,15); ctx.fillRect(-60,-32,28,5);

    // Front bumper
    ctx.fillStyle='#9b1219'; this._rrect(56,-18,8,20,[0,4,4,0]); ctx.fill();

    // Headlight glow
    const ha = 0.65 + Math.sin(frame*0.14)*0.35;
    const hg = ctx.createRadialGradient(60,-8,0, 60,-8,26);
    hg.addColorStop(0,`rgba(255,230,60,${ha})`); hg.addColorStop(1,'rgba(255,230,60,0)');
    ctx.fillStyle=hg; ctx.fillRect(44,-28,50,36);
    ctx.fillStyle=`rgba(255,230,60,${ha})`;
    ctx.beginPath(); ctx.arc(60,-8,6,0,Math.PI*2); ctx.fill();

    // Wheels
    const wr = frame * 0.3;
    this._drawWheel(ctx,-36, 24, 16, wr);
    this._drawWheel(ctx, 36, 24, 16, wr);

    // Exhaust
    for (let i=0;i<3;i++) {
      const ex=-65-i*14, ey=2+Math.sin(frame*0.28+i)*5;
      const ea=(0.38-i*0.11)*(0.35+audioLevel*0.7);
      ctx.fillStyle=`rgba(200,200,200,${ea})`;
      ctx.beginPath(); ctx.arc(ex,ey,5+i*4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  _drawWheel(ctx,x,y,r,rot) {
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#999'; ctx.beginPath(); ctx.arc(x,y,r*0.58,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#bbb'; ctx.lineWidth=2;
    for (let i=0;i<5;i++) {
      const a=rot+(i/5)*Math.PI*2;
      ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*3,y+Math.sin(a)*3);
      ctx.lineTo(x+Math.cos(a)*r*0.52,y+Math.sin(a)*r*0.52); ctx.stroke();
    }
    ctx.fillStyle='#e63946'; ctx.beginPath(); ctx.arc(x,y,r*0.2,0,Math.PI*2); ctx.fill();
  }

  /* ── Text ────────────────────────────────────── */
  _drawText() {
    const { ctx, W, H, textProgress, frame, slide, audioLevel } = this;
    const tp   = textProgress;
    const tIn  = Math.min(1, tp * 2.2);
    const bIn  = Math.max(0, (tp - 0.38) * 1.8);

    if (tIn <= 0) return;

    // ── Title ──
    const tx    = W * 0.07 + (1 - easeOut(tIn)) * -W * 0.42;
    const titleY = H * 0.24;
    const fSize  = Math.round(Math.min(66, W * 0.05));

    ctx.save();
    ctx.translate(tx, 0);
    ctx.globalAlpha = Math.min(1, tIn);

    ctx.font = `900 ${fSize}px "Arial Black",Impact,Arial`;
    ctx.textAlign = 'left';
    // Glow on audio
    if (audioLevel > 0.1) {
      ctx.shadowColor = 'rgba(255,214,10,0.7)';
      ctx.shadowBlur  = 20 * audioLevel;
    }
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(slide.title, 5, titleY + 5);
    // Gradient text
    const tg = ctx.createLinearGradient(0, titleY-fSize, 0, titleY+10);
    tg.addColorStop(0,'#fff'); tg.addColorStop(1,'#ffd60a');
    ctx.fillStyle = tg; ctx.shadowBlur = 0;
    ctx.fillText(slide.title, 0, titleY);
    // Red underline bar
    const tw   = Math.min(ctx.measureText(slide.title).width, W*0.82);
    const barW = tw * easeOut(tIn);
    ctx.fillStyle='#e63946'; ctx.fillRect(0, titleY+8, barW, 5);
    ctx.restore();

    // ── Bullets ──
    if (!slide.bullets?.length) return;
    slide.bullets.forEach((b, i) => {
      const delay  = i * 0.25;
      const bProg  = Math.max(0, Math.min(1, (bIn - delay) * 2.8));
      if (bProg <= 0) return;

      const by = H * 0.37 + i * H * 0.115;
      const bx = W * 0.07 + (1 - easeOut(bProg)) * -W * 0.3;

      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha = Math.min(1, bProg * 2);

      const fs = Math.round(Math.min(30, W * 0.023));
      ctx.font = `bold ${fs}px "Segoe UI",Arial`;
      ctx.textAlign = 'left';
      const tw2  = ctx.measureText(b).width;
      const padX = 14, padY = 11;
      const bh   = fs + padY * 2;
      const bw   = tw2 + padX*2 + 22;

      // Pill bg
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      this._rrect(-4, -bh*0.72, bw, bh, bh/2); ctx.fill();

      // Accent dot
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath(); ctx.arc(padX, 0, 5.5, 0, Math.PI*2); ctx.fill();

      // Text
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.fillText(b, padX+16+2, 2);
      ctx.fillStyle='#fff';
      ctx.fillText(b, padX+16, 0);
      ctx.restore();
    });
  }

  /* ── HUD ─────────────────────────────────────── */
  _drawHUD() {
    const { ctx, W, H, frame, slide, audioLevel } = this;
    const labels = { racetrack:'🏁 Racetrack', highway:'🛣️ Highway', factory:'🏭 Factory', winner:'🏆 Winner!', vintage:'📚 History' };

    // Scene badge
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.52)';
    this._rrect(14,14,170,34,17); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.82)';
    ctx.font='500 15px "Segoe UI",Arial'; ctx.textAlign='left';
    ctx.fillText(labels[slide?.scene]||'', 20,36);
    ctx.restore();

    // Mic pulse ring when audio playing
    if (audioLevel > 0.08) {
      ctx.save();
      const pr = 20 + audioLevel*38;
      ctx.strokeStyle=`rgba(230,57,70,${audioLevel*0.85})`;
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(W-40,H-40,pr,0,Math.PI*2); ctx.stroke();
      ctx.font='22px sans-serif'; ctx.textAlign='center';
      ctx.fillText('🎙️',W-40,H-31);
      ctx.restore();
    }
  }

  /* ── Particles ───────────────────────────────── */
  _initParticles(scene) {
    const type = { racetrack:'spark', highway:'star', factory:'spark', winner:'confetti', vintage:'star' }[scene]||'star';
    return Array.from({length:28},()=>new Particle(
      Math.random()*this.W, Math.random()*this.H*0.65,
      type, this.W, this.H, true
    ));
  }
  _spawnAmbient() {
    const scene = this.slide?.scene||'racetrack';
    const type  = { racetrack:'spark', highway:'star', factory:'spark', winner:'confetti', vintage:'star' }[scene]||'star';
    const n     = scene==='winner' ? 3 : 1;
    for (let i=0;i<n+Math.floor(this.audioLevel*5);i++) {
      this.particles.push(new Particle(
        Math.random()*this.W, this.H*0.45+Math.random()*this.H*0.35,
        type, this.W, this.H
      ));
    }
  }
  _burst(x,y,n,scene) {
    const type = { racetrack:'spark', highway:'star', factory:'spark', winner:'confetti', vintage:'star' }[scene]||'star';
    for (let i=0;i<n;i++) {
      const p = new Particle(x,y,type,this.W,this.H);
      p.vy = -Math.random()*14-4; p.vx = (Math.random()-0.5)*16;
      this.particles.push(p);
    }
  }

  /* ── Helpers ─────────────────────────────────── */
  _rrect(x,y,w,h,r) {
    const ctx=this.ctx;
    if (typeof r==='number') r=[r,r,r,r];
    ctx.beginPath();
    ctx.moveTo(x+r[0],y);
    ctx.lineTo(x+w-r[1],y);   ctx.quadraticCurveTo(x+w,y,x+w,y+r[1]);
    ctx.lineTo(x+w,y+h-r[2]); ctx.quadraticCurveTo(x+w,y+h,x+w-r[2],y+h);
    ctx.lineTo(x+r[3],y+h);   ctx.quadraticCurveTo(x,y+h,x,y+h-r[3]);
    ctx.lineTo(x,y+r[0]);     ctx.quadraticCurveTo(x,y,x+r[0],y);
    ctx.closePath();
  }
}
