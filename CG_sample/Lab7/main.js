import { mat4 } from "gl-matrix";

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    alert("WebGL2 not supported");
}

let sceneFbo = null;
let sceneColorTex = null;
let sceneDepthTex = null;

const bloomCheckbox = document.getElementById("toggleBloom");
let bloomEnabled = bloomCheckbox ? bloomCheckbox.checked : false;
const vignetteCheckbox = document.getElementById("toggleVignette");
let vignetteEnabled = vignetteCheckbox ? vignetteCheckbox.checked : false;
const grainCheckbox = document.getElementById("toggleGrain");
let grainEnabled = grainCheckbox ? grainCheckbox.checked : false;
const gradingCheckbox = document.getElementById("toggleGrading");
let gradingEnabled = gradingCheckbox ? gradingCheckbox.checked : false;

if (bloomCheckbox) {
    bloomCheckbox.addEventListener("change", (event) => {
        bloomEnabled = event.target.checked;
    });
}

if (vignetteCheckbox) {
    vignetteCheckbox.addEventListener("change", (event) => {
        vignetteEnabled = event.target.checked;
    });
}

if (grainCheckbox) {
    grainCheckbox.addEventListener("change", (event) => {
        grainEnabled = event.target.checked;
    });
}

if (gradingCheckbox) {
    gradingCheckbox.addEventListener("change", (event) => {
        gradingEnabled = event.target.checked;
    });
}

function resizeCanvas() {
    canvas.height = window.innerHeight;
    canvas.width = window.innerWidth;
    gl.viewport(0, 0, canvas.width, canvas.height);
    resizeRenderTargets();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let anglex = 0
let angley = 0
let anglez = 0
let scalex = 1
let scaley = 1
let scalez = 1
let tx = 0
let ty = 0
let tz = 0

function viewZToDepth(viewZ, near, far) {
    const a = (far + near) / (near - far);
    const b = (2 * far * near) / (near - far);
    const clipZ = a * viewZ + b;
    const clipW = -viewZ;
    const ndcZ = clipZ / clipW;
    return ndcZ * 0.5 + 0.5;
}

// ШЕЙДЕРЫ
// Кубы
const vsSource = `#version 300 es
in vec3 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat4 uModel;
uniform mat4 uProjection;

void main() {
    gl_Position = uProjection * uModel * vec4(aPosition, 1.0);
    vUV = aUV;
}
`;

const fsSource = `#version 300 es
precision mediump float;

in vec2 vUV;

uniform sampler2D uTextureMat;

out vec4 outColor;

void main() {
    outColor = texture(uTextureMat, vUV);
}
`;

const postVsSource = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

void main() {
    vUV = aUV;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const postFsSource = `#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uSceneTex;
uniform sampler2D uLutIdentity;
uniform sampler2D uLutStyled;
uniform vec2 uTexelSize;
uniform float uBloomStrength;
uniform float uVignetteStrength;
uniform float uGrainStrength;
uniform float uGradingStrength;
uniform float uTime;

out vec4 outColor;

vec3 extractBright(vec2 uv) {
    vec3 c = texture(uSceneTex, uv).rgb;
    float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float mask = smoothstep(0.62, 1.0, luminance);
    return c * mask;
}

float randomNoise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 sampleLutStrip(sampler2D lutTex, vec3 color) {
    vec2 lutSizePx = vec2(textureSize(lutTex, 0));
    float size = lutSizePx.y;
    float maxIndex = max(size - 1.0, 1.0);

    float blueIndex = color.b * maxIndex;
    float z0 = floor(blueIndex);
    float z1 = min(z0 + 1.0, maxIndex);
    float zMix = fract(blueIndex);

    float x0 = (z0 * size + color.r * maxIndex + 0.5) / lutSizePx.x;
    float x1 = (z1 * size + color.r * maxIndex + 0.5) / lutSizePx.x;
    float y = (color.g * maxIndex + 0.5) / lutSizePx.y;

    vec3 c0 = texture(lutTex, vec2(x0, y)).rgb;
    vec3 c1 = texture(lutTex, vec2(x1, y)).rgb;
    return mix(c0, c1, zMix);
}

void main() {
    vec3 base = texture(uSceneTex, vUV).rgb;

    vec2 o1 = uTexelSize * 1.5;
    vec2 o2 = uTexelSize * 3.0;

    vec3 bloom = extractBright(vUV) * 0.24;
    bloom += (extractBright(vUV + vec2(o1.x, 0.0)) + extractBright(vUV - vec2(o1.x, 0.0))) * 0.15;
    bloom += (extractBright(vUV + vec2(0.0, o1.y)) + extractBright(vUV - vec2(0.0, o1.y))) * 0.15;
    bloom += (extractBright(vUV + o2) + extractBright(vUV - o2)) * 0.08;
    bloom += (extractBright(vUV + vec2(-o2.x, o2.y)) + extractBright(vUV + vec2(o2.x, -o2.y))) * 0.08;

    vec3 color = base + bloom * uBloomStrength;

    vec2 centeredUv = vUV * 2.0 - 1.0;
    float dist = length(centeredUv);
    float vignette = 1.0 - smoothstep(0.45, 1.12, dist);
    color *= mix(1.0, vignette, uVignetteStrength);

    vec2 pixel = vUV / uTexelSize;
    float grain = randomNoise(pixel + vec2(uTime * 60.0, uTime * 23.0)) - 0.5;
    color += grain * uGrainStrength;

    vec3 gradedColor = sampleLutStrip(uLutStyled, color);
    color = mix(color, gradedColor, uGradingStrength);

    color = clamp(color, 0.0, 1.0);

    outColor = vec4(color, 1.0);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);

const textureLoc = gl.getUniformLocation(program, "uTextureMat");

const postVertexShader = createShader(gl, gl.VERTEX_SHADER, postVsSource);
const postFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, postFsSource);

const postProgram = gl.createProgram();
gl.attachShader(postProgram, postVertexShader);
gl.attachShader(postProgram, postFragmentShader);
gl.linkProgram(postProgram);

if (!gl.getProgramParameter(postProgram, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(postProgram));
}

const postSceneTexLoc = gl.getUniformLocation(postProgram, "uSceneTex");
const postLutIdentityLoc = gl.getUniformLocation(postProgram, "uLutIdentity");
const postLutStyledLoc = gl.getUniformLocation(postProgram, "uLutStyled");
const postTexelSizeLoc = gl.getUniformLocation(postProgram, "uTexelSize");
const postBloomStrengthLoc = gl.getUniformLocation(postProgram, "uBloomStrength");
const postVignetteStrengthLoc = gl.getUniformLocation(postProgram, "uVignetteStrength");
const postGrainStrengthLoc = gl.getUniformLocation(postProgram, "uGrainStrength");
const postGradingStrengthLoc = gl.getUniformLocation(postProgram, "uGradingStrength");
const postTimeLoc = gl.getUniformLocation(postProgram, "uTime");

const postQuad = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
    -1,  1, 0, 1,
     1, -1, 1, 0,
     1,  1, 1, 1
]);

const postVao = gl.createVertexArray();
gl.bindVertexArray(postVao);

const postVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, postVbo);
gl.bufferData(gl.ARRAY_BUFFER, postQuad, gl.STATIC_DRAW);

const postPosLoc = gl.getAttribLocation(postProgram, "aPosition");
const postUvLoc = gl.getAttribLocation(postProgram, "aUV");

gl.enableVertexAttribArray(postPosLoc);
gl.vertexAttribPointer(postPosLoc, 2, gl.FLOAT, false, 4 * 4, 0);

gl.enableVertexAttribArray(postUvLoc);
gl.vertexAttribPointer(postUvLoc, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

gl.bindVertexArray(null);

function resizeRenderTargets() {
    if (sceneColorTex) {
        gl.deleteTexture(sceneColorTex);
    }
    if (sceneDepthTex) {
        gl.deleteTexture(sceneDepthTex);
    }
    if (sceneFbo) {
        gl.deleteFramebuffer(sceneFbo);
    }

    sceneColorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        canvas.width,
        canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    sceneDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        canvas.width,
        canvas.height,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneColorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepthTex, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Bloom framebuffer is incomplete");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

resizeRenderTargets();

// КУБЫ

const vertices = new Float32Array([
    // Задняя грань
  -0.5,-0.5, 0.5,   1,0,0,   0,0,
   0.5,-0.5, 0.5,   0,1,0,   1,0,
   0.5, 0.5, 0.5,   0,0,1,   1,1,
  -0.5, 0.5, 0.5,   1,1,0,   0,1,

  // Передняя грань
  -0.5,-0.5,-0.5,   1,0,1,   0,0,
   0.5,-0.5,-0.5,   0,1,1,   1,0,
   0.5, 0.5,-0.5,   1,1,1,   1,1,
  -0.5, 0.5,-0.5,   0,0,0,   0,1,

  // Левая грань
  -0.5,-0.5,-0.5,   1,0,0,   0,0,
  -0.5,-0.5, 0.5,   1,0,0,   1,0,
  -0.5, 0.5, 0.5,   1,0,0,   1,1,
  -0.5, 0.5,-0.5,   1,0,0,   0,1,

  // Правая грань
   0.5,-0.5,-0.5,   0,1,0,   0,0,
   0.5,-0.5, 0.5,   0,1,0,   1,0,
   0.5, 0.5, 0.5,   0,1,0,   1,1,
   0.5, 0.5,-0.5,   0,1,0,   0,1,

  // Верхняя грань
  -0.5, 0.5, 0.5,   0,0,1,   0,0,
   0.5, 0.5, 0.5,   0,0,1,   1,0,
   0.5, 0.5,-0.5,   0,0,1,   1,1,
  -0.5, 0.5,-0.5,   0,0,1,   0,1,

  // Нижняя грань
  -0.5,-0.5,-0.5,   1,1,0,   0,0,
   0.5,-0.5,-0.5,   1,1,0,   1,0,
   0.5,-0.5, 0.5,   1,1,0,   1,1,
  -0.5,-0.5, 0.5,   1,1,0,   0,1
]);

const indices = new Uint16Array([
  0,1,2, 0,2,3,
  4,5,6, 4,6,7,
  8,9,10, 8,10,11,
  12,13,14, 12,14,15,
  16,17,18, 16,18,19,
  20,21,22, 20,22,23
]);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const ebo = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

const posLoc = gl.getAttribLocation(program, "aPosition");
const uvLoc = gl.getAttribLocation(program, "aUV");

gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 8 * 4, 0);

gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 8 * 4, 6 * 4);

gl.bindVertexArray(null);

const modelLoc = gl.getUniformLocation(program, "uModel");
const projectionLoc = gl.getUniformLocation(program, "uProjection");

gl.enable(gl.DEPTH_TEST);

// ТЕКСТУРЫ

function loadTexture(src) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    const img = new Image();
    img.src = src;

    img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            img
        );
    };

    return texture;
}

function createGeneratedLutTexture(size, gradingFn) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const width = size * size;
    const height = size;
    const data = new Uint8Array(width * height * 4);

    for (let bz = 0; bz < size; bz++) {
        for (let gy = 0; gy < size; gy++) {
            for (let rx = 0; rx < size; rx++) {
                const srcR = rx / (size - 1);
                const srcG = gy / (size - 1);
                const srcB = bz / (size - 1);

                const graded = gradingFn(srcR, srcG, srcB);
                const outR = Math.min(1, Math.max(0, graded[0]));
                const outG = Math.min(1, Math.max(0, graded[1]));
                const outB = Math.min(1, Math.max(0, graded[2]));

                const x = bz * size + rx;
                const y = gy;
                const i = (y * width + x) * 4;
                data[i + 0] = Math.round(outR * 255);
                data[i + 1] = Math.round(outG * 255);
                data[i + 2] = Math.round(outB * 255);
                data[i + 3] = 255;
            }
        }
    }

    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
    );

    return texture;
}

function createLutTextureFromCubeText(cubeText) {
    const lines = cubeText.split(/\r?\n/);
    let size = 0;
    const colorRows = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const tokens = line.split(/\s+/);
        if (tokens[0] === "TITLE" || tokens[0] === "DOMAIN_MIN" || tokens[0] === "DOMAIN_MAX") {
            continue;
        }

        if (tokens[0] === "LUT_3D_SIZE") {
            size = parseInt(tokens[1], 10);
            continue;
        }

        if (tokens.length >= 3) {
            const r = parseFloat(tokens[0]);
            const g = parseFloat(tokens[1]);
            const b = parseFloat(tokens[2]);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                colorRows.push([r, g, b]);
            }
        }
    }

    if (!size || colorRows.length !== size * size * size) {
        throw new Error(`Invalid cube LUT data: expected ${size * size * size} rows, got ${colorRows.length}`);
    }

    const width = size * size;
    const height = size;
    const data = new Uint8Array(width * height * 4);

    for (let i = 0; i < colorRows.length; i++) {
        const rIndex = Math.floor(i / (size * size));
        const gIndex = Math.floor((i / size) % size);
        const bIndex = i % size;
        const [r, g, b] = colorRows[i];

        const x = bIndex * size + rIndex;
        const y = gIndex;
        const offset = (y * width + x) * 4;

        data[offset + 0] = Math.round(Math.min(1, Math.max(0, r)) * 255);
        data[offset + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
        data[offset + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
        data[offset + 3] = 255;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
    );

    return texture;
}

const textureMat = [];

// Используем материалы из Lab4 (без дублирования файлов)
textureMat.push(loadTexture("../Lab4/textures/gold/tile.png"));
textureMat.push(loadTexture("../Lab4/textures/silver/ice.png"));
textureMat.push(loadTexture("../Lab4/textures/bronze/ground.png"));

const lutSize = 33;
const lutIdentityTex = createGeneratedLutTexture(lutSize, (r, g, b) => [r, g, b]);
let lutStyledTex = createGeneratedLutTexture(lutSize, (r, g, b) => [r, g, b]);
let lutReady = false;

fetch("textures/bw_film.cube")
    .then((response) => response.text())
    .then((cubeText) => {
        lutStyledTex = createLutTextureFromCubeText(cubeText);
        lutReady = true;
    })
    .catch((error) => {
        console.error("Failed to load cube LUT:", error);
        lutReady = false;
    });

const models = [];

async function loadOBJ(url) {
    const resp = await fetch(url);
    const text = await resp.text();
    const lines = text.split('\n');
    
    const positions = [];
    const texcoords = [];
    const vertices = [];
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            positions.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        } else if (line.startsWith('vt ')) {
            const parts = line.split(/\s+/);
            texcoords.push(
                parseFloat(parts[1]),
                1.0 - parseFloat(parts[2])
            );
        } else if (line.startsWith('f ')) {
            const parts = line.split(/\s+/);
            const faceIndices = [];
            for (let i = 1; i < parts.length; i++) {
                const indices = parts[i].split('/');
                const posIdx = parseInt(indices[0]) - 1;
                const texIdx = indices[1] ? parseInt(indices[1]) - 1 : null;
                faceIndices.push({ posIdx, texIdx });
            }
            for (let i = 1; i < faceIndices.length - 1; i++) {
                const a = faceIndices[0];
                const b = faceIndices[i];
                const c = faceIndices[i + 1];
                [a, b, c].forEach(idx => {
                    const px = positions[idx.posIdx * 3];
                    const py = positions[idx.posIdx * 3 + 1];
                    const pz = positions[idx.posIdx * 3 + 2];
                    let u = 0, v = 0;
                    if (idx.texIdx !== null && texcoords.length) {
                        u = texcoords[idx.texIdx * 2];
                        v = texcoords[idx.texIdx * 2 + 1];
                    }
                    vertices.push(px, py, pz, u, v);
                });
            }
        }
    }

    // Нормировка размеров: центрируем модель и масштабируем в [-0.5, 0.5]
    let minX = Infinity,  minY = Infinity,  minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 5) {
        if (vertices[i]     < minX) minX = vertices[i];
        if (vertices[i]     > maxX) maxX = vertices[i];
        if (vertices[i + 1] < minY) minY = vertices[i + 1];
        if (vertices[i + 1] > maxY) maxY = vertices[i + 1];
        if (vertices[i + 2] < minZ) minZ = vertices[i + 2];
        if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2];
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const normScale = maxExtent > 0 ? 1 / maxExtent : 1;
    for (let i = 0; i < vertices.length; i += 5) {
        vertices[i]     = (vertices[i]     - cx) * normScale;
        vertices[i + 1] = (vertices[i + 1] - cy) * normScale;
        vertices[i + 2] = (vertices[i + 2] - cz) * normScale;
    }

    return {
        vertices: new Float32Array(vertices),
        count: vertices.length / 5
    };
}

async function loadModel(name, posX, posY, scale, textureName = null, textureExt = 'png') {
    // Берём модели из Lab4 — нет дублирования OBJ/PNG между лабами.
    const objUrl = `../Lab4/models/${name}.obj`;
    const texUrl = `../Lab4/models/${textureName ?? name}.${textureExt}`;
    
    try {
        const objData = await loadOBJ(objUrl);
        const texture = loadTexture(texUrl);
        
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, objData.vertices, gl.STATIC_DRAW);
        
        const posLoc = gl.getAttribLocation(program, "aPosition");
        const uvLoc = gl.getAttribLocation(program, "aUV");
        
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5 * 4, 0);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
        
        gl.bindVertexArray(null);
        
        models.push({
            vao,
            count: objData.count,
            texture,
            posX,
            posY,
            scale
        });
        
        console.log(`Модель ${name} загружена`);
    } catch (e) {
        console.error(`Ошибка загрузки ${name}:`, e);
    }
}

loadModel('DumpTruck', -1, 0.25, 0.5, 'DumpTruckDiffuseBake');
loadModel('Sugarcube_Corner', 1, 0.25, 0.5, 'Sugarcube_Corner_BaseColor');
loadModel('goku', 0, 0.25, 0.5, 'goku', 'jpg');

function renderCube(num, tx) {
    const aspect = canvas.width / canvas.height;

    const projection = mat4.create();
    mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100);

    const model = mat4.create();
    mat4.translate(model, model, [tx, -0.5, -4]);
    mat4.rotateZ(model, model, anglez);
    mat4.rotateY(model, model, angley);
    mat4.rotateX(model, model, anglex);
    mat4.scale(model, model, [scalex * 0.5, scaley * 0.5, scalez * 0.5]);

    gl.uniformMatrix4fv(modelLoc, false, model);
    gl.uniformMatrix4fv(projectionLoc, false, projection);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureMat[num]);
    gl.uniform1i(textureLoc, 0);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

// РЕНДЕР

function drawScene() {
    gl.useProgram(program);
    renderCube(0, 0);
    renderCube(1, -1);
    renderCube(2, 1);

    if (models.length > 0) {
        const aspect = canvas.width / canvas.height;
        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100);

        models.forEach(model => {
            const modelMatrix = mat4.create();
            mat4.translate(modelMatrix, modelMatrix, [model.posX, model.posY, -4]);
            mat4.rotateY(modelMatrix, modelMatrix, angley);
            mat4.scale(modelMatrix, modelMatrix, [model.scale, model.scale, model.scale]);

            gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
            gl.uniformMatrix4fv(projectionLoc, false, projection);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, model.texture);
            gl.uniform1i(textureLoc, 0);

            gl.bindVertexArray(model.vao);
            gl.drawArrays(gl.TRIANGLES, 0, model.count);
        });
    }
}

function render() {

    if (bloomEnabled || vignetteEnabled || grainEnabled || gradingEnabled) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.87, 0.94, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        drawScene();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.87, 0.94, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(postProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
        gl.uniform1i(postSceneTexLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, lutIdentityTex);
        gl.uniform1i(postLutIdentityLoc, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, lutStyledTex);
        gl.uniform1i(postLutStyledLoc, 2);

        const t = performance.now() * 0.001;
        const anim = 0.5 + 0.5 * Math.sin(t * 0.9);
        const bloomStrength = bloomEnabled ? 0.85 * anim : 0.0;
        const vignetteStrength = vignetteEnabled ? 1.0 * (0.6 + 0.6 * anim) : 0.0;
        const grainStrength = grainEnabled ? 0.14 * (0.3 + 1.2 * anim) : 0.0;
        // Грейдинг применяется на полную силу — иначе чекбокс «не реагирует»
        // в моменты, когда анимация-синус проходит через 0.
        const gradingStrength = gradingEnabled ? 1.0 : 0.0;

        gl.uniform2f(postTexelSizeLoc, 1 / canvas.width, 1 / canvas.height);
        gl.uniform1f(postBloomStrengthLoc, bloomStrength);
        gl.uniform1f(postVignetteStrengthLoc, vignetteStrength);
        gl.uniform1f(postGrainStrengthLoc, grainStrength);
        gl.uniform1f(postGradingStrengthLoc, gradingStrength);
        gl.uniform1f(postTimeLoc, t);

        gl.bindVertexArray(postVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        gl.enable(gl.DEPTH_TEST);
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.87, 0.94, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        drawScene();
    }
    
    anglex += 0.01;
    angley += 0.01;
    anglez += 0.01;
    
    requestAnimationFrame(render);
}

render();