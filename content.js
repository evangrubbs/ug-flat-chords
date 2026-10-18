/*
 * UG Flat Chords
 *
 * Ultimate-Guitar spells every transposed chord with sharps (A#, D#, G#, C#).
 * This respells them as flats when the key calls for flats.
 *
 * How it decides:
 *   1. Reads every chord on the page (after UG's own transposition).
 *   2. Scores all 24 keys by how many of those chords are diatonic to each one
 *      (with small bonuses for tonic chords, especially first and last).
 *   3. Flat keys get flats, sharp keys keep UG's sharps. A few borrowed or
 *      secondary-dominant spellings follow the key (see flatSetFor).
 *
 * It only ever rewrites sharp -> flat, and only the displayed text. data-name
 * attributes are left alone so UG's chord-diagram popups keep working.
 *
 * Click the little pill (bottom-left) to cycle: auto -> always flats -> off.
 */
(() => {
  'use strict';

  // If UG changes its markup, this is the one selector to fix.
  const CHORD_SELECTOR = 'span[data-name]';

  const MODE_KEY = 'ugFlatChordsMode'; // 'auto' | 'flats' | 'off'
  const START_DELAY_MS = 600;
  const DEBOUNCE_MS = 120;
  const OUT_OF_KEY = -0.3;

  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ALL_FLATS = new Set([1, 3, 6, 8, 10]);

  // Key signature of the major key on each pitch class (negative = flats).
  // Db over C#, Ab over G#, Bb over A#, F# over Gb (UG's own default).
  const SIG_MAJOR = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

  // [semitones above tonic, chord quality that is diatonic there]
  const MAJOR_DEGREES = [[0, 'maj'], [2, 'min'], [4, 'min'], [5, 'maj'], [7, 'maj'], [9, 'min'], [11, 'dim']];
  const MINOR_DEGREES = [[0, 'min'], [2, 'dim'], [3, 'maj'], [5, 'min'], [7, 'min'], [7, 'maj'], [8, 'maj'], [10, 'maj']];

  // root, accidental, quality (strict whitelist so "Album" etc. never match), optional /bass
  const CHORD_RE = /^([A-G])([#b\u266F\u266D]?)((?:maj|min|dim|aug|sus|add|alt|m|M|[0-9+\u00B0\u00F8\u0394()#b\u266F\u266D-]|\/(?=\d))*)(?:\/([A-G])([#b\u266F\u266D]?))?$/;

  const accOf = (ch) => (ch === '#' || ch === '\u266F' ? 1 : ch === 'b' || ch === '\u266D' ? -1 : 0);

  function makeNote(letter, accChar) {
    const acc = accOf(accChar);
    return { text: letter + accChar, acc, pc: (LETTER_PC[letter] + acc + 12) % 12 };
  }

  function classify(q) {
    if (/^(dim|\u00B0|\u00F8|m7b5|m7\u266D5|min7b5|m7\(b5\))/.test(q)) return 'dim';
    if (/^(maj|M|\u0394)/.test(q)) return 'maj';
    if (/^(m|min|-)/.test(q)) return 'min';
    if (/^(sus|5$|aug|\+|alt|2|4)/.test(q)) return 'any';
    return 'maj';
  }

  function parseChord(raw) {
    const ws = /^(\s*)(\S+)(\s*)$/.exec(raw);
    if (!ws) return null;
    const m = CHORD_RE.exec(ws[2]);
    if (!m) return null;
    const root = makeNote(m[1], m[2]);
    return {
      lead: ws[1],
      trail: ws[3],
      root,
      quality: m[3],
      bass: m[4] ? makeNote(m[4], m[5]) : null,
      q: classify(m[3]),
    };
  }

  function detectKey(chords) {
    let best = null;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor']) {
        const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
        const tonicQ = mode === 'major' ? 'maj' : 'min';
        const isTonic = (c) => c.pc === tonic && (c.q === 'any' || c.q === tonicQ);
        let score = 0;
        for (const c of chords) {
          const rel = (c.pc - tonic + 12) % 12;
          let s = OUT_OF_KEY;
          for (const [deg, q] of degrees) {
            if (deg === rel) s = Math.max(s, c.q === 'any' || c.q === q ? 1 : 0.35);
          }
          score += s;
          if (isTonic(c)) score += 0.25;
        }
        if (isTonic(chords[0])) score += 1.5;
        if (isTonic(chords[chords.length - 1])) score += 1;
        if (!best || score > best.score) best = { tonic, mode, score };
      }
    }
    return best;
  }

  function sigOf(key) {
    const majorTonic = key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
    return SIG_MAJOR[majorTonic];
  }

  function keyName(key) {
    const names = sigOf(key) < 0 ? FLAT_NAMES : SHARP_NAMES;
    return names[key.tonic] + (key.mode === 'minor' ? 'm' : '');
  }

  // Pitch classes to spell as flats in this key.
  function flatSetFor(key) {
    const sig = sigOf(key);
    const major = key.mode === 'major';
    const f = new Set();
    if (sig <= 0) f.add(10);                                 // Bb: C/Am and every flat key
    if (sig < 0 || (sig === 0 && major)) f.add(3).add(8);    // Eb, Ab (not in Am: D#, G# are real there)
    if (sig <= -3 || (sig < 0 && major)) f.add(1);           // Db (C# stays sharp in Dm/Gm: leading tone)
    if (sig <= -3) f.add(6);                                 // Gb (F# stays sharp in F, Bb, Gm, Dm)
    return f;
  }

  function spellNote(note, flatSet) {
    return note.acc === 1 && flatSet.has(note.pc) ? FLAT_NAMES[note.pc] : note.text;
  }

  function respell(p, flatSet) {
    return (
      p.lead +
      spellNote(p.root, flatSet) +
      p.quality +
      (p.bass ? '/' + spellNote(p.bass, flatSet) : '') +
      p.trail
    );
  }

  // ---------------------------------------------------------------- DOM side

  const touched = new WeakMap(); // text node -> { orig, out }
  const touchedNodes = new Set();
  let mode = loadMode();
  let pill = null;
  let timer = null;

  function loadMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      return m === 'flats' || m === 'off' ? m : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function saveMode() {
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
  }

  function chordTextNodes() {
    const nodes = [];
    for (const el of document.querySelectorAll(CHORD_SELECTOR)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    }
    return nodes;
  }

  function collect() {
    const items = [];
    for (const node of chordTextNodes()) {
      const rec = touched.get(node);
      // If the node still holds our output, work from the original text;
      // otherwise the page (React) has rewritten it and the current text is the original.
      const base = rec && node.data === rec.out ? rec.orig : node.data;
      const p = parseChord(base);
      if (p) items.push({ node, base, p });
    }
    return items;
  }

  function restoreAll() {
    for (const node of touchedNodes) {
      const rec = touched.get(node);
      if (rec && node.data === rec.out) node.data = rec.orig;
      touched.delete(node);
    }
    touchedNodes.clear();
  }

  function process() {
    const items = collect();
    if (!items.length) { renderPill(null); return; }

    if (mode === 'off') {
      restoreAll();
      renderPill({ mode });
      return;
    }

    let flatSet = ALL_FLATS;
    let key = null;
    if (mode === 'auto') {
      key = detectKey(items.map((i) => ({ pc: i.p.root.pc, q: i.p.q })));
      flatSet = flatSetFor(key);
    }

    for (const { node, base, p } of items) {
      const out = respell(p, flatSet);
      if (node.data !== out) node.data = out;
      if (out !== base) { touched.set(node, { orig: base, out }); touchedNodes.add(node); }
      else { touched.delete(node); touchedNodes.delete(node); }
    }
    for (const n of touchedNodes) if (!n.isConnected) touchedNodes.delete(n);

    renderPill({ mode, key, flat: flatSet.size > 0 });
  }

  function renderPill(state) {
    if (!state) { if (pill) pill.style.display = 'none'; return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'ug-flat-chords-pill';
      pill.title = 'UG Flat Chords - click to cycle: auto / always flats / off';
      pill.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:5px 10px;' +
        'border-radius:999px;background:rgba(20,20,20,.88);color:#fff;font:12px/1.3 system-ui,sans-serif;' +
        'cursor:pointer;user-select:none;box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:.75;';
      pill.addEventListener('mouseenter', () => { pill.style.opacity = '1'; });
      pill.addEventListener('mouseleave', () => { pill.style.opacity = '.75'; });
      pill.addEventListener('click', () => {
        mode = mode === 'auto' ? 'flats' : mode === 'flats' ? 'off' : 'auto';
        saveMode();
        run();
      });
      document.body.appendChild(pill);
    }
    pill.style.display = '';
    pill.textContent =
      state.mode === 'off' ? '\u266D off'
      : state.mode === 'flats' ? '\u266D always flats'
      : (state.flat ? '\u266D' : '\u266F') + ' auto \u00B7 ' + keyName(state.key) + ' \u00B7 ' + (state.flat ? 'flats' : 'sharps');
  }

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  });
  const OBSERVE = { childList: true, subtree: true, characterData: true };

  function run() {
    observer.disconnect(); // so our own edits don't re-trigger us
    try {
      process();
    } catch (e) {
      console.error('[UG Flat Chords]', e);
    }
    observer.observe(document.body, OBSERVE);
  }

  function start() { setTimeout(run, START_DELAY_MS); } // let UG finish hydrating first
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  // Test hook (no effect in the browser, where `module` is undefined).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseChord, detectKey, flatSetFor, respell, keyName };
  }
})();
