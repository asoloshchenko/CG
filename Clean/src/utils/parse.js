/**
 * Парсер .obj файлов.
 *
 * Возвращает interleaved Float32Array и Uint32Array индексов,
 * готовые для передачи в WebGL.
 *
 * Формат вершины в буфере (8 floats):
 *   [x, y, z,  nx, ny, nz,  u, v]
 *
 * Поддерживает:
 *   - f v
 *   - f v/vt
 *   - f v//vn
 *   - f v/vt/vn
 *   - полигоны (автоматически триангулируются fan-методом)
 */
export function parseOBJ(text) {
    // Сырые массивы из файла (1-based в OBJ, здесь 0-based после сдвига)
    const positions = [];   // vec3
    const normals   = [];   // vec3
    const uvs       = [];   // vec2

    // Итоговые interleaved данные
    const vertexData = [];  // [x,y,z, nx,ny,nz, u,v, ...]
    const indices    = [];  // Uint32

    // Кэш: ключ "pi/ui/ni" → индекс в vertexData
    const cache = new Map();

    // ── Вспомогательная функция ──────────────────────────────────────────────

    function getOrAddVertex(token) {
        if (cache.has(token)) return cache.get(token);

        const [pi, ui, ni] = token.split('/').map(s => (s === '' ? undefined : parseInt(s) - 1));

        const [px, py, pz] = pi !== undefined ? positions[pi] : [0, 0, 0];
        const [nx, ny, nz] = ni !== undefined ? normals[ni]   : [0, 1, 0];
        const [u,  v     ] = ui !== undefined ? uvs[ui]       : [0, 0];

        const idx = vertexData.length / 8;
        vertexData.push(px, py, pz, nx, ny, nz, u, v);
        cache.set(token, idx);
        return idx;
    }

    // ── Основной парсинг ─────────────────────────────────────────────────────

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        const key   = parts[0];

        if (key === 'v') {
            positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);

        } else if (key === 'vn') {
            normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);

        } else if (key === 'vt') {
            uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);

        } else if (key === 'f') {
            // parts[1..n] — токены вершин грани
            // Триангуляция fan-методом: (0,1,2), (0,2,3), (0,3,4)...
            const faceTokens  = parts.slice(1);
            const faceIndices = faceTokens.map(getOrAddVertex);

            for (let i = 1; i < faceIndices.length - 1; i++) {
                indices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
            }
        }
        // g, o, s, usemtl, mtllib — игнорируем
    }

    return {
        // Interleaved буфер: позиция(3) + нормаль(3) + uv(2)
        vertices: new Float32Array(vertexData),
        indices:  new Uint32Array(indices),

        // Мета для gl.vertexAttribPointer
        stride:   8 * 4,          // 8 floats × 4 байта
        offsets: {
            position: 0,          // байт
            normal:   3 * 4,      // байт
            uv:       6 * 4,      // байт
        },
    };
}


/**
 * Загружает .obj по URL и парсит его.
 * @param {string} url
 * @returns {Promise<ReturnType<parseOBJ>>}
 */
export async function loadOBJ(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось загрузить ${url}: ${res.status}`);
    return parseOBJ(await res.text());
}
