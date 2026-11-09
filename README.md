# Operation: Best Human — A Halloween Heist

A browser detective game set on Halloween at the 99th Precinct. Someone has stolen the Championship Cummerbund, and you play Amy Santiago, who has until midnight to find it.

Play it at https://halloween-heist-theta.vercel.app, or open `index.html` locally through any static file server.

## What's in the game

- **8 chapters** following the "Operation: Best Human" story: the countdown and smoke, the squad interviews, Charles's fake confession, the Holt confrontation, Jake's empty locker, the safe in Charles's locker and the hidden compartment in the podium.
- **Detective mechanics**: a case file that collects evidence, suspect verdicts, interrogations where you catch lies by presenting the right evidence, and deductions.
- **A midnight clock**: every action costs in-game minutes and mistakes cost extra. If the clock hits midnight, nobody wins.
- **Mini-games**: scrubbing CCTV footage, cracking a keypad safe and opening the podium's secret panel.
- **Polish**: expression portraits for every line, typewriter dialogue, music and sound effects generated in the browser, smoke and confetti effects, a detective rank at the end, 12 achievements, autosave at every chapter, and settings for volume, text speed and reduced motion.

## Controls

Click or press <kbd>Space</kbd> to continue, <kbd>1</kbd>–<kbd>9</kbd> to pick answers, <kbd>C</kbd> for the case file, <kbd>M</kbd> to travel, <kbd>Tab</kbd> to show everything you can click, and <kbd>Esc</kbd> for the menu.

## Project layout

- `index.html`: page markup
- `css/style.css`: all styles (responsive down to phone width)
- `js/audio.js`: procedural music and sound effects (Web Audio, no audio files)
- `js/game.js`: story, game state, and all systems
- `Images/web/`: compressed backgrounds used by the game
- `Images/Portraits/`: expression portraits cut from the character sheets
- `Images/Backgrounds`, `Images/Characters`, `Images/scenes`, `Images/GameArt`: the original full-size art

No build step. Any static host works.

A fan game made for fun. Not affiliated with the show.
