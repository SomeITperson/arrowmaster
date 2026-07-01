export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
