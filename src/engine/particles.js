// Lightweight particle system. Particles are plain objects drawn by kind.

export class Particles {
  constructor(max = 1200) {
    this.max = max;
    this.list = [];
    this.floorY = Infinity;
  }

  spawn(o) {
    const p = {
      kind: 'dot', x: 0, y: 0, vx: 0, vy: 0, life: 0.6, size: 4, grow: 0,
      color: '#fff', color2: null, gravity: 0, drag: 0, bounce: 0.3, text: '', rot: 0, spin: 0,
      ...o,
    };
    p.maxLife = p.life;
    if (this.list.length >= this.max) this.list[Math.floor(Math.random() * this.list.length)] = p;
    else this.list.push(p);
    return p;
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      if (p.gravity > 0 && p.y > this.floorY) {
        p.y = this.floorY;
        p.vy *= -p.bounce;
        p.vx *= 0.6;
      }
    }
  }

  render(ctx) {
    for (const p of this.list) {
      const t = p.life / p.maxLife; // 1 at birth, 0 at death
      switch (p.kind) {
        case 'dot': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'fluff': {
          ctx.globalAlpha = Math.min(1, t * 2.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const s = Math.max(0.1, p.size);
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.arc(p.x + s * 0.7, p.y - s * 0.3, s * 0.7, 0, Math.PI * 2);
          ctx.arc(p.x - s * 0.6, p.y + s * 0.2, s * 0.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case 'beam': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * t;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
          break;
        }
        case 'smoke': {
          ctx.globalAlpha = t * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'fire': {
          ctx.globalAlpha = Math.min(1, t * 1.5);
          ctx.fillStyle = t > 0.6 ? '#fff3b0' : t > 0.35 ? p.color : p.color2 || p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size * (0.4 + t * 0.6)), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, 6 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'text': {
          const age = 1 - t;
          const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 0.6);
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(pop, pop);
          ctx.font = p.font;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(20,22,20,0.9)';
          ctx.strokeText(p.text, 0, 0);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, 0, 0);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
