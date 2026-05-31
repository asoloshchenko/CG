export { mat4, mat3, vec3, vec4, quat, glMatrix } from 'gl-matrix';

/** Перевод градусов в радианы */
export const deg2rad = (d) => (d * Math.PI) / 180;

/** Линейная интерполяция */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Clamp */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Случайное число в диапазоне [min, max) */
export const rand = (min, max) => Math.random() * (max - min) + min;

/** Случайное число с нормальным распределением (Box-Muller) */
export function randNormal(mean = 0, std = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
