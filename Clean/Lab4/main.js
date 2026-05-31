import { initGL, createProgram, resizeCanvas, loadTexture } from '@utils/webgl';
import { loadOBJ } from '@utils/parse';
import { mat4 } from 'gl-matrix';

const canvas = document.getElementById("glcanvas");
const gl     = initGL(canvas, 'webgl2');

// ═══════════════════════════════════════════════════════════════════════════════
//  ШЕЙДЕРЫ — Кубы (текстура материала + наложение цифр с цветовым тонированием)
// ═══════════════════════════════════════════════════════════════════════════════

const vsCube = `#version 300 es
in vec3 aPosition;
in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

out vec2 vUV;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vUV = aUV;
}
`;

const fsCube = `#version 300 es
precision mediump float;

in vec2 vUV;

uniform vec3      uColor;
uniform sampler2D uTextureMat;
uniform sampler2D uTextureNum;
uniform float     ucolorWeight;
uniform float     uNumWeight;

out vec4 outColor;

void main() {
    vec3 tex1 = texture(uTextureMat, vUV).rgb;
    vec4 tex2 = texture(uTextureNum, vec2(vUV.x, 1.0 - vUV.y));

    float numberMask = clamp(uNumWeight, 0.0, 1.0) * tex2.a;
    vec3  resTex     = mix(tex1, tex2.rgb, numberMask);
    vec3  resColor   = uColor * resTex;
    vec3  finalColor = mix(resTex, resColor, clamp(ucolorWeight, 0.0, 1.0));

    outColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  ШЕЙДЕРЫ — Модели (простая UV-текстура)
// ═══════════════════════════════════════════════════════════════════════════════

const vsModel = `#version 300 es
in vec3 aPosition;
in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

out vec2 vUV;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vUV = aUV;
}
`;

const fsModel = `#version 300 es
precision mediump float;

in vec2 vUV;

uniform sampler2D uTexture;

out vec4 outColor;

void main() {
    // OBJ UV: Y=0 снизу; Image загружается с Y=0 сверху → флипаем V
    outColor = texture(uTexture, vec2(vUV.x, 1.0 - vUV.y));
}
`;

const progCube  = createProgram(gl, vsCube,  fsCube);
const progModel = createProgram(gl, vsModel, fsModel);

// ═══════════════════════════════════════════════════════════════════════════════
//  ГЕОМЕТРИЯ КУБА — 24 вершины (4 на грань × 6 граней), формат pos(3)+uv(2)
// ═══════════════════════════════════════════════════════════════════════════════

// prettier-ignore
const cubeVerts = new Float32Array([
    // Передняя грань  (z = +0.5)
    -0.5, -0.5,  0.5,   0.0, 0.0,
     0.5, -0.5,  0.5,   1.0, 0.0,
     0.5,  0.5,  0.5,   1.0, 1.0,
    -0.5,  0.5,  0.5,   0.0, 1.0,
    // Задняя грань    (z = -0.5)
     0.5, -0.5, -0.5,   0.0, 0.0,
    -0.5, -0.5, -0.5,   1.0, 0.0,
    -0.5,  0.5, -0.5,   1.0, 1.0,
     0.5,  0.5, -0.5,   0.0, 1.0,
    // Левая грань     (x = -0.5)
    -0.5, -0.5, -0.5,   0.0, 0.0,
    -0.5, -0.5,  0.5,   1.0, 0.0,
    -0.5,  0.5,  0.5,   1.0, 1.0,
    -0.5,  0.5, -0.5,   0.0, 1.0,
    // Правая грань    (x = +0.5)
     0.5, -0.5,  0.5,   0.0, 0.0,
     0.5, -0.5, -0.5,   1.0, 0.0,
     0.5,  0.5, -0.5,   1.0, 1.0,
     0.5,  0.5,  0.5,   0.0, 1.0,
    // Верхняя грань   (y = +0.5)
    -0.5,  0.5,  0.5,   0.0, 0.0,
     0.5,  0.5,  0.5,   1.0, 0.0,
     0.5,  0.5, -0.5,   1.0, 1.0,
    -0.5,  0.5, -0.5,   0.0, 1.0,
    // Нижняя грань    (y = -0.5)
    -0.5, -0.5, -0.5,   0.0, 0.0,
     0.5, -0.5, -0.5,   1.0, 0.0,
     0.5, -0.5,  0.5,   1.0, 1.0,
    -0.5, -0.5,  0.5,   0.0, 1.0,
]);

// prettier-ignore
const cubeIndices = new Uint16Array([
     0,  1,  2,   0,  2,  3,
     4,  5,  6,   4,  6,  7,
     8,  9, 10,   8, 10, 11,
    12, 13, 14,  12, 14, 15,
    16, 17, 18,  16, 18, 19,
    20, 21, 22,  20, 22, 23,
]);

// ── VAO куба ──────────────────────────────────────────────────────────────────

const CUBE_STRIDE = 5 * 4; // pos(3) + uv(2) = 5 floats × 4 байта

const cubeVao = gl.createVertexArray();
gl.bindVertexArray(cubeVao);

const cubeVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
gl.bufferData(gl.ARRAY_BUFFER, cubeVerts, gl.STATIC_DRAW);

const cubeIbo = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIndices, gl.STATIC_DRAW);

{
    const posLoc = gl.getAttribLocation(progCube, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, CUBE_STRIDE, 0);

    const uvLoc = gl.getAttribLocation(progCube, 'aUV');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, CUBE_STRIDE, 3 * 4);
}

gl.bindVertexArray(null);

// ═══════════════════════════════════════════════════════════════════════════════
//  UNIFORM-ЛОКАЦИИ
// ═══════════════════════════════════════════════════════════════════════════════

const uCube = {
    model:       gl.getUniformLocation(progCube, 'uModel'),
    view:        gl.getUniformLocation(progCube, 'uView'),
    projection:  gl.getUniformLocation(progCube, 'uProjection'),
    color:       gl.getUniformLocation(progCube, 'uColor'),
    colorWeight: gl.getUniformLocation(progCube, 'ucolorWeight'),
    numWeight:   gl.getUniformLocation(progCube, 'uNumWeight'),
    texMat:      gl.getUniformLocation(progCube, 'uTextureMat'),
    texNum:      gl.getUniformLocation(progCube, 'uTextureNum'),
};

const uMdl = {
    model:      gl.getUniformLocation(progModel, 'uModel'),
    view:       gl.getUniformLocation(progModel, 'uView'),
    projection: gl.getUniformLocation(progModel, 'uProjection'),
    texture:    gl.getUniformLocation(progModel, 'uTexture'),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ОПИСАНИЕ ОБЪЕКТОВ
// ═══════════════════════════════════════════════════════════════════════════════

const RED   = [1, 0, 0];
const GREEN = [0, 1, 0];
const BLUE  = [0, 0, 1];


const cubes = [
    { tx: -1.5, tz: 0.0, sx: 1.0, sy: 0.7, sz: 1.0, color: GREEN },
    { tx:  0.0, tz: 0.0, sx: 1.0, sy: 1.5, sz: 1.0, color: RED   },
    { tx:  1.5, tz: 0.0, sx: 1.0, sy: 1.0, sz: 1.0, color: BLUE  },
];

const truckS = 0.25;
const gokuS = 1.5;
const SugarcubeS = 0.01;
const modelDefs = [
    { objUrl: './models/DumpTruck.obj',        texUrl: './models/DumpTruckDiffuseBake.png',
      tx: -1.5, ty:1, tz: 0.2,  sx: truckS, sy: truckS, sz: truckS },
    { objUrl: './models/goku.obj',             texUrl: './models/goku.jpg',
      tx:  0.0, ty:1.8, tz: 0,  sx: gokuS,   sy: gokuS,   sz: gokuS   },
    { objUrl: './models/Sugarcube_Corner.obj', texUrl: './models/Sugarcube_Corner_BaseColor.png',
      tx:  1.5, ty:1, tz: 0,  sx: SugarcubeS,   sy: SugarcubeS,   sz: SugarcubeS   },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  МАТРИЦЫ
// ═══════════════════════════════════════════════════════════════════════════════

const view  = mat4.create();
const proj  = mat4.create();
const model = mat4.create();

mat4.lookAt(view, [0, 5, 5], [0, 0, 0], [0, 1, 0]);

// ═══════════════════════════════════════════════════════════════════════════════
//  УПРАВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════════════════════

let colorWeight = 0.0;  // R — +,  F — −
let numWeight   = 1.0;  // T — +,  G — −

const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true;  });
window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

// ═══════════════════════════════════════════════════════════════════════════════
//  ЗАГРУЗКА РЕСУРСОВ
// ═══════════════════════════════════════════════════════════════════════════════

let cubeTextures = null;  // [{ mat, num }, ...]
let meshObjects  = null;  // [{ vao, indexCount, tex }, ...]


/**
 * Создаёт VAO для OBJ-меша.
 * Формат parseOBJ: pos(3) + normal(3) + uv(2) = stride 32 байта.
 * Шейдер progModel использует aPosition (offset 0) и aUV (offset 24).
 */
function makeMeshVao(mesh) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(progModel, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, mesh.stride, mesh.offsets.position);

    const uvLoc = gl.getAttribLocation(progModel, 'aUV');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, mesh.stride, mesh.offsets.uv);

    gl.bindVertexArray(null);
    return vao;
}

async function loadAll() {
    // Текстуры кубов
    const [gold, bronze, silver, d1, d2, d3] = await Promise.all([
        loadTexture(gl, './textures/gold/tile.png'),
        loadTexture(gl, './textures/bronze/ground.png'),
        loadTexture(gl, './textures/silver/ice.png'),
        loadTexture(gl, './textures/digits/digits1.png'),
        loadTexture(gl, './textures/digits/digits2.png'),
        loadTexture(gl, './textures/digits/digits3.png'),
    ]);
    cubeTextures = [
        { mat: silver, num: d2 },
        { mat: gold,   num: d1 },
        { mat: bronze, num: d3 },
    ];

    // OBJ-модели и их текстуры
    const loaded = await Promise.all(
        modelDefs.map(async def => {
            const [mesh, tex] = await Promise.all([
                loadOBJ(def.objUrl),
                loadTexture(gl, def.texUrl),
            ]);
            return { vao: makeMeshVao(mesh), indexCount: mesh.indices.length, tex};
        })
    );
    meshObjects = loaded;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  НАЧАЛЬНЫЕ НАСТРОЙКИ GL
// ═══════════════════════════════════════════════════════════════════════════════

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.08, 0.08, 0.12, 1.0);

// ═══════════════════════════════════════════════════════════════════════════════
//  РЕНДЕР-ЦИКЛ
// ═══════════════════════════════════════════════════════════════════════════════

const infoEl = document.getElementById('info');
var r = 0;

function loop() {
    r += 0.005;

    // Обновление весов
    const step = 0.02;
    if (keys['r']) colorWeight = Math.min(1.0, colorWeight + step);
    if (keys['f']) colorWeight = Math.max(0.0, colorWeight - step);
    if (keys['u']) numWeight   = Math.min(1.0, numWeight   + step);
    if (keys['j']) numWeight   = Math.max(0.0, numWeight   - step);

    if (infoEl) {
        infoEl.textContent =
            `Цвет (R/F): ${colorWeight.toFixed(2)}   Цифры (J/U): ${numWeight.toFixed(2)}`;
    }

    if (resizeCanvas(canvas)) gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 100);

    // ── Кубы ──────────────────────────────────────────────────────────────────
    gl.useProgram(progCube);
    gl.bindVertexArray(cubeVao);

    gl.uniformMatrix4fv(uCube.view,       false, view);
    gl.uniformMatrix4fv(uCube.projection, false, proj);
    gl.uniform1f(uCube.colorWeight, colorWeight);
    gl.uniform1f(uCube.numWeight,   numWeight);
    gl.uniform1i(uCube.texMat, 0);
    gl.uniform1i(uCube.texNum, 1);

    for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i];

        mat4.identity(model);
        mat4.translate(model, model, [c.tx, c.sy * 0.5, c.tz]);
        mat4.scale(model, model, [c.sx, c.sy, c.sz]);
        mat4.rotate(model, model, r, [0, 1, 0]);

        gl.uniformMatrix4fv(uCube.model, false, model);
        gl.uniform3fv(uCube.color, c.color);

        if (cubeTextures) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, cubeTextures[i].mat);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, cubeTextures[i].num);
        }

        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    }

    // ── OBJ-модели ────────────────────────────────────────────────────────────
    if (meshObjects) {
        gl.useProgram(progModel);
        gl.uniformMatrix4fv(uMdl.view,       false, view);
        gl.uniformMatrix4fv(uMdl.projection, false, proj);
        gl.uniform1i(uMdl.texture, 0);

        for (let i = 0; i < meshObjects.length; i++) {
            const obj = meshObjects[i];
            const def = modelDefs[i];


            mat4.identity(model);
            mat4.translate(model, model, [def.tx, def.ty, def.tz]); // 3. мировая позиция
            mat4.rotate(model, model, r, [0, 1, 0]);                 //    вращение вокруг Y
            mat4.scale(model, model, [def.sx, def.sy, def.sz]);      // 2. масштаб

            gl.uniformMatrix4fv(uMdl.model, false, model);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, obj.tex);

            gl.bindVertexArray(obj.vao);
            gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_INT, 0);
        }
    }

    requestAnimationFrame(loop);
}

loadAll().then(loop);
