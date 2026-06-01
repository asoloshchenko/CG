import { loadOBJ }                                           from '@utils/parse';
import { initGL, createProgram, resizeCanvas, loadTexture } from '@utils/webgl';
import { mat4, vec3 }                                        from 'gl-matrix';

// ═══════════════════════════════════════════════════════════════════════════════
//  ОБЩИЙ ВЕРШИННЫЙ ШЕЙДЕР (одинаков для обоих режимов)
// ═══════════════════════════════════════════════════════════════════════════════

const VS = /* glsl */`#version 300 es
in vec3 a_pos;
in vec3 a_normal;
in vec2 a_uv;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

out vec3 v_normal;
out vec3 v_posEye;
out vec2 v_uv;

void main() {
    v_uv = a_uv;
    mat3 uNMatrix = transpose(inverse(mat3(u_model)));

    vec4 posEye4 = u_view * u_model * vec4(a_pos, 1.0);
    v_posEye = posEye4.xyz / posEye4.w;
    v_normal = normalize(uNMatrix * a_normal);

    gl_Position = u_proj * posEye4;
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  ФРАГМЕНТНЫЙ ШЕЙДЕР — Bump mapping (карта высот)
// ═══════════════════════════════════════════════════════════════════════════════

const BUMP_FS = /* glsl */`#version 300 es
precision mediump float;          // точность вещественных чисел (баланс скорость/качество)

in vec3 v_normal;                 // интерполированная нормаль из вершинного шейдера
in vec3 v_posEye;                 // позиция фрагмента в eye space
in vec2 v_uv;                     // текстурные координаты

uniform vec3      u_lightPosEye;  // позиция источника света в eye space (считается на CPU)
uniform sampler2D u_bumpMap;      // карта высот: яркость = высота точки поверхности
uniform float     u_bumpStrength; // сила эффекта: 0 = плоско, больше = резче рельеф

out vec4 fragColor;               // итоговый цвет пикселя

const float shininess  = 32.0;                    // степень зеркального блика: больше = острее
const vec3  ambColor   = vec3(0.25, 0.28, 0.35);  // цвет фонового освещения (холодный, имитация неба)
const vec3  lightColor = vec3(1.0,  0.92, 0.75);  // цвет источника света (тёплый)
const vec3  objColor   = vec3(1.0,  0.5,  0.0);   // базовый цвет объекта (оранжевый)
const float texStep    = 1.0 / 1024.0;            // шаг сэмплирования: один пиксель текстуры 1024px

// Коэффициенты затухания: чем дальше от источника, тем слабее свет
const float att_const  = 1.0;   // константная часть — свет всегда минимально присутствует
const float att_linear = 0.045; // линейная часть — убывание пропорционально расстоянию
const float att_quad   = 0.016; // квадратичная часть — убывание ускоряется на больших дистанциях

void main() {
    // Как меняется позиция в eye space при сдвиге на один пиксель вправо/вниз по экрану
    vec3 dPdx  = dFdx(v_posEye);
    vec3 dPdy  = dFdy(v_posEye);
    // Как меняются UV координаты при тех же пиксельных сдвигах
    vec2 dUVdx = dFdx(v_uv);
    vec2 dUVdy = dFdy(v_uv);

    // Tangent (T) — 3D-направление вдоль оси U текстуры, вычислен из пары (позиция ↔ UV)
    vec3 T = normalize( dUVdy.y * dPdx - dUVdx.y * dPdy);
    // Bitangent (B) — 3D-направление вдоль оси V текстуры, перпендикулярен T
    vec3 B = normalize(-dUVdy.x * dPdx + dUVdx.x * dPdy);

    // Высота поверхности в текущей точке (красный канал = яркость = высота)
    float h0 = texture(u_bumpMap, v_uv).r;
    // Высота соседней точки по оси U (шаг вправо)
    float hU = texture(u_bumpMap, v_uv + vec2(texStep, 0.0)).r;
    // Высота соседней точки по оси V (шаг вниз)
    float hV = texture(u_bumpMap, v_uv + vec2(0.0, texStep)).r;

    // Возмущаем геометрическую нормаль:
    // (h0 - hU) > 0 → справа ниже → нормаль наклоняется влево (в сторону -T)
    // (h0 - hV) > 0 → снизу ниже  → нормаль наклоняется вверх (в сторону -B)
    vec3 N = normalize(v_normal
        + T * (h0 - hU) * u_bumpStrength
        + B * (h0 - hV) * u_bumpStrength);

    vec3  toLight = u_lightPosEye - v_posEye;       // вектор от фрагмента к источнику
    float dist    = length(toLight);                 // расстояние до источника
    // Формула Огре: затухание = 1 / (const + linear·d + quad·d²)
    float atten   = 1.0 / (att_const + att_linear * dist + att_quad * dist * dist);

    vec3 L = normalize(toLight);              // единичный вектор к источнику
    vec3 V = -normalize(v_posEye);            // вектор к камере (камера в начале eye space)
    vec3 R = reflect(-L, N);                  // отражение L относительно нормали

    // Диффузная составляющая: максимум при нормали прямо на свет, 0 при угле ≥ 90°
    float diff = max(dot(N, L), 0.0);
    // Зеркальная составляющая: степень сужает блик; clamp убирает отрицательные значения
    float spec = pow(max(dot(R, V), 0.0), shininess);

    vec3 color = ambColor            * objColor        // фон: постоянный, не зависит от света
               + atten * diff * lightColor * objColor  // диффуз: рассеянный свет по поверхности
               + atten * spec * lightColor;            // блик: зеркальное отражение источника

    fragColor = vec4(color, 1.0);  // alpha = 1.0 (непрозрачный)
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  ФРАГМЕНТНЫЙ ШЕЙДЕР — Normal mapping (готовая карта нормалей + диффузная текстура)
// ═══════════════════════════════════════════════════════════════════════════════

const NORM_FS = /* glsl */`#version 300 es
precision mediump float;           // точность вещественных чисел

in vec3 v_normal;                  // интерполированная геометрическая нормаль
in vec3 v_posEye;                  // позиция фрагмента в eye space
in vec2 v_uv;                      // текстурные координаты

uniform vec3      u_lightPosEye;   // позиция источника света в eye space
uniform sampler2D u_normMap;       // карта нормалей: RGB = XYZ нормали в tangent space
uniform sampler2D u_diffuse;       // диффузная текстура: цвет поверхности
uniform float     u_normStrength;  // сила эффекта: 0 = плоско, 1 = как в карте, >1 = усилено

out vec4 fragColor;                // итоговый цвет пикселя

const float shininess  = 32.0;                    // острота зеркального блика
const vec3  ambColor   = vec3(0.25, 0.28, 0.35);  // холодный фоновый свет
const vec3  lightColor = vec3(1.0,  0.92, 0.75);  // тёплый цвет источника

const float att_const  = 1.0;    // константа затухания
const float att_linear = 0.045;  // линейный коэффициент затухания
const float att_quad   = 0.016;  // квадратичный коэффициент затухания

void main() {
    // Производные позиции по пикселям экрана — направления касательной плоскости
    vec3 dPdx  = dFdx(v_posEye);
    vec3 dPdy  = dFdy(v_posEye);
    // Производные UV — как меняются координаты текстуры при пиксельном сдвиге
    vec2 dUVdx = dFdx(v_uv);
    vec2 dUVdy = dFdy(v_uv);

    // T — касательный вектор вдоль оси U текстуры в eye space
    vec3 T = normalize( dUVdy.y * dPdx - dUVdx.y * dPdy);
    // B — касательный вектор вдоль оси V текстуры в eye space
    vec3 B = normalize(-dUVdy.x * dPdx + dUVdx.x * dPdy);
    // TBN — матрица перевода из tangent space в eye space
    mat3 TBN = mat3(T, B, normalize(v_normal));

    // Читаем нормаль из карты и переводим из [0,1] в [-1,1]
    // RGB(128,128,255) → (0,0,1) — нормаль смотрит прямо, поверхность плоская
    vec3 tangentN = texture(u_normMap, v_uv).rgb * 2.0 - 1.0;
    // Масштабируем XY: при 0 нормаль (0,0,1) — полностью плоская; при >1 — рельеф усилен
    tangentN.xy *= u_normStrength;
    // Переводим нормаль из tangent space в eye space через матрицу TBN
    vec3 N = normalize(TBN * normalize(tangentN));

    // Цвет пикселя берём из диффузной текстуры, а не из константы
    vec3 objColor = texture(u_diffuse, v_uv).rgb;

    vec3  toLight = u_lightPosEye - v_posEye;       // вектор от фрагмента к источнику
    float dist    = length(toLight);                 // расстояние до источника света
    float atten   = 1.0 / (att_const + att_linear * dist + att_quad * dist * dist); // затухание

    vec3 L = normalize(toLight);       // единичный вектор к источнику
    vec3 V = -normalize(v_posEye);     // вектор к камере (origin в eye space)
    vec3 R = reflect(-L, N);           // зеркальное отражение вектора к источнику

    // Диффузная составляющая: угол между нормалью и источником
    float diff = max(dot(N, L), 0.0);
    // Зеркальная составляющая: угол между отражением и камерой
    float spec = pow(max(dot(R, V), 0.0), shininess);

    vec3 color = ambColor                  * objColor  // фон: не зависит от источника
               + atten * diff * lightColor * objColor  // диффуз: рассеянный свет
               + atten * spec * lightColor;            // блик: зеркальное отражение

    fragColor = vec4(color, 1.0);  // alpha = 1.0, пиксель непрозрачный
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById("glcanvas");
const gl     = initGL(canvas, 'webgl2');

const progBump = createProgram(gl, VS, BUMP_FS);
const progNorm = createProgram(gl, VS, NORM_FS);

// Uniform-локации для каждой программы
const uBump = {
    model:        gl.getUniformLocation(progBump, 'u_model'),
    view:         gl.getUniformLocation(progBump, 'u_view'),
    proj:         gl.getUniformLocation(progBump, 'u_proj'),
    lightPosEye:  gl.getUniformLocation(progBump, 'u_lightPosEye'),
    bumpMap:      gl.getUniformLocation(progBump, 'u_bumpMap'),
    bumpStrength: gl.getUniformLocation(progBump, 'u_bumpStrength'),
};

const uNorm = {
    model:       gl.getUniformLocation(progNorm, 'u_model'),
    view:        gl.getUniformLocation(progNorm, 'u_view'),
    proj:        gl.getUniformLocation(progNorm, 'u_proj'),
    lightPosEye: gl.getUniformLocation(progNorm, 'u_lightPosEye'),
    normMap:      gl.getUniformLocation(progNorm, 'u_normMap'),
    diffuse:      gl.getUniformLocation(progNorm, 'u_diffuse'),
    normStrength: gl.getUniformLocation(progNorm, 'u_normStrength'),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VAO — оба шейдера используют один VS, атрибуты одинаковые
// ═══════════════════════════════════════════════════════════════════════════════

function makeMeshVao(prog, mesh) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const posLoc    = gl.getAttribLocation(prog, 'a_pos');
    const normalLoc = gl.getAttribLocation(prog, 'a_normal');
    const uvLoc     = gl.getAttribLocation(prog, 'a_uv');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc,    3, gl.FLOAT, false, mesh.stride, mesh.offsets.position);

    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, mesh.stride, mesh.offsets.normal);

    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc,     2, gl.FLOAT, false, mesh.stride, mesh.offsets.uv);

    gl.bindVertexArray(null);
    return vao;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ЗАГРУЗКА РЕСУРСОВ
// ═══════════════════════════════════════════════════════════════════════════════

const mesh        = await loadOBJ('./models/sphere.obj');
const bumpTex     = await loadTexture(gl, './textures/orange_bump.jpg');
const rockNorm    = await loadTexture(gl, './textures/rock_norm.png');
const rockDiffuse = await loadTexture(gl, './textures/rock_texture.png');

// VAO создаём для каждой программы отдельно — гарантия правильных атрибутов
const bumpVao = makeMeshVao(progBump, mesh);
const normVao = makeMeshVao(progNorm, mesh);
const sphereIndexCount = mesh.indices.length;

// ═══════════════════════════════════════════════════════════════════════════════
//  МАТРИЦЫ И СВЕТ
// ═══════════════════════════════════════════════════════════════════════════════

const view  = mat4.create();
const proj  = mat4.create();
const model = mat4.create();

mat4.lookAt(view, [0, 0, 5], [0, 0, 0], [0, 1, 0]);

const lightPosEye = vec3.transformMat4(vec3.create(), [3, 4, 5], view);

// ═══════════════════════════════════════════════════════════════════════════════
//  СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════════════════════════════

let angle        = 0;
let bumpStrength = 2.0;
let normStrength = 1.0;
let mode         = 'bump';   // 'bump' | 'norm'

window.addEventListener('keydown', e => {
    const step = 0.1;
    if (mode === 'bump') {
        if (e.key === 'ArrowUp')   bumpStrength = Math.min(5, +(bumpStrength + step).toFixed(2));
        if (e.key === 'ArrowDown') bumpStrength = Math.max(0, +(bumpStrength - step).toFixed(2));
    } else {
        if (e.key === 'ArrowUp')   normStrength = Math.min(5, +(normStrength + step).toFixed(2));
        if (e.key === 'ArrowDown') normStrength = Math.max(0, +(normStrength - step).toFixed(2));
    }
    if (e.key === ' ') mode = (mode === 'bump') ? 'norm' : 'bump';
});

// ═══════════════════════════════════════════════════════════════════════════════
//  НАСТРОЙКИ GL
// ═══════════════════════════════════════════════════════════════════════════════

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.08, 0.08, 0.12, 1.0);

// ═══════════════════════════════════════════════════════════════════════════════
//  РЕНДЕР-ЦИКЛ
// ═══════════════════════════════════════════════════════════════════════════════

const infoEl = document.getElementById('info');

function loop() {
    angle += 0.01;

    if (resizeCanvas(canvas)) gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 100);
    mat4.identity(model);
    mat4.rotateY(model, model, angle);

    if (infoEl) {
        infoEl.textContent = mode === 'bump'
            ? `Bump mapping   [Пробел — переключить]   Сила (↑↓): ${bumpStrength.toFixed(1)}`
            : `Normal mapping  [Пробел — переключить]   Сила (↑↓): ${normStrength.toFixed(1)}`;
    }

    if (mode === 'bump') {
        gl.useProgram(progBump);
        gl.bindVertexArray(bumpVao);

        gl.uniformMatrix4fv(uBump.model, false, model);
        gl.uniformMatrix4fv(uBump.view,  false, view);
        gl.uniformMatrix4fv(uBump.proj,  false, proj);
        gl.uniform3fv(uBump.lightPosEye, lightPosEye);
        gl.uniform1f(uBump.bumpStrength, bumpStrength);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bumpTex);
        gl.uniform1i(uBump.bumpMap, 0);

    } else {
        gl.useProgram(progNorm);
        gl.bindVertexArray(normVao);

        gl.uniformMatrix4fv(uNorm.model, false, model);
        gl.uniformMatrix4fv(uNorm.view,  false, view);
        gl.uniformMatrix4fv(uNorm.proj,  false, proj);
        gl.uniform3fv(uNorm.lightPosEye, lightPosEye);
        gl.uniform1f(uNorm.normStrength, normStrength);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, rockNorm);
        gl.uniform1i(uNorm.normMap, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, rockDiffuse);
        gl.uniform1i(uNorm.diffuse, 1);
    }

    gl.drawElements(gl.TRIANGLES, sphereIndexCount, gl.UNSIGNED_INT, 0);

    requestAnimationFrame(loop);
}

loop();
