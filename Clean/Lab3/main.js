import { initGL, createProgram, resizeCanvas, makeVaoFromMesh } from '@utils/webgl';
import { loadOBJ } from '@utils/parse';
import { mat4, mat3, vec3 } from 'gl-matrix';

// ── Шейдер Ламберта (для сравнения) ──────────────────────────────────────────

const VERT = /* glsl */`#version 300 es
in vec3 a_pos;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

out vec3 v_normal;
out vec3 v_worldPos;

void main() {
    vec4 worldPos     = u_model * vec4(a_pos, 1.0);
    v_worldPos        = worldPos.xyz;
    mat3 normalMatrix = transpose(inverse(mat3(u_model)));
    v_normal          = normalize(normalMatrix * a_normal);
    gl_Position       = u_proj * u_view * worldPos;
}
`;

const FRAG = /* glsl */`#version 300 es
precision mediump float;

in vec3 v_normal;
in vec3 v_worldPos;

uniform vec3 u_lightPos;
uniform vec3 u_color;

out vec4 fragColor;

void main() {
    vec3 L        = normalize(u_lightPos - v_worldPos);
    float lambert = max(dot(v_normal, L), 0.0);
    vec3 color    = u_color * (0.25 + 0.75 * lambert);
    fragColor     = vec4(color, 1.0);
}
`;

// ── Шейдер Гуро (освещение считается в вершинном шейдере) ────────────────────

const GURO_VS = /* glsl */`#version 300 es
in vec3 a_pos;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

uniform vec3  u_lightPos;
uniform vec3  u_ambientLightColor;
uniform vec3  u_diffuseLightColor;
uniform vec3  u_specularLightColor;
uniform float u_attLinear;
uniform float u_attQuadratic;
uniform bool  u_lambertOnly;

out vec3 vLightWeighting;

const float shininess = 16.0;

void main() {
    mat3 uNMatrix = transpose(inverse(mat3(u_model)));

    vec4 vertexPositionEye4 = u_view * u_model * vec4(a_pos, 1.0);
    vec3 vertexPositionEye3 = vertexPositionEye4.xyz / vertexPositionEye4.w;

    vec3 lightPosEye    = (u_view * vec4(u_lightPos, 1.0)).xyz;
    vec3 lightDirection = normalize(lightPosEye - vertexPositionEye3);
    vec3 normal         = normalize(uNMatrix * a_normal);

    float diffuseLightDot = max(dot(normal, lightDirection), 0.0);

    float dist        = length(lightPosEye - vertexPositionEye3);
    float attenuation = 1.0 / (1.0 + u_attLinear * dist + u_attQuadratic * dist * dist);

    float specularLightParam = 0.0;
    if (!u_lambertOnly) {
        vec3  reflectionVector = normalize(reflect(-lightDirection, normal));
        vec3  viewVectorEye    = -normalize(vertexPositionEye3);
        float specularLightDot = max(dot(reflectionVector, viewVectorEye), 0.0);
        specularLightParam     = pow(specularLightDot, shininess);
    }

    vLightWeighting = u_ambientLightColor
                    + (u_diffuseLightColor  * diffuseLightDot
                    +  u_specularLightColor * specularLightParam) * attenuation;

    gl_Position = u_proj * vertexPositionEye4;
}
`;

const GURO_FS = /* glsl */`#version 300 es
precision mediump float;

in vec3 vLightWeighting;

uniform vec3 u_color;

out vec4 fragColor;

void main() {
    fragColor = vec4(vLightWeighting * u_color, 1.0);
}
`;

const PHONG_VS = /* glsl */`#version 300 es
in vec3 a_pos;
in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;

out vec3 v_normal;
out vec3 v_posEye;

void main() {
    mat3 uNMatrix = transpose(inverse(mat3(u_model)));

    // позиция вершины в eye space — передаём во фрагментный
    vec4 vertexPositionEye4 = u_view * u_model * vec4(a_pos, 1.0);
    v_posEye = vertexPositionEye4.xyz / vertexPositionEye4.w;

    // нормаль — передаём во фрагментный
    v_normal = normalize(uNMatrix * a_normal);

    gl_Position = u_proj * vertexPositionEye4;
}
`;

const PHONG_FS = /* glsl */`#version 300 es
precision mediump float;

in vec3 v_normal;
in vec3 v_posEye;

uniform vec3  u_lightPosEye;
uniform vec3  u_ambientLightColor;
uniform vec3  u_diffuseLightColor;
uniform vec3  u_specularLightColor;
uniform vec3  u_color;
uniform float u_attLinear;
uniform float u_attQuadratic;
uniform bool  u_lambertOnly;

out vec4 fragColor;

const float shininess = 16.0;

void main() {
    vec3  lightDirection  = normalize(u_lightPosEye - v_posEye);
    vec3  normal          = normalize(v_normal);
    float diffuseLightDot = max(dot(normal, lightDirection), 0.0);

    float dist        = length(u_lightPosEye - v_posEye);
    float attenuation = 1.0 / (1.0 + u_attLinear * dist + u_attQuadratic * dist * dist);

    float specularLightParam = 0.0;
    if (!u_lambertOnly) {
        vec3  reflectionVector = normalize(reflect(-lightDirection, normal));
        vec3  viewVectorEye    = -normalize(v_posEye);
        float specularLightDot = max(dot(reflectionVector, viewVectorEye), 0.0);
        specularLightParam     = pow(specularLightDot, shininess);
    }

    vec3 lightWeighting = u_ambientLightColor
                        + (u_diffuseLightColor  * diffuseLightDot
                        +  u_specularLightColor * specularLightParam) * attenuation;

    fragColor = vec4(lightWeighting * u_color, 1.0);
}
`;

// ── Инициализация ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('c');
const gl     = initGL(canvas, 'webgl2');

const prog  = createProgram(gl, VERT,    FRAG);
const progGuro = createProgram(gl, GURO_VS, GURO_FS);
const progPhong = createProgram(gl, PHONG_VS, PHONG_FS);

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

// ── Uniform-локации ───────────────────────────────────────────────────────────

const u = {
    model:    gl.getUniformLocation(prog, 'u_model'),
    view:     gl.getUniformLocation(prog, 'u_view'),
    proj:     gl.getUniformLocation(prog, 'u_proj'),
    lightPos: gl.getUniformLocation(prog, 'u_lightPos'),
    color:    gl.getUniformLocation(prog, 'u_color'),
};

const uGuro = {
    model:              gl.getUniformLocation(progGuro, 'u_model'),
    view:               gl.getUniformLocation(progGuro, 'u_view'),
    proj:               gl.getUniformLocation(progGuro, 'u_proj'),
    lightPos:           gl.getUniformLocation(progGuro, 'u_lightPos'),
    color:              gl.getUniformLocation(progGuro, 'u_color'),
    ambientLightColor:  gl.getUniformLocation(progGuro, 'u_ambientLightColor'),
    diffuseLightColor:  gl.getUniformLocation(progGuro, 'u_diffuseLightColor'),
    specularLightColor: gl.getUniformLocation(progGuro, 'u_specularLightColor'),
    attLinear:          gl.getUniformLocation(progGuro, 'u_attLinear'),
    attQuadratic:       gl.getUniformLocation(progGuro, 'u_attQuadratic'),
    lambertOnly:        gl.getUniformLocation(progGuro, 'u_lambertOnly'),
};
const uPhong = {
    model:              gl.getUniformLocation(progPhong, 'u_model'),
    view:               gl.getUniformLocation(progPhong, 'u_view'),
    proj:               gl.getUniformLocation(progPhong, 'u_proj'),
    lightPosEye:        gl.getUniformLocation(progPhong, 'u_lightPosEye'),
    color:              gl.getUniformLocation(progPhong, 'u_color'),
    ambientLightColor:  gl.getUniformLocation(progPhong, 'u_ambientLightColor'),
    diffuseLightColor:  gl.getUniformLocation(progPhong, 'u_diffuseLightColor'),
    specularLightColor: gl.getUniformLocation(progPhong, 'u_specularLightColor'),
    attLinear:          gl.getUniformLocation(progPhong, 'u_attLinear'),
    attQuadratic:       gl.getUniformLocation(progPhong, 'u_attQuadratic'),
    lambertOnly:        gl.getUniformLocation(progPhong, 'u_lambertOnly'),
};

// ── Загрузка моделей ──────────────────────────────────────────────────────────

let models = [
    await loadOBJ('./models/alien.obj'),
    await loadOBJ('./models/snowman_smooth.obj'),
    await loadOBJ('./models/hamb.obj'),
];

for (let i = 0; i < models.length; i++) {
    models[i].vao = makeVaoFromMesh(gl, progPhong, models[i]);
}

// ── UI ────────────────────────────────────────────────────────────────────────

const state = {
    usePhong:     true,
    lambertOnly:  false,
    ambient:      0.2,
    attLinear:    0.09,
    attQuadratic: 0.032,
};

document.getElementById('btn-phong').addEventListener('click', () => {
    state.usePhong = true;
    document.getElementById('btn-phong').classList.add('active');
    document.getElementById('btn-guro').classList.remove('active');
});

document.getElementById('btn-guro').addEventListener('click', () => {
    state.usePhong = false;
    document.getElementById('btn-guro').classList.add('active');
    document.getElementById('btn-phong').classList.remove('active');
});

document.getElementById('btn-light-phong').addEventListener('click', () => {
    state.lambertOnly = false;
    document.getElementById('btn-light-phong').classList.add('active');
    document.getElementById('btn-light-lambert').classList.remove('active');
});

document.getElementById('btn-light-lambert').addEventListener('click', () => {
    state.lambertOnly = true;
    document.getElementById('btn-light-lambert').classList.add('active');
    document.getElementById('btn-light-phong').classList.remove('active');
});

document.getElementById('sl-ambient').addEventListener('input', (e) => {
    state.ambient = parseFloat(e.target.value);
    document.getElementById('val-ambient').textContent = state.ambient.toFixed(2);
});

document.getElementById('sl-atten-lin').addEventListener('input', (e) => {
    state.attLinear = parseFloat(e.target.value);
    document.getElementById('val-atten-lin').textContent = state.attLinear.toFixed(3);
});

document.getElementById('sl-atten-quad').addEventListener('input', (e) => {
    state.attQuadratic = parseFloat(e.target.value);
    document.getElementById('val-atten-quad').textContent = state.attQuadratic.toFixed(3);
});

// ── Матрицы сцены ─────────────────────────────────────────────────────────────

const POSITIONS = [[-2.5, 0, 0], [0.0, -1, 0], [2.5, 0, 0]];
const SCALE     = [1, 1, 0.7];

var rotate = {
    x: 0,
    y: 0,
    z: 0
};

const view  = mat4.create();
const proj  = mat4.create();
const model = mat4.create();

mat4.lookAt(view, [0, 2, 7], [0, 0, 0], [0, 1, 0]);

// ── Рендер-цикл ───────────────────────────────────────────────────────────────

function render() {
    rotate.x += 0.005;
    rotate.y += 0.005;
    rotate.z += 0.005;

    resizeCanvas(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.07, 0.07, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 100);

    const LIGHT_POS   = [3, 5, 5];
    const lightPosEye = vec3.transformMat4(vec3.create(), LIGHT_POS, view);
    const a           = state.ambient;

    if (state.usePhong) {
        gl.useProgram(progPhong);
        gl.uniformMatrix4fv(uPhong.view, false, view);
        gl.uniformMatrix4fv(uPhong.proj, false, proj);
        gl.uniform3fv(uPhong.lightPosEye,           lightPosEye);
        gl.uniform3f(uPhong.color,               0.95, 0.97, 1.0);
        gl.uniform3f(uPhong.ambientLightColor,   a,    a,    a);
        gl.uniform3f(uPhong.diffuseLightColor,   0.8,  0.8,  0.8);
        gl.uniform3f(uPhong.specularLightColor,  1.0,  1.0,  1.0);
        gl.uniform1f(uPhong.attLinear,           state.attLinear);
        gl.uniform1f(uPhong.attQuadratic,        state.attQuadratic);
        gl.uniform1i(uPhong.lambertOnly,         state.lambertOnly ? 1 : 0);
    } else {
        gl.useProgram(progGuro);
        gl.uniformMatrix4fv(uGuro.view, false, view);
        gl.uniformMatrix4fv(uGuro.proj, false, proj);
        gl.uniform3f(uGuro.lightPos,             ...LIGHT_POS);
        gl.uniform3f(uGuro.color,                0.95, 0.97, 1.0);
        gl.uniform3f(uGuro.ambientLightColor,    a,    a,    a);
        gl.uniform3f(uGuro.diffuseLightColor,    0.8,  0.8,  0.8);
        gl.uniform3f(uGuro.specularLightColor,   1.0,  1.0,  1.0);
        gl.uniform1f(uGuro.attLinear,            state.attLinear);
        gl.uniform1f(uGuro.attQuadratic,         state.attQuadratic);
        gl.uniform1i(uGuro.lambertOnly,          state.lambertOnly ? 1 : 0);
    }

    const uCur = state.usePhong ? uPhong : uGuro;

    for (let i = 0; i < models.length; i++) {
        mat4.identity(model);
        mat4.translate(model, model, POSITIONS[i]);
        mat4.scale(model,    model, [SCALE[i], SCALE[i], SCALE[i]]);
        mat4.rotateX(model,  model, rotate.x);
        mat4.rotateY(model,  model, rotate.y);
        mat4.rotateZ(model,  model, rotate.z);

        gl.uniformMatrix4fv(uCur.model, false, model);
        gl.bindVertexArray(models[i].vao);
        gl.drawElements(gl.TRIANGLES, models[i].indices.length, gl.UNSIGNED_INT, 0);
    }

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
