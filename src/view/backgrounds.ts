/**
 * Registry of available backgrounds. To add a real one: drop an image in
 * `public/assets/backgrounds/`, load it in BootScene under a key, and add the
 * key here. DuelView uses the texture if it exists, else falls back to a
 * generated placeholder of the same key.
 */
export interface BackgroundDef {
  key: string;
  label: string;
}

export const BACKGROUNDS: BackgroundDef[] = [
  { key: 'bg-dusk', label: 'Сумерки' },
  { key: 'bg-forest', label: 'Лес' },
];

export function pickBackground(): string {
  return BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]!.key;
}
