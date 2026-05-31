import { mat4 } from "gl-matrix";

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    alert("WebGL2 not supported");
}

function resizeCanvas() {
    canvas.height = window.innerHeight;
    canvas.width = window.innerWidth;
    gl.viewport(0, 0, canvas.width, canvas.height);
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

function createTransformMatrix(ax, ay, az, sx, sy, sz, tx, ty, tz) {
    const m = mat4.create();
    mat4.translate(m, m, [tx, ty, tz]);
    mat4.rotateZ(m, m, az);
    mat4.rotateY(m, m, ay);
    mat4.rotateX(m, m, ax);
    mat4.scale(m, m, [sx, sy, sz]);
    return m;
}


const vsSource = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
in vec2 aUV;
out vec2 vUV;

uniform vec3 uBaseColor;
uniform mat4 uModel;
uniform mat4 uProjection;

out vec3 vColor;

void main() {
    gl_Position = uProjection * uModel * vec4(aPosition, 1.0);
    vColor = uBaseColor;
    vUV = aUV;
}
`;

const fsSource = `#version 300 es
precision mediump float;

in vec3 vColor;
in vec2 vUV;

uniform sampler2D uTextureMat;
uniform sampler2D uTextureNum;
uniform float ucolorWeight;
uniform float uNumWeight;

out vec4 outColor;

void main() {
    vec3 tex1 = texture(uTextureMat, vUV).rgb;
    vec4 tex2 = texture(uTextureNum, vec2(vUV.x, 1.0 - vUV.y));

    float numberMask = clamp(uNumWeight, 0.0, 1.0) * tex2.a;
    vec3 resTex = mix(tex1, tex2.rgb, numberMask);
    vec3 resColor = vColor * resTex;
    vec3 finalColor = mix(resTex, resColor, clamp(ucolorWeight, 0.0, 1.0));

    outColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`;

const vsModel = `#version 300 es
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

const fsModel = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
out vec4 outColor;
void main() {
    outColor = texture(uTexture, vUV);
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

// Программа для моделей
const vertexShaderModel = createShader(gl, gl.VERTEX_SHADER, vsModel);
const fragmentShaderModel = createShader(gl, gl.FRAGMENT_SHADER, fsModel);
const programModel = gl.createProgram();
gl.attachShader(programModel, vertexShaderModel);
gl.attachShader(programModel, fragmentShaderModel);
gl.linkProgram(programModel);

if (!gl.getProgramParameter(programModel, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(programModel));
}

const baseColorLoc = gl.getUniformLocation(program, "uBaseColor");
const modelLocModel = gl.getUniformLocation(programModel, "uModel");
const projLocModel = gl.getUniformLocation(programModel, "uProjection");
const texLocModel = gl.getUniformLocation(programModel, "uTexture");

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
const colorLoc = gl.getAttribLocation(program, "aColor");
const uvLoc = gl.getAttribLocation(program, "aUV");

gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 8 * 4, 0);

gl.enableVertexAttribArray(colorLoc);
gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 8 * 4, 3 * 4);

gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 8 * 4, 6 * 4);

gl.bindVertexArray(null);

const rotationLoc = gl.getUniformLocation(program, "uRotation");
const modelLoc = gl.getUniformLocation(program, "uModel");
const projectionLoc = gl.getUniformLocation(program, "uProjection");
const colorWeightLoc = gl.getUniformLocation(program, "ucolorWeight");
const numWeightLoc = gl.getUniformLocation(program, "uNumWeight");

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

const textureMat = [];
const textureNum = [];

textureMat.push(loadTexture("textures/gold/tile.png"));
textureMat.push(loadTexture("textures/silver/ice.png"));
textureMat.push(loadTexture("textures/bronze/ground.png"));

textureNum.push(loadTexture("textures/digits/digits1.png"));
textureNum.push(loadTexture("textures/digits/digits2.png"));
textureNum.push(loadTexture("textures/digits/digits3.png"));

let colorWeight = 0.5;
let numWeight = 0.5;

document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") colorWeight = Math.min(1.0, colorWeight + 0.05);
    if (e.key === "f" || e.key === "F") colorWeight = Math.max(0.0, colorWeight - 0.05);
    if (e.key === "t" || e.key === "T") numWeight = Math.min(1.0, numWeight + 0.05);
    if (e.key === "g" || e.key === "G") numWeight = Math.max(0.0, numWeight - 0.05);
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
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 5) {
        if (vertices[i] < minX) minX = vertices[i];
        if (vertices[i] > maxX) maxX = vertices[i];
        if (vertices[i + 1] < minY) minY = vertices[i + 1];
        if (vertices[i + 1] > maxY) maxY = vertices[i + 1];
        if (vertices[i + 2] < minZ) minZ = vertices[i + 2];
        if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2];
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const norm = maxExtent > 0 ? 1 / maxExtent : 1;
    for (let i = 0; i < vertices.length; i += 5) {
        vertices[i]     = (vertices[i]     - cx) * norm;
        vertices[i + 1] = (vertices[i + 1] - cy) * norm;
        vertices[i + 2] = (vertices[i + 2] - cz) * norm;
    }

    return {
        vertices: new Float32Array(vertices),
        count: vertices.length / 5
    };
}

async function loadModel(name, posX, posY, scale, textureName, textureExt = 'png') {
    const objUrl = `models/${name}.obj`;
    const texUrl = `models/${textureName ?? name}.${textureExt}`;
    
    try {
        const objData = await loadOBJ(objUrl);
        const texture = loadTexture(texUrl);
        
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, objData.vertices, gl.STATIC_DRAW);
        
        const posLoc = gl.getAttribLocation(programModel, "aPosition");
        const uvLoc = gl.getAttribLocation(programModel, "aUV");
        
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

    const model = createTransformMatrix(
        anglex,
        angley,
        anglez,
        scalex * 0.5,
        scaley * 0.5,
        scalez * 0.5,
        tx, -0.5, -4
    );

    gl.uniformMatrix4fv(modelLoc, false, model);
    gl.uniformMatrix4fv(projectionLoc, false, projection);

    let baseColor;
    if (num === 0) baseColor = [0.0, 0.5, 0.5];
    else if (num === 1) baseColor = [0.0, 0.5, 0.5];
    else baseColor = [0.0, 0.5, 0.5];
    gl.uniform3fv(baseColorLoc, baseColor);

    const texLoc1 = gl.getUniformLocation(program, "uTextureMat");
    const texLoc2 = gl.getUniformLocation(program, "uTextureNum");

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureMat[num]);
    gl.uniform1i(texLoc1, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureNum[num]);
    gl.uniform1i(texLoc2, 1);

    gl.uniform1f(colorWeightLoc, colorWeight);
    gl.uniform1f(numWeightLoc, numWeight);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

// РЕНДЕР

const infoDiv = document.getElementById("info");

function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.useProgram(program);
    renderCube(0, 0);
    renderCube(1, -1);
    renderCube(2, 1);
    
    if (models.length > 0) {
        gl.useProgram(programModel);
        
        const aspect = canvas.width / canvas.height;
            const projection = mat4.create();
    mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100);
        
        models.forEach(model => {
            const modelMatrix = createTransformMatrix(
                0, angley, 0,
                model.scale, model.scale, model.scale,
                model.posX, model.posY, -4
            );
            
            gl.uniformMatrix4fv(modelLocModel, false, modelMatrix);
            gl.uniformMatrix4fv(projLocModel, false, projection);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, model.texture);
            gl.uniform1i(texLocModel, 0);
            
            gl.bindVertexArray(model.vao);
            gl.drawArrays(gl.TRIANGLES, 0, model.count);
        });
    }
    
    anglex += 0.01;
    angley += 0.01;
    anglez += 0.01;
    
    infoDiv.innerHTML = `
        Цвет: ${colorWeight.toFixed(2)} | Цифра: ${numWeight.toFixed(2)}<br>
        <span style="opacity:0.75;font-size:12px">R/F — цвет ± · T/G — цифра ±</span>
    `;
    
    requestAnimationFrame(render);
}

render();