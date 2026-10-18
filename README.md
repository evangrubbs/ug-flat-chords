# UG Flat Chords

A Chrome extension that fixes Ultimate-Guitar's habit of spelling every transposed chord with sharps. In a flat key, `D# G# A# Cm` becomes `Eb Ab Bb Cm`. In a sharp key, nothing changes.

Not affiliated with Ultimate-Guitar.

## Install

1. Download this repo (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
4. Open any chord page on ultimate-guitar.com.

## How it works

- Reads every chord on the page after UG's own transposition.
- Scores all 24 keys by how many of those chords are diatonic to each one, with a bonus for tonic chords (extra for the first and last chord).
- Flat keys get flats; sharp keys keep UG's sharps. A few spellings follow the key, such as C# staying sharp in D minor and G minor, where it is the leading tone.
- Only rewrites sharp to flat, only in the visible text, and leaves `data-name` attributes alone so UG's chord-diagram popups keep working.
- Re-runs when the chords change, so transposing up or down respells everything.

I infer the key from the chords instead of reading UG's "Key:" field, because that field is the sounding key and ignores capo and transposition.

## Override

A small pill at the bottom-left shows the detected key (for example `♭ auto · Eb · flats`). Click it to cycle **auto → always flats → off**. Use it if detection guesses wrong, or for Gb and Ebm songs.

## Limitations

- Very short chord lists, or songs that wander through several keys, can be misdetected.
- F# major and D#m stay sharp (6-flat keys are rare; use "always flats" for those).
- Chord-diagram popups and the Pro/Official tab player (drawn on canvas) are not touched.
- If UG changes its markup, update `CHORD_SELECTOR` at the top of `content.js`.

## License

MIT
