// Palette and type. The look: a padded test cell, a burlap dummy, and a
// work-order clipboard for the UI.

import { hexToRgb } from '../engine/math.js';

export const C = {
  ink: '#161915',
  inkSoft: '#252a24',
  inkLine: '#3a4238',
  paper: '#efeadf',
  paperDim: '#d8d1c2',
  paperInk: '#2a2620',
  muted: '#8a9187',
  wall: '#c5cdbb',
  wallDark: '#a7b09c',
  wallLight: '#dbe1d2',
  tuft: '#8b9680',
  mat: '#3b4640',
  matEdge: '#56635b',
  burlap: '#c99b5e',
  burlapBoss: '#9a6f43',
  seam: '#4a3119',
  stitch: '#5d3e1f',
  button: '#26221f',
  bruise: '#8c3040',
  char: '#2a2420',
  fluff: '#f7f2e7',
  blood: '#b3263a',
  accent: '#ff4f86',
  gold: '#ffc63d',
  good: '#5fd38a',
  bad: '#ff5a4a',
  fire: '#ff8a1f',
  fire2: '#d43b12',
  steel: '#d5dbe0',
  iron: '#555a60',
  wood: '#c8874a',
  olive: '#5d7a3a',
  rarity: { common: '#8fa58a', rare: '#3d8bff', epic: '#b25cff' },
};

export const RGB = {
  burlap: hexToRgb(C.burlap),
  burlapBoss: hexToRgb(C.burlapBoss),
  bruise: hexToRgb(C.bruise),
  char: hexToRgb(C.char),
  white: [255, 255, 255],
};

export const F = {
  display: '"Bowlby One SC", "Arial Black", Impact, sans-serif',
  body: '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif',
};

export const font = (size, family = F.body, weight = 600) => `${weight} ${Math.round(size)}px ${family}`;
