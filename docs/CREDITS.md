# Credits

Third-party assets shipped with Double Agent. Everything else in the game (geometry, textures, ambience, UI) is procedural and original.

Every file below is **CC0 1.0 (public domain dedication)**: no attribution is required and commercial use and redistribution are allowed. The licence was checked on each sound's own Freesound page, not only in search results. We credit the authors anyway.

## Audio (`public/audio/`)

Each sound was downloaded as Freesound's high-quality preview, then trimmed, converted to mono 44.1 kHz, peak-normalised to −1 dBFS, given a short fade-out, and encoded twice: Ogg Vorbis (`.ogg`, about 96 kbps) and AAC (`.m4a`, 96 kbps) for Safari. Leading silence was removed so each transient starts the clip.

| Game file(s) | Source | Author | Licence | Changes |
|---|---|---|---|---|
| `casing_drop_1, casing_drop_2` (.ogg, .m4a) | [Brass bullet shell casing drop onto concrete, multiple takes](https://freesound.org/people/GrayJoy/sounds/210102/) (Freesound #210102) | GrayJoy | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: two takes: 1.1 s from 0.03 s (casing_drop_1) and from 5.3 s (casing_drop_2); mono, normalised, faded, re-encoded |
| `draw` (.ogg, .m4a) | [Gun draw holster.wav](https://freesound.org/people/huddwink/sounds/239959/) (Freesound #239959) | huddwink | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: 0.62 s from 0.62 s; mono, normalised, faded, re-encoded |
| `dry_fire` (.ogg, .m4a) | [Dry Fire](https://freesound.org/people/brianhanson2nd/sounds/171211/) (Freesound #171211) | brianhanson2nd | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: 0.3 s from 1.25 s; mono, normalised, faded, re-encoded |
| `holster` (.ogg, .m4a) | [Draw 2.mp3](https://freesound.org/people/Pjkasinski3/sounds/171617/) (Freesound #171617) | Pjkasinski3 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: first 0.3 s; mono, normalised, faded, re-encoded |
| `impact_body` (.ogg, .m4a) | [Bullet Blood 4](https://freesound.org/people/JustInvoke/sounds/138481/) (Freesound #138481) | JustInvoke | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: whole clip; mono, normalised, faded, re-encoded |
| `impact_metal` (.ogg, .m4a) | [Foley bullet hit metal 02.wav](https://freesound.org/people/martian/sounds/182263/) (Freesound #182263) | martian | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: 0.55 s from 0.03 s; mono, normalised, faded, re-encoded |
| `impact_stone` (.ogg, .m4a) | [Hammer on concrete.WAV](https://freesound.org/people/myfreesoundaccount1998/sounds/595734/) (Freesound #595734) | myfreesoundaccount1998 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: 0.35 s from 1.1 s; mono, normalised, faded, re-encoded |
| `mag_in` (.ogg, .m4a) | [Magazine Insert](https://freesound.org/people/brianhanson2nd/sounds/171209/) (Freesound #171209) | brianhanson2nd | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: 0.5 s from 0.95 s; mono, normalised, faded, re-encoded |
| `mag_out` (.ogg, .m4a) | [Mag remove.wav](https://freesound.org/people/Nanashi/sounds/104407/) (Freesound #104407) | Nanashi | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: first 0.42 s; mono, normalised, faded, re-encoded |
| `shot_suppressed_1` (.ogg, .m4a) | [SIG Sauer P226 (Suppressed)](https://freesound.org/people/areniporgen/sounds/828790/) (Freesound #828790) | areniporgen | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: first 0.85 s; mono, normalised, faded, re-encoded |
| `shot_suppressed_2` (.ogg, .m4a) | [silenced pistol shot](https://freesound.org/people/Clutvh/sounds/627087/) (Freesound #627087) | Clutvh | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: first 0.85 s; mono, normalised, faded, re-encoded |
| `shot_suppressed_3` (.ogg, .m4a) | [Silenced Pistol Layered (Powerful)](https://freesound.org/people/Paul368/sounds/255716/) (Freesound #255716) | Paul368 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: whole clip; mono, normalised, faded, re-encoded |
| `slide_release` (.ogg, .m4a) | [Springfield Armory 1911 Slide Release](https://freesound.org/people/areniporgen/sounds/827946/) (Freesound #827946) | areniporgen | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Cut: whole clip; mono, normalised, faded, re-encoded |

## Fonts (`public/fonts/`)

Downloaded from Google Fonts as the Latin-subset variable WOFF2 files Google serves (unmodified), and self-hosted. Each family's licence text ships next to it as `OFL-*.txt`, as the SIL Open Font License requires. Total: about 118 KB.

| File | Family | Source | Copyright | Licence |
|---|---|---|---|---|
| `playfair-display-latin.woff2` | Playfair Display (display serif) | [Google Fonts](https://fonts.google.com/specimen/Playfair+Display) | 2017 The Playfair Display Project Authors (Reserved Font Name "Playfair Display") | [SIL OFL 1.1](https://openfontlicense.org) (`OFL-playfairdisplay.txt`) |
| `inter-latin.woff2` | Inter (UI and body) | [Google Fonts](https://fonts.google.com/specimen/Inter) | 2020 The Inter Project Authors | [SIL OFL 1.1](https://openfontlicense.org) (`OFL-inter.txt`) |
| `jetbrains-mono-latin.woff2` | JetBrains Mono (HUD numbers, departure boards) | [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) | 2020 The JetBrains Mono Project Authors | [SIL OFL 1.1](https://openfontlicense.org) (`OFL-jetbrainsmono.txt`) |

## Images

`public/img/title.webp` (the low-quality title backdrop) is a screenshot of the game itself. The explainer illustrations are inline SVG drawn for the game.

## Models

None. Add rows here, with the licence, before shipping any model or texture file.

