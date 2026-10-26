// Verlet point-and-stick physics. Ragdolls, projectiles and debris are all
// points (circles) linked by distance constraints, inside an axis-aligned box.

export class Point {
  constructor(x, y, { r = 6, mass = 1, bounce = 0.25, friction = 0.8, gravityScale = 1, group = null, solid = true } = {}) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.r = r;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.bounce = bounce;
    this.friction = friction;
    this.gravityScale = gravityScale;
    this.group = group; // points in the same group never collide with each other
    this.solid = solid; // non-solid points only collide with the world bounds
    this.pinned = false; // pinned points are moved by hand and ignore integration
    this.passWall = null; // 'top' | 'bottom' | 'left' | 'right': that wall lets this point through
    this.dead = false;
    this.impactCd = 0;
    this.owner = null;
    this.proj = null;
  }

  velocity(dt) {
    return { x: (this.x - this.px) / dt, y: (this.y - this.py) / dt };
  }

  setVelocity(vx, vy, dt) {
    this.px = this.x - vx * dt;
    this.py = this.y - vy * dt;
  }

  addVelocity(vx, vy, dt) {
    this.px -= vx * dt;
    this.py -= vy * dt;
  }
}

export class Stick {
  constructor(a, b, { length, stiffness = 1, minOnly = false } = {}) {
    this.a = a;
    this.b = b;
    this.length = length ?? Math.hypot(b.x - a.x, b.y - a.y);
    this.stiffness = stiffness;
    this.minOnly = minOnly; // only pushes apart, never pulls together
    this.broken = false;
    this.strain = 1; // length / rest length this step, before the solver corrected it
  }

  solve() {
    const a = this.a, b = this.b;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    if (this.minOnly && d >= this.length) return;
    const wa = a.pinned ? 0 : a.invMass;
    const wb = b.pinned ? 0 : b.invMass;
    const w = wa + wb;
    if (!w) return;
    const k = ((d - this.length) / (d * w)) * this.stiffness;
    a.x += dx * k * wa;
    a.y += dy * k * wa;
    b.x -= dx * k * wb;
    b.y -= dy * k * wb;
  }
}

export class World {
  constructor({ gravity = 1900, damping = 0.996, iterations = 10 } = {}) {
    this.gravity = gravity;
    this.damping = damping;
    this.iterations = iterations;
    this.points = [];
    this.sticks = [];
    this.bounds = { left: 0, top: 0, right: 800, bottom: 600 };
    this.onImpact = null; // (point, speed, nx, ny) when a point hits a wall
    this.onContact = null; // (a, b, speed) when two solid points collide
  }

  addPoint(p) {
    this.points.push(p);
    return p;
  }

  addStick(s) {
    this.sticks.push(s);
    return s;
  }

  step(dt) {
    if (this.points.some((p) => p.dead)) this.points = this.points.filter((p) => !p.dead);
    if (this.sticks.some((s) => s.broken || s.a.dead || s.b.dead)) {
      this.sticks = this.sticks.filter((s) => !s.broken && !s.a.dead && !s.b.dead);
    }

    const g = this.gravity * dt * dt;
    for (const p of this.points) {
      p.impactCd -= dt;
      if (p.pinned) continue;
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g * p.gravityScale;
    }

    // Velocity response (bounce, friction, impact callbacks) happens once per step;
    // the solver iterations below only correct positions.
    for (const p of this.points) this.collideBounds(p, dt, !p.pinned);
    this.collidePoints(dt, true);
    for (const s of this.sticks) s.strain = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / (s.length || 1);
    for (let i = 0; i < this.iterations; i++) {
      for (const s of this.sticks) s.solve();
      for (const p of this.points) this.collideBounds(p, dt, false);
    }
    this.collidePoints(dt, false);
  }

  collideBounds(p, dt, respond) {
    const b = this.bounds;
    const vx = p.x - p.px;
    const vy = p.y - p.py;
    const w = p.passWall;
    if (p.y + p.r > b.bottom && w !== 'bottom') {
      p.y = b.bottom - p.r;
      if (respond && vy > 0) {
        this.onImpact?.(p, vy / dt, 0, -1);
        p.py = p.y + vy * p.bounce;
        p.px = p.x - vx * p.friction;
      }
    } else if (p.y - p.r < b.top && w !== 'top') {
      p.y = b.top + p.r;
      if (respond && vy < 0) {
        this.onImpact?.(p, -vy / dt, 0, 1);
        p.py = p.y + vy * p.bounce;
        p.px = p.x - vx * p.friction;
      }
    }
    if (p.x - p.r < b.left && w !== 'left') {
      p.x = b.left + p.r;
      if (respond && vx < 0) {
        this.onImpact?.(p, -vx / dt, 1, 0);
        p.px = p.x + vx * p.bounce;
        p.py = p.y - vy * p.friction;
      }
    } else if (p.x + p.r > b.right && w !== 'right') {
      p.x = b.right - p.r;
      if (respond && vx > 0) {
        this.onImpact?.(p, vx / dt, -1, 0);
        p.px = p.x + vx * p.bounce;
        p.py = p.y - vy * p.friction;
      }
    }
  }

  collidePoints(dt, respond) {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      if (!a.solid) continue;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        if (!b.solid || (a.group !== null && a.group === b.group)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const wa = a.pinned ? 0 : a.invMass;
        const wb = b.pinned ? 0 : b.invMass;
        const w = wa + wb;
        if (!w) continue;
        if (respond && this.onContact) {
          const rvx = (b.x - b.px) - (a.x - a.px);
          const rvy = (b.y - b.py) - (a.y - a.py);
          const approach = -(rvx * nx + rvy * ny) / dt;
          if (approach > 0) this.onContact(a, b, approach);
        }
        const push = (rr - d) / w;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
      }
    }
  }
}
