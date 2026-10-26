// A rigid rod hinged at a moving pivot: the thing a hand holds.
//
// The pivot is driven kinematically (it goes wherever the hand goes). The rod
// rotates around it under gravity and under the pseudo-force from the
// pivot's own acceleration, so a fast flick makes the far end lag and then
// whip through. A torsional "wrist" spring pulls it toward a rest angle, and
// `gravityComp` (0..1) is how much of the rod's weight the wrist holds up:
// 1 keeps an aimed gun level, 0 lets a club hang.
//
// Angles are radians in canvas space (0 = +x, positive = clockwise). The
// angle is never wrapped, so it can be interpolated between ticks.

import { clamp } from './math.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class PivotBody {
  constructor({ length, com = 0.5, stiffness = 60, damping = 8, gravityComp = 0, maxSpin = 45, maxAccel = 40000 } = {}) {
    this.length = length;
    this.com = com * length; // distance from pivot to center of mass
    this.stiffness = stiffness; // angular accel per radian away from rest
    this.damping = damping;
    this.gravityComp = gravityComp;
    this.maxSpin = maxSpin;
    this.maxAccel = maxAccel;
    this.rest = 0;
    this.active = false;
    this.avoidDown = false; // set when a floor below blocks swinging through "down"
    this.place(0, 0, 0);
  }

  // Teleport with no motion (when the hand first appears).
  place(x, y, angle) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = this.vy = 0;
    this.ax = this.ay = 0;
    this.angle = this.prevAngle = angle;
    this.spin = 0;
  }

  update(x, y, dt, gravity) {
    // Smoothed pivot velocity and acceleration: pointer events arrive
    // unevenly, and raw differences would make the rod jitter.
    const nvx = (x - this.x) / dt;
    const nvy = (y - this.y) / dt;
    const svx = this.vx + (nvx - this.vx) * 0.5;
    const svy = this.vy + (nvy - this.vy) * 0.5;
    let ax = (svx - this.vx) / dt;
    let ay = (svy - this.vy) / dt;
    const am = Math.hypot(ax, ay);
    if (am > this.maxAccel) {
      ax *= this.maxAccel / am;
      ay *= this.maxAccel / am;
    }
    this.ax += (ax - this.ax) * 0.6;
    this.ay += (ay - this.ay) * 0.6;
    this.px = this.x;
    this.py = this.y;
    this.x = x;
    this.y = y;
    this.vx = svx;
    this.vy = svy;

    // In the pivot's frame the rod feels gravity minus the pivot's acceleration.
    const ux = Math.cos(this.angle);
    const uy = Math.sin(this.angle);
    const fx = -this.ax;
    const fy = gravity * (1 - this.gravityComp) - this.ay;
    // Torque / inertia for a uniform rod about one end: (m c (u x f)) / (m L^2 / 3).
    const alpha = ((3 * this.com) / (this.length * this.length)) * (ux * fy - uy * fx);
    const spring = -this.stiffness * this.restOffset() - this.damping * this.spin;
    this.spin = clamp(this.spin + (alpha + spring) * dt, -this.maxSpin, this.maxSpin);
    this.prevAngle = this.angle;
    this.angle += this.spin * dt;
  }

  // How far the rod is from rest, the short way round, unless that way swings
  // through straight down while a floor is in the way: then the long way.
  restOffset() {
    let diff = wrapAngle(this.angle - this.rest);
    if (this.avoidDown) {
      const lo = Math.min(this.angle, this.angle - diff);
      const hi = Math.max(this.angle, this.angle - diff);
      const down = Math.PI / 2 + 2 * Math.PI * Math.ceil((lo - Math.PI / 2) / (2 * Math.PI));
      if (down < hi) diff -= Math.sign(diff) * 2 * Math.PI;
    }
    return diff;
  }

  // Keep the point `s` along the rod (radius r) above a floor line by
  // rotating it out, with a small bounce. Does nothing if the pivot itself is
  // too close to the floor for any angle to clear it.
  restOnFloor(floorY, s, r = 0) {
    const room = floorY - r - this.y;
    this.avoidDown = room < s;
    const tip = this.pointAt(s);
    if (tip.y + r <= floorY) return false;
    if (room <= -s) return false;
    const sinA = clamp(room / s, -1, 1);
    const cosA = Math.sign(Math.cos(this.angle) || 1) * Math.sqrt(1 - sinA * sinA);
    const target = Math.atan2(sinA, cosA);
    this.angle += wrapAngle(target - this.angle);
    // Only reflect spin that was driving the tip down into the floor.
    const tipVy = this.spin * Math.cos(this.angle);
    if (tipVy > 0) this.spin *= -0.25;
    return true;
  }

  kick(dSpin) {
    this.spin = clamp(this.spin + dSpin, -this.maxSpin, this.maxSpin);
  }

  // A point `s` along the rod, with `off` perpendicular to it.
  pointAt(s, off = 0, angle = this.angle, x = this.x, y = this.y) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return { x: x + ux * s - uy * off, y: y + uy * s + ux * off };
  }

  // World velocity of the point `s` along the rod.
  velocityAt(s) {
    const ux = Math.cos(this.angle);
    const uy = Math.sin(this.angle);
    return { x: this.vx - this.spin * uy * s, y: this.vy + this.spin * ux * s };
  }
}
