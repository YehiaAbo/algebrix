// Every pack the app knows about. To add one, write a file next to the others and
// list it here; it shows up in Settings (,) on its own.
import { SoundPack, LookPack } from './types';
import { classic } from './sounds/classic';
import { blocks } from './sounds/blocks';
import { build } from './sounds/buildpack';
import { studio } from './looks/studio';
import { pixel } from './looks/pixel';

export const SOUND_PACKS: SoundPack[] = [classic, blocks, build];
export const LOOKS: LookPack[] = [studio, pixel];

export const soundPack = (id: string) => SOUND_PACKS.find(p => p.id === id) ?? SOUND_PACKS[0];
export const look = (id: string) => LOOKS.find(p => p.id === id) ?? LOOKS[0];
export type { SoundPack, LookPack, Sounds, Synth } from './types';
