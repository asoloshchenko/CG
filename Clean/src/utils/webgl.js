/**
 * Инициализация WebGL-контекста.
 * @param {HTMLCanvasElement} canvas
 * @param {'webgl'|'webgl2'} [version='webgl2']
 * @returns {WebGL2RenderingContext}
 */
export function initGL(canvas, version = 'webgl2') {
    const gl = canvas.getContext(version);
    if (!gl) throw new Error(`${version} не поддерживается браузером`);
    return gl;
}

/**
 * Компиляция шейдера.
 */
export function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Ошибка компиляции шейдера:\n${err}`);
    }
    return shader;
}

/**
 * Создание шейдерной программы из исходников вершинного и фрагментного шейдеров.
 */
export function createProgram(gl, vertSrc, fragSrc) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`Ошибка линковки:\n${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
}

/**
 * Собирает карту всех uniform-локаций для программы.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} prog
 * @returns {Record<string, WebGLUniformLocation>}
 */
export function getUniforms(gl, prog) {
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    const map = {};
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        map[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return map;
}

/**
 * Создаёт VBO и загружает данные.
 * @param {WebGLRenderingContext} gl
 * @param {Float32Array|number[]} data
 * @param {number} [usage=gl.STATIC_DRAW]
 */
export function createBuffer(gl, data, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage ?? gl.STATIC_DRAW);
    return buf;
}

/**
 * Настройка атрибута вершинного буфера (VAO-совместимо).
 */
export function setAttrib(gl, prog, name, size, stride = 0, offset = 0) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
}

/**
 * Загрузка текстуры из URL.
 * @returns {Promise<WebGLTexture>}
 */
export function loadTexture(gl, url) {
    return new Promise((resolve, reject) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([128, 128, 128, 255]));

        const img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            resolve(tex);
        };
        img.onerror = () => reject(new Error(`Не удалось загрузить: ${url}`));
        img.src = url;
    });
}

export function makeVaoFromMesh(gl, prog, mesh){
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // VBO
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    // IBO
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    // Атрибуты: stride = 8 floats * 4 байта = 32
    const posLoc    = gl.getAttribLocation(prog, 'a_pos');
    const normalLoc = gl.getAttribLocation(prog, 'a_normal');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc,    3, gl.FLOAT, false, mesh.stride, mesh.offsets.position);

    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, mesh.stride, mesh.offsets.normal);

    gl.bindVertexArray(null);
    
    return vao
}

/**
 * Подгоняет размер canvas под devicePixelRatio и CSS-размер.
 * Возвращает true, если размер изменился.
 */
export function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        return true;
    }
    return false;
}
