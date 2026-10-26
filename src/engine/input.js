// Unified mouse/touch/pen input. Tracks a single primary pointer plus keys.
// `pressed` and `released` stay set until the engine finishes a fixed tick,
// so no tap is lost when a frame runs zero physics ticks.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointer = {
      x: -1, y: -1, lastX: -1, lastY: -1,
      down: false, pressed: false, released: false,
      id: null, type: 'mouse', inside: false,
      startX: 0, startY: 0,
      vx: 0, vy: 0, speed: 0,
      _ex: 0, _ey: 0, _et: 0,
    };
    this.keysPressed = new Set();
    this.wheel = 0;
    this.onGesture = null;
    // Best guess before the first interaction; refined by the pointer type.
    this.finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointer.down) this.pointer.inside = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) > 2) this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      this.keysPressed.add(e.key.toLowerCase());
      this.onGesture?.();
    });
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _down(e) {
    const p = this.pointer;
    if (p.down) return;
    e.preventDefault();
    this.onGesture?.();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    const [x, y] = this._pos(e);
    this.finePointer = e.pointerType === 'mouse';
    Object.assign(p, {
      x, y, lastX: x, lastY: y, startX: x, startY: y,
      down: true, pressed: true, id: e.pointerId, type: e.pointerType || 'mouse', inside: true,
      vx: 0, vy: 0, speed: 0, _ex: x, _ey: y, _et: performance.now(),
    });
  }

  _move(e) {
    const p = this.pointer;
    if (p.down && e.pointerId !== p.id) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this._pos(ev);
      const now = ev.timeStamp || performance.now();
      const dt = (now - p._et) / 1000;
      if (dt > 0.001) {
        // Exponential smoothing keeps swipe speed stable across uneven event rates.
        const a = 1 - Math.exp(-dt / 0.035);
        p.vx += ((x - p._ex) / dt - p.vx) * a;
        p.vy += ((y - p._ey) / dt - p.vy) * a;
        p.speed = Math.hypot(p.vx, p.vy);
        p._ex = x; p._ey = y; p._et = now;
      }
      p.x = x;
      p.y = y;
    }
    p.type = e.pointerType || p.type;
    p.inside = true;
    if (!p.down) {
      p.lastX = p.x;
      p.lastY = p.y;
    }
  }

  _up(e) {
    const p = this.pointer;
    if (!p.down || e.pointerId !== p.id) return;
    const [x, y] = this._pos(e);
    p.x = x;
    p.y = y;
    p.down = false;
    p.released = true;
    if (p.type !== 'mouse') p.inside = false;
  }

  endTick() {
    const p = this.pointer;
    p.pressed = false;
    p.released = false;
    p.lastX = p.x;
    p.lastY = p.y;
    // Decay speed when the pointer is held still (no move events arriving).
    if (performance.now() - p._et > 60) {
      p.vx *= 0.7;
      p.vy *= 0.7;
      p.speed = Math.hypot(p.vx, p.vy);
    }
    this.keysPressed.clear();
    this.wheel = 0;
  }
}
