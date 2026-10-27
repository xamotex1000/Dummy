// Crash Test entry point.

// First, so saved data moves to the new keys before anything reads it.
import './game/migrate.js';
import { Engine } from './engine/core.js';
import { PlayScene } from './game/scenes/play.js';

const canvas = document.getElementById('game');
const engine = new Engine(canvas);
const play = engine.push(new PlayScene(engine));
play.showTitle();
engine.start();

// Canvas text needs the web fonts loaded before it renders with them.
document.fonts?.ready.then(() => engine.resize());

// Handy for poking at the game from the console.
window.crashTest = { engine, play };
