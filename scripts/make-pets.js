#!/usr/bin/env node
// Draws the desktop pets: small 16 x 16 pixel animals, four frames each, into
// client/assets/pets/<kind>.png (64 x 16). The pet window scales them up with
// nearest-neighbour so they stay crisp and small. Run again after editing a map.
//   frame 0 idle · 1 bob (one pixel down) · 2 blink · 3 talk (bob, mouth open)
// Map letters: O outline, B body, L light, P pink, E eye (two pixels tall),
// M mouth, N nose, W white, K dark body, Y beak/feet, D dark ears, '.' clear.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'assets', 'pets');

export const PETS = {
  cat: {
    name: '고양이', blink: 'B',
    colors: { O: '#3b2b2b', B: '#f4a259', L: '#ffe3c2', P: '#ff8fa3', E: '#2b2024', M: '#3b2b2b' },
    map: [
      '................',
      '..O.........O...',
      '.OLO.......OLO..',
      '.OLBO.....OBLO..',
      '.OBBBOOOOOBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBPBBBBMBBBBPBO.',
      '.OBBBBMBMBBBBO..',
      '..OOBBBBBBBOO...',
      '...OBLLLLLBO....',
      '...OBLLLLLBO....',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  dog: {
    name: '강아지', blink: 'B',
    colors: { O: '#3d2a1e', B: '#e0b07a', L: '#fff1dc', D: '#8a5a3b', E: '#2b2024', N: '#2b2024', M: '#3d2a1e', P: '#ff9fb0' },
    map: [
      '................',
      '....OOOOOOO.....',
      '..OOBBBBBBBOO...',
      '.ODDBBBBBBBDDO..',
      '.ODDBBBBBBBDDO..',
      '.ODDBEBBBEBDDO..',
      '.ODDBEBBBEBDDO..',
      '..ODBBBNBBBDO...',
      '...OPBMBMBPO....',
      '...OBLLLLLBO....',
      '....OBLLLBO.....',
      '...OBBLLLBBO....',
      '...OBBBBBBBO....',
      '...OBOO.OOBO....',
      '....O.....O.....',
      '................',
    ],
  },
  rabbit: {
    name: '토끼', blink: 'B',
    colors: { O: '#4a3b44', B: '#fbf7f4', L: '#ffb6c8', P: '#ffb6c8', E: '#2b2024', M: '#4a3b44' },
    map: [
      '...OO.....OO....',
      '..OLBO...OBLO...',
      '..OLBO...OBLO...',
      '..OLBO...OBLO...',
      '..OLBOOOOOBLO...',
      '.OBBBBBBBBBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBPBBBBMBBBBPBO.',
      '.OBBBBMBMBBBBO..',
      '..OOBBBBBBBOO...',
      '...OBBBBBBBO....',
      '...OBBBBBBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  chick: {
    name: '병아리', blink: 'B',
    colors: { O: '#6b4f1d', B: '#ffd93d', Y: '#ff9f1c', P: '#ffab91', E: '#2b2024', M: '#ff9f1c' },
    map: [
      '................',
      '......OO........',
      '.......O........',
      '....OOOOOOO.....',
      '...OBBBBBBBO....',
      '..OBBBBBBBBBO...',
      '..OBEBBBBBEBO...',
      '..OBEBBYBBEBO...',
      '..OBPBYMYBPBO...',
      '.OBBBBBBBBBBBO..',
      'OBBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '..OBBBBBBBBBO...',
      '...OOOOOOOOO....',
      '.....Y...Y......',
      '................',
    ],
  },
  penguin: {
    name: '펭귄', blink: 'W',
    colors: { O: '#1b2133', K: '#34405e', W: '#ffffff', Y: '#ffa94d', P: '#ffb3c1', E: '#1b2133', M: '#ffa94d' },
    map: [
      '................',
      '....OOOOOOO.....',
      '...OKKKKKKKO....',
      '..OKKKKKKKKKO...',
      '..OKWWWKWWWKO...',
      '..OKWEWWWEWKO...',
      '..OKWEWYWEWKO...',
      '..OKWPWMWPWKO...',
      '.OKKWWWWWWWKKO..',
      'OKKKWWWWWWWKKKO.',
      '.OKKWWWWWWWKKO..',
      '..OKWWWWWWWKO...',
      '..OKKWWWWWKKO...',
      '...OOOOOOOOO....',
      '....YY...YY.....',
      '................',
    ],
  },
  hamster: {
    name: '햄스터', blink: 'B',
    colors: { O: '#4a3426', B: '#eeb07a', L: '#fff4e4', P: '#ff9fb0', E: '#2b2024', N: '#c0607a', M: '#4a3426' },
    map: [
      '................',
      '...OO.....OO....',
      '..OPBO...OBPO...',
      '..OBBOOOOOBBO...',
      '.OBBBBBBBBBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBNBBBEBBO.',
      'OPPBBBMBMBBBPPO.',
      'OBLLLLLLLLLLLBO.',
      'OBLLLLLLLLLLLBO.',
      '.OBLLLLLLLLLBO..',
      '..OBBBBBBBBBO...',
      '...OOOOOOOOO....',
      '....OO...OO.....',
      '................',
    ],
  },
  fox: {
    name: '여우', blink: 'B',
    colors: { O: '#3a2418', B: '#f08a3c', L: '#fff4e8', D: '#3a2418', E: '#2b2024', N: '#2b2024', M: '#3a2418', P: '#ff9fb0' },
    map: [
      '................',
      '.OO.........OO..',
      '.ODO.......ODO..',
      '.OBBO.....OBBO..',
      '.OBBBOOOOOBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBBBBBEBBO.',
      'OLLLBBBNBBBLLLO.',
      '.OLLLLMLMLLLLO..',
      '..OOLLLLLLLOO...',
      '...OBLLLLLBO....',
      '...OBLLLLLBO....',
      '...OBBOOOBBO....',
      '....DD...DD.....',
      '................',
    ],
  },
  bear: {
    name: '곰', blink: 'B',
    colors: { O: '#3b2618', B: '#a86b3c', D: '#e8a77a', L: '#e9c9a0', E: '#20160f', N: '#20160f', M: '#3b2618', P: '#ff9fb0' },
    map: [
      '................',
      '..OOO.....OOO...',
      '.OBDBO...OBDBO..',
      '.OBBBOOOOOBBBO..',
      '.OBBBBBBBBBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBBBLLLLLBBBBO.',
      '.OBBLLLNLLLBBO..',
      '..OOBLMLMLBOO...',
      '...OBBLLLBBO....',
      '...OBBBBBBBO....',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  // Eyes sit in the dark patches, so a blink closes them into the patch.
  panda: {
    name: '판다', blink: 'K',
    colors: { O: '#1d1d24', W: '#fafafa', K: '#2a2a33', E: '#f5f5f5', N: '#2a2a33', M: '#2a2a33', P: '#ffb3c1' },
    map: [
      '................',
      '..OO.......OO...',
      '.OKKO.....OKKO..',
      '.OKKOOOOOOOKKO..',
      '.OWWWWWWWWWWWO..',
      'OWWWWWWWWWWWWWO.',
      'OWKKKWWWWWKKKWO.',
      'OWKEKWWWWWKEKWO.',
      'OKKEKWWNWWKEKKO.',
      'OWKKWWMWMWWKKWO.',
      '.OWWWWWWWWWWWO..',
      '..OOWWWWWWWOO...',
      '...OKKWWWKKO....',
      '...OKKKKKKKO....',
      '....KK...KK.....',
      '................',
    ],
  },
  frog: {
    name: '개구리', blink: 'W',
    colors: { O: '#1f3b1f', B: '#6cc24a', L: '#d8f0b0', W: '#ffffff', E: '#1b1b1b', M: '#1f3b1f', P: '#ff9fb0' },
    map: [
      '................',
      '..OOO.....OOO...',
      '.OWWWO...OWWWO..',
      '.OWEWOOOOOWEWO..',
      '.OWEWBBBBBWEWO..',
      'OBBBBBBBBBBBBBO.',
      'OBBBBBBBBBBBBBO.',
      'OBPBBBBBBBBBPBO.',
      'OBBBMMMMMMMBBBO.',
      '.OBBBBBBBBBBBO..',
      '..OLLLLLLLLLO...',
      '..OLLLLLLLLLO...',
      '.OBBOLLLLLOBBO..',
      '.OBBO.OOO.OBBO..',
      '..OO.......OO...',
      '................',
    ],
  },
  pig: {
    name: '돼지', blink: 'B',
    colors: { O: '#6b3040', B: '#ffb3c6', D: '#e07a95', L: '#ff8fab', N: '#9b3f5c', E: '#2b2024', M: '#9b3f5c', P: '#ff6f91' },
    map: [
      '................',
      '..OO.......OO...',
      '.ODBO.....OBDO..',
      '.OBBOOOOOOOBBO..',
      '.OBBBBBBBBBBBO..',
      'OBBBBBBBBBBBBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBEBBBBBBBEBBO.',
      'OBBBBLLLLLBBBBO.',
      'OBPBBLNLNLBBPBO.',
      '.OBBBBMMMBBBBO..',
      '..OOBBBBBBBOO...',
      '...OBBBBBBBO....',
      '...OBBOOOBBO....',
      '....DD...DD.....',
      '................',
    ],
  },
  mouse: {
    name: '쥐', blink: 'B',
    colors: { O: '#3c3a46', B: '#b8b6c6', P: '#ffb3c1', L: '#e8e6f0', E: '#20202a', N: '#ff8fa3', M: '#3c3a46' },
    map: [
      '................',
      '.OOO.......OOO..',
      'OBPBO.....OBPBO.',
      'OBPBO.....OBPBO.',
      '.OBBOOOOOOOBBO..',
      '..OBBBBBBBBBO...',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBPBBBNBBBPBO..',
      '..OBBBMBMBBBO...',
      '...OOBBBBBOO....',
      '....OBLLLBO.....',
      '....OBLLLBO..O..',
      '....OBBOBBOOO...',
      '.....OO.OO......',
      '................',
    ],
  },
  parrot: {
    name: '앵무새', blink: 'B',
    colors: { O: '#1f3d2b', B: '#3bb273', L: '#2a8a57', W: '#ffd23f', R: '#e63946', Y: '#3a3a3a', K: '#7a7a7a', E: '#1b1b1b', P: '#ff9fb0', M: '#3a3a3a' },
    map: [
      '................',
      '.......RR.......',
      '....OORRBOO.....',
      '...OBBBBBBBO....',
      '..OBBBBBBBBBO...',
      '..OBEBBBBBEBO...',
      '..OBEBBYBBEBO...',
      '..OBPBYMYBPBO...',
      '.OBBBBBYBBBBBO..',
      'OLLBBBBBBBBBLLO.',
      'OLLBWWWWWWWBLLO.',
      '.OLBWWWWWWWBLO..',
      '..OBBWWWWWBBO...',
      '...OOOOOOOOO....',
      '.....K...K......',
      '................',
    ],
  },
  // Eyes in white rings: a blink closes them into the rings.
  owl: {
    name: '부엉이', blink: 'W',
    colors: { O: '#3b2416', B: '#8d5a3b', W: '#fff8e7', E: '#1b1b1b', Y: '#f4a261', M: '#3b2416', L: '#e9c8a0', D: '#8d5a3b', P: '#ff9fb0' },
    map: [
      '................',
      '..OO.......OO...',
      '..OBO.....OBO...',
      '..OBBOOOOOBBO...',
      '.OBBBBBBBBBBBO..',
      '.OBWWWBBBWWWBO..',
      '.OWWEWWBWWEWWO..',
      '.OWWEWWYWWEWWO..',
      '.OBWWWBMBWWWBO..',
      '.OBBBBBBBBBBBO..',
      '.OBLLLLLLLLLBO..',
      '.OBLDLDLDLDLBO..',
      '.OBBLLLLLLLBBO..',
      '..OOOOOOOOOOO...',
      '....YY...YY.....',
      '................',
    ],
  },
  hedgehog: {
    name: '고슴도치', blink: 'L',
    colors: { K: '#5a3d2b', T: '#a07a52', O: '#3b2416', L: '#f2d7b6', E: '#1b1b1b', N: '#1b1b1b', M: '#3b2416', P: '#ff9fb0' },
    map: [
      '..K.K.K.K.K.K...',
      '.KTKTKTKTKTKTK..',
      'KTKKKKKKKKKKKTK.',
      'KKTKOOOOOOOKTKK.',
      'TKKOLLLLLLLOKKT.',
      'KKOLELLLLLELOKK.',
      'TKOLELLLLLELOKT.',
      'KKOLPLLNLLPLOKK.',
      'TKKOLLMLMLLOKKT.',
      '.KTKOOLLLOOKTK..',
      '..KKOLLLLLOKK...',
      '...OLLLLLLLO....',
      '...OLLLLLLLO....',
      '...OLLOOOLLO....',
      '....OO...OO.....',
      '................',
    ],
  },
  // White, so it is not the chick: an orange bill and feet.
  duck: {
    name: '오리', blink: 'W',
    colors: { O: '#3d3d4d', W: '#ffffff', L: '#dfe6ee', Y: '#ff9f1c', M: '#c46a00', E: '#1b1b1b', P: '#ffb3c1' },
    map: [
      '.....OOOO.......',
      '....OWWWWO......',
      '...OWWWWWWO.....',
      '...OWEWWEWO.....',
      '...OWEWWEWO.....',
      '...OYYYYYYO.....',
      '...OYYMMYYO.....',
      '...OWPWWPWO.....',
      '..OWWWWWWWWO....',
      '.OWWWWWWWWWWO...',
      'OWWLWWWWWWLWWO..',
      'OWWLLWWWWLLWWO..',
      '.OWWWWWWWWWWO...',
      '..OOOOOOOOOO....',
      '....YY..YY......',
      '................',
    ],
  },
  tiger: {
    name: '호랑이', blink: 'B',
    colors: { O: '#3a2416', B: '#f39c34', K: '#2b1d14', W: '#fff6ea', E: '#1b1b1b', N: '#d9636f', M: '#3a2416', P: '#ff9fb0' },
    map: [
      '................',
      '..OOO.....OOO...',
      '.OBWBO...OBWBO..',
      '.OBBBOOOOOBBBO..',
      '.OBBBKBKBKBBBO..',
      'OKBBBBKBKBBBBKO.',
      'OBBEBBBBBBBEBBO.',
      'OKBEBBBBBBBEBKO.',
      'OBWWWBBNBBWWWBO.',
      '.OWWWWMWMWWWWO..',
      '..OOWWWWWWWOO...',
      '...OBKBBBKBO....',
      '...OBBWWWBBO....',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  // The rest of the twelve zodiac animals (쥐 · 호랑이 · 토끼 · 용 · 강아지 · 돼지 are above).
  ox: {
    name: '소', blink: 'W',
    colors: { O: '#2b2b2b', W: '#ffffff', K: '#2b2b2b', Y: '#e9d8a6', L: '#ffb3c1', N: '#7a3b4a', M: '#7a3b4a', E: '#1b1b1b', P: '#ff8fa3' },
    map: [
      '................',
      '.YY........YY...',
      '..YOOOOOOOOY....',
      '.OOWWWKKWWWWOO..',
      'OWOWWKKKWWWWOWO.',
      '.OOWWWWWWWKKWOO.',
      '..OWEWWWWWEKKO..',
      '..OWEWWWWWEWWO..',
      '..OLLLLLLLLLLO..',
      '..OLNLLMMLLNLO..',
      '...OLLLLLLLLO...',
      '...OWWKWWWWO....',
      '...OWKKWWWWO....',
      '...OWWOOOWWO....',
      '....KK...KK.....',
      '................',
    ],
  },
  snake: {
    name: '뱀', blink: 'B',
    colors: { O: '#1f4d22', B: '#5fb85a', L: '#c8e6a0', E: '#1b1b1b', P: '#ff9fb0', M: '#c0392b' },
    map: [
      '................',
      '....OOOOOO......',
      '...OBBBBBBO.....',
      '..OBEBBBBEBO....',
      '..OBEBBBBEBO....',
      '..OBPBMMBPBO....',
      '...OBBBBBBO.....',
      '....OOBBOO......',
      '...OOLLBBOOO....',
      '..OBBBBLLBBBO...',
      '.OLLBBBBBBBLLO..',
      'OBBBLLLLLLLBBBO.',
      'OBBBBBBBBBBBBBO.',
      '.OOOOOOOOOOOOO..',
      '................',
      '................',
    ],
  },
  horse: {
    name: '말', blink: 'B',
    colors: { O: '#3b2416', B: '#a0623a', D: '#4a2c1a', W: '#fff6ea', L: '#d9a37a', N: '#3b2416', E: '#1b1b1b', M: '#3b2416', P: '#ff9fb0' },
    map: [
      '..O.........O...',
      '.OBO.DDDDD.OBO..',
      '.OBBODDDDDOBBO..',
      '..OBBBDDDBBBO...',
      '..OBEBBWBBEBO...',
      '..OBEBBWBBEBO...',
      '...OBBBWBBBO....',
      '...OLLLLLLLO....',
      '...OLNLMLNLO....',
      '....OLLLLLO.....',
      '...OBOOOOOBO....',
      '..OBBBBBBBBBODD.',
      '..OBBBBBBBBBO.D.',
      '..OBBOOOOOBBO...',
      '..ODDO...ODDO...',
      '................',
    ],
  },
  sheep: {
    name: '양', blink: 'L',
    colors: { O: '#5a5a66', W: '#ffffff', K: '#3a3a44', L: '#f2dcc2', E: '#1b1b1b', N: '#c0607a', M: '#5a5a66', P: '#ffb3c1' },
    map: [
      '................',
      '....OOOOOOO.....',
      '..OOWWWWWWWOO...',
      '.OWWWWWWWWWWWO..',
      'OWWWOOOOOOOWWWO.',
      'KKWOLLLLLLLOWKK.',
      '.KOLLELLLLELOK..',
      '.OWOLELLLLELOWO.',
      'OWWOLPLNLPLOWWO.',
      'OWWWOLLMLLOWWWO.',
      '.OWWWOOOOOWWWO..',
      '.OWWWWWWWWWWWO..',
      '..OWWWWWWWWWO...',
      '...OKOOOOOKO....',
      '....KK...KK.....',
      '................',
    ],
  },
  monkey: {
    name: '원숭이', blink: 'L',
    colors: { O: '#3b2416', B: '#8d5a3b', L: '#f0c9a0', E: '#1b1b1b', N: '#3b2416', M: '#3b2416', P: '#ff9fb0' },
    map: [
      '................',
      '.....OOOOOO.....',
      '...OOBBBBBBOO...',
      '..OBBBBBBBBBBO..',
      '.OOBLLLBBLLLBOO.',
      'OLLOLLLLLLLLOLLO',
      'OLLOLELLLLELOLLO',
      '.OOOLELLLLELOOO.',
      '...OLLLNNLLLO...',
      '...OLPLLLLPLO...',
      '...OLLMMMMLLO...',
      '....OOLLLLOO....',
      '...OBBBLLBBBO...',
      '...OBBOOOOBBO...',
      '....OO....OO....',
      '................',
    ],
  },
  // White with a red comb, so it is not the yellow chick.
  rooster: {
    name: '닭', blink: 'W',
    colors: { O: '#5a4a3a', W: '#ffffff', R: '#e63946', Y: '#ffb703', L: '#dfe6ee', E: '#1b1b1b', M: '#c46a00', P: '#ffb3c1' },
    map: [
      '.....R.R........',
      '....RRRRR.......',
      '....OOOOOO......',
      '...OWWWWWWO.....',
      '..OWEWWWWEWO....',
      '..OWEWYYWEWO....',
      '..OWWWYMWWWO....',
      '..OWPWRRWPWO....',
      '.OWWWWRWWWWWO...',
      'OWWWWWWWWWWWWO..',
      'OWLWWWWWWWWLWO..',
      'OWLLWWWWWWLLWO..',
      '.OWWWWWWWWWWO...',
      '..OOOOOOOOOO....',
      '....YY..YY......',
      '................',
    ],
  },
  // A teammate's own shark, named after them: 북항이.
  shark: {
    name: '북항이(상어)', blink: 'B',
    colors: { O: '#1c3144', B: '#5b8bb3', W: '#eef4f8', E: '#11161c', M: '#3a1f2b', P: '#ff9fb0' },
    map: [
      '.......OO.......',
      '......OBBO......',
      '.....OBBBBO.....',
      '...OOBBBBBBOO...',
      '..OBBBBBBBBBBO..',
      '.OBBEBBBBBBEBBO.',
      '.OBBEBBBBBBEBBO.',
      'OBBBBBBBBBBBBBBO',
      'OBPWWWWWWWWWWPBO',
      'OBWMWMWMWMWMWWBO',
      'OBWWWWWWWWWWWWBO',
      '.OBWWWWWWWWWWBO.',
      '..OBBWWWWWWBBO..',
      '.OBO.OOOOOO.OBO.',
      '.OO..........OO.',
      '................',
    ],
  },
  // A small, friendly dragon: horns, a spiky crest, little wings.
  dragon: {
    name: '용', blink: 'B',
    colors: { O: '#1f4d2b', B: '#4caf50', L: '#c8f0a0', W: '#ff8fa3', Y: '#ffd166', E: '#1b1b1b', N: '#1f4d2b', M: '#1f4d2b', P: '#ff9fb0' },
    map: [
      '................',
      '..Y..O.O.O..Y...',
      '..YOOBOBOBOOY...',
      '...OBBBBBBBO....',
      '..OBBBBBBBBBO...',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBBLLLLLBBBO..',
      '.OBBLNLLLNLBBO..',
      '..OBBLMMMLBBO...',
      '..OOBBBBBBBOO...',
      '.WOBLLLLLLBOW...',
      'WWOBLLLLLLBOWW..',
      '...OBBOOBBO.....',
      '....YY..YY......',
      '................',
    ],
  },
  // Round rice-cake friends: one soft ball of a body, dot eyes, big blushes. `pick: true` keeps
  // them out of the animals handed to people who never chose one (server/pet.js kindFor), so
  // adding them moved nobody's pet.
  mochi: {
    name: '찹쌀떡', blink: 'B', pick: true,
    colors: { O: '#2a2426', B: '#ffffff', L: '#ece6ea', P: '#f7a8b8', E: '#1c1718', M: '#2a2426' },
    map: [
      '................',
      '..OOO.....OOO...',
      '.OBPBO...OBPBO..',
      '.OBBBOOOOOBBBO..',
      '.OBBBBBBBBBBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OPPBBMBMBBPPO..',
      '.OBBBBBMBBBBBO..',
      'OOBBBBBBBBBBBOO.',
      'OBBBBBBBBBBLLBO.',
      '.OBBBBBBBBLLBO..',
      '..OBBBBBBLLBO...',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  bluecat: {
    name: '파랑냥', blink: 'B', pick: true,
    colors: { O: '#2a2426', B: '#ffffff', D: '#6f9cc6', P: '#f7a8b8', E: '#1c1718', M: '#2a2426' },
    map: [
      '..O.........O...',
      '.ODO.......ODO..',
      '.ODPOOOOOOOPDO..',
      '.ODDDDDDDDDDDO..',
      '.OBBDDDDDDDBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OPPBBMBMBBPPO..',
      '.OBBBBBMBBBBBO..',
      'OOBBBBBBBBBBBOOO',
      'OBBBBBBBBBBBBODO',
      '.OBBBBBBBBBBBDDO',
      '..OBBBBBBBBBOOO.',
      '...ODDOOODDO....',
      '....OO...OO.....',
      '................',
    ],
  },
  lemonbun: {
    name: '레몬토끼', blink: 'B', pick: true,
    colors: { O: '#2a2426', B: '#f6e3a6', L: '#f4b8c4', T: '#f28a2e', G: '#5fb34a', P: '#f7a8b8', E: '#1c1718', M: '#2a2426' },
    map: [
      '...OO.....OO....',
      '..OBLO...OLBO...',
      '..OBLO...OLBO...',
      '..OBLO...OLBO...',
      '..OBBOOOOOBBO...',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OPPBBMBMBBPPO..',
      '.OBBBBBMBBBBBO..',
      'OOBBBBBGBBBBBOO.',
      'OBBBBBTTTBBBBBO.',
      '.OBBBBBTBBBBBO..',
      '..OBBBBBBBBBO...',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  otter: {
    name: '수달', blink: 'B', pick: true,
    colors: { O: '#3d2a1e', B: '#a9744f', L: '#f3dcc0', D: '#7a4f33', W: '#f4f1ea', S: '#b9b2a6', P: '#f7a8b8', E: '#1c1718', M: '#3d2a1e', N: '#3d2a1e' },
    map: [
      '................',
      '..OO.......OO...',
      '..OBOOOOOOOBO...',
      '..OBBBBBBBBBO...',
      '.OBBBBBBBBBBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBELLNLLEBBO..',
      '.OPPLLMLMLLPPO..',
      '.OBBBLLMLLBBBO..',
      'OOBBLLWWWLLBBOO.',
      'OBBBDWWSWWDBBBO.',
      '.OBBLLWWWLLBBO..',
      '..OBBBLLLBBBO...',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  seal: {
    name: '물범', blink: 'B', pick: true,
    colors: { O: '#3a4250', B: '#eef2f6', D: '#b7c3d0', P: '#f7a8b8', E: '#1c1718', M: '#3a4250', N: '#3a4250' },
    map: [
      '................',
      '................',
      '....OOOOOOO.....',
      '..OOBBBBBBBOO...',
      '.OBBBBBBBBBDBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBNBBEBBO..',
      '.OPPBDMBMDBPPO..',
      '.OBBBBBMBBBBBO..',
      'OOBBBBBBBBBBBOO.',
      'ODDBBBBBBBBBDDO.',
      '.ODBBBDBBBBBDO..',
      '..OBBBBBBBBBO...',
      '..OODDOOODDOO...',
      '...OOO...OOO....',
      '................',
    ],
  },
  // A sheet ghost: a tall round head, two little arms out, no feet — it trails off into a wisp.
  ghost: {
    name: '유령', blink: 'B', pick: true,
    colors: { O: '#4a4a6a', B: '#ffffff', L: '#dfe6f5', P: '#f7a8b8', E: '#1c1718', M: '#4a4a6a' },
    map: [
      '.....OOOOOO.....',
      '...OOBBBBBBOO...',
      '..OBBBBBBBBBBO..',
      '..OBBBBBBBBBBO..',
      '..OBEBBBBBBEBO..',
      '..OBEBBBBBBEBO..',
      '..OPPBBMMBBPPO..',
      '.OOBBBBMMBBBBOO.',
      'OBOBBBBBBBBBBOBO',
      '.OOBBBBBBBBBBOO.',
      '..OBBBBBBBBBBO..',
      '...OLBBBBBBBBO..',
      '....OOLLBBBBBOO.',
      '......OOOLLBBBO.',
      '.........OOOOO..',
      '................',
    ],
  },
  sprout: {
    name: '새싹이', blink: 'B', pick: true,
    colors: { O: '#3e5a2a', B: '#d8f2b0', G: '#6cc04a', H: '#3f8f2f', K: '#8a5a3b', P: '#f7a8b8', E: '#1c1718', M: '#3e5a2a' },
    map: [
      '..OOO.....OOO...',
      '.OGGGO...OGGGO..',
      '.OGHGGO.OGGHGO..',
      '..OOGGGOGGGOO...',
      '..OOOOOGOOOOO...',
      '.OBBBBBBBBBBBO..',
      '.OBBEBBBBBEBBO..',
      '.OBBEBBBBBEBBO..',
      '.OPPBBMBMBBPPO..',
      '.OBBBBBMBBBBBO..',
      'OOBBBBBBBBBBBOO.',
      '.OBBBBBBBBBBBO..',
      '..OBBBBBBBBBO...',
      '...OKKOOOKKO....',
      '....OO...OO.....',
      '................',
    ],
  },
  // A horse's long face under one gold horn, a rainbow mane down one side.
  unicorn: {
    name: '유니콘', blink: 'B', pick: true,
    colors: { O: '#5a4a6a', B: '#ffffff', L: '#ffe3ec', N: '#c47a94', Y: '#ffd166', H: '#f0a830', R: '#ff8fb1', V: '#b39ddb', C: '#7fd3e6', P: '#f7a8b8', E: '#1c1718', M: '#c47a94' },
    map: [
      '.......Y........',
      '.......Y........',
      '..O...OHO...O...',
      '.OBO.OYYYO.OBO..',
      '.OBBOOOOOOOBBO..',
      '.ORRBBBBBBBBBO..',
      'ORRVEBBBBBEBBO..',
      'OVVVEBBBBBEBBO..',
      'OVCCPBBBBBBPBO..',
      'OCCOBLLLLLLBO...',
      '.OOOLNLLLLNLO...',
      '...OLLLMMLLLO...',
      '...OOBBBBBBOO...',
      '...OBBOOOOBBO...',
      '...OOO....OOO...',
      '................',
    ],
  },
  // Half-closed eyes (they do not blink) and a mandarin on its head.
  capybara: {
    name: '카피바라', blink: 'B', pick: true,
    colors: { O: '#4a3020', B: '#c9925e', D: '#a8743f', N: '#4a3020', T: '#ff9f1c', G: '#5fb34a', P: '#f29aa8', E: '#1c1718', M: '#4a3020' },
    map: [
      '.......G........',
      '......OOO.......',
      '..OO.OTTTO.OO...',
      '..OBOOTTTOOBO...',
      '.OBBBBOOOBBBBO..',
      '.OBBBBBBBBBBBO..',
      '.OBEEBBBBBEEBO..',
      '.OBBBDNNNDBBBO..',
      '.OPPBDDMDDBPPO..',
      'OOBBBBDDDBBBBOO.',
      'OBBBBBBBBBBBBBO.',
      '.OBBBBBBBBBBBO..',
      '..OBBBBBBBBBO...',
      '...OBBOOOBBO....',
      '....OO...OO.....',
      '................',
    ],
  },
  // Feathery gills, three a side, on a wide flat head; a fin of a tail.
  axolotl: {
    name: '우파루파', blink: 'B', pick: true,
    colors: { O: '#8a3d55', B: '#ffc2d4', L: '#ffe1ea', R: '#ff6f91', P: '#ff8fab', E: '#1c1718', M: '#8a3d55' },
    map: [
      '................',
      'RR..OOOOOOO..RR.',
      '.RROBBBBBBBORR..',
      'RROBBBBBBBBBORR.',
      '.ROBEBBBBBEBOR..',
      'RROBEBBBBBEBORR.',
      '.ROPPBBBBBPPOR..',
      '..OBBMBBBMBBO...',
      '..OBBBMMMBBBO...',
      '...OOBBBBBOO....',
      '..OOBLLLLLBOO...',
      '.OBOBLLLLLBOBO..',
      '..OOBBLLLBBOORR.',
      '...OBBOOOBBORR..',
      '....OO...OO.....',
      '................',
    ],
  },
};

const SIZE = 16;
const FRAMES = 4;
const rgba = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

// The four frames as letter grids.
export function frames(pet) {
  const base = pet.map.map((r) => r.split(''));
  const down = (g) => [Array(SIZE).fill('.'), ...g.slice(0, SIZE - 1)];
  const blink = base.map((r) => [...r]);
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE; x++) if (base[y][x] === 'E' && base[y + 1][x] === 'E') blink[y][x] = pet.blink;
  }
  // Open mouth: the mouth pixels turn pink, read as a mouth saying something.
  const talk = down(base.map((r) => r.map((c) => (c === 'M' ? 'P' : c))));
  return [base, down(base), blink, talk];
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// A plain RGBA PNG: width x height pixels from px(x, y) -> [r, g, b, a].
export function png(width, height, px) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(px(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function sheet(pet, scale = 1) {
  const fs4 = frames(pet);
  return png(SIZE * FRAMES * scale, SIZE * scale, (x, y) => {
    const f = Math.floor(x / (SIZE * scale));
    const c = fs4[f][Math.floor(y / scale)][Math.floor((x % (SIZE * scale)) / scale)];
    return c === '.' ? [0, 0, 0, 0] : rgba(pet.colors[c]);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [kind, pet] of Object.entries(PETS)) {
    for (const row of pet.map) if (row.length !== SIZE) throw new Error(`${kind}: a row is ${row.length} wide: ${row}`);
    fs.writeFileSync(path.join(OUT, `${kind}.png`), sheet(pet));
  }
  // An enlarged preview of every pet, for checking the drawing by eye.
  const preview = process.argv[2];
  if (preview) {
    const kinds = Object.keys(PETS);
    const S = 8, W = SIZE * FRAMES * S, H = SIZE * S;
    const sheets = kinds.map((k) => frames(PETS[k]));
    fs.writeFileSync(preview, png(W, H * kinds.length, (x, y) => {
      const i = Math.floor(y / H), f = Math.floor(x / (SIZE * S));
      const c = sheets[i][f][Math.floor((y % H) / S)][Math.floor((x % (SIZE * S)) / S)];
      return c === '.' ? ((Math.floor(x / S) + Math.floor(y / S)) % 2 ? [238, 238, 245, 255] : [225, 225, 235, 255]) : rgba(PETS[kinds[i]].colors[c]);
    }));
  }
  console.log(`${Object.keys(PETS).join(', ')} → ${path.relative(ROOT, OUT)}`);
}
