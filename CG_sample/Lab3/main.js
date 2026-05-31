import { mat4 } from "gl-matrix";

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) alert("WebGL2 not supported");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

gl.enable(gl.DEPTH_TEST);

let anglex = 0;
let angley = 0;
let anglez = 0;

let lightPos = [-1.6, -1.0, -1.0];
let ambientPower = 0.2;
let usePhongModel = 1;
let baseColor = [0, 0.5, 0.5];

let attConstant = 1.0;
let attLinear = 0.0;
let attQuadratic = 0.0;

let infoDiv = document.createElement('div');
infoDiv.style.position = 'absolute';
infoDiv.style.top = '10px';
infoDiv.style.right = '10px';
infoDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
infoDiv.style.color = 'white';
infoDiv.style.padding = '10px';
infoDiv.style.borderRadius = '5px';
infoDiv.style.fontFamily = 'monospace';
infoDiv.style.zIndex = '100';
document.body.appendChild(infoDiv);

function updateInfo() {
    infoDiv.innerHTML = `
        Ambient: ${ambientPower.toFixed(2)}<br>
        Const att: ${attConstant.toFixed(2)}<br>
        Linear att: ${attLinear.toFixed(2)}<br>
        Quad att: ${attQuadratic.toFixed(2)}<br>
        Light model: ${usePhongModel ? 'Phong' : 'Lambert'}<br>
        Shading: ${currentProgram === progPhong ? 'Phong' : 'Gouraud'}
        <hr style="border-color:#555;margin:6px 0">
        <span style="color:#aaa">
        R — toggle rotation<br>
        +/- — ambient<br>
        L — Lambert / Phong specular<br>
        G/P — Gouraud / Phong shading<br>
        i/I — linear att ±<br>
        o/O — quadratic att ±
        </span>
    `;
}

function createTransformMatrix(ax, ay, az, sx, sy, sz, tx, ty, tz) {
    const m = mat4.create();
    mat4.translate(m, m, [tx, ty, tz]);
    mat4.rotateZ(m, m, az);
    mat4.rotateY(m, m, ay);
    mat4.rotateX(m, m, ax);
    mat4.scale(m, m, [sx, sy, sz]);
    return m;
}

const vsPhong = `#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uProjection;
    out vec3 vPos;
    out vec3 vNormal;
    void main() {
        vec4 worldPos = uModel * vec4(aPosition, 1.0);
        vPos = worldPos.xyz;
        vNormal = normalize(mat3(uModel) * aNormal);
        gl_Position = uProjection * worldPos;
    }`;

const fsPhong = `#version 300 es
    precision mediump float;
    in vec3 vPos;
    in vec3 vNormal;
    out vec4 outColor;
    uniform vec3 uLightPos;
    uniform float uAmbientPower;
    uniform int uUsePhong;
    uniform vec3 uBaseColor;
    uniform float uAttenuationConstant;
    uniform float uAttenuationLinear;
    uniform float uAttenuationQuadratic;
    void main() {
        vec3 ambient = uAmbientPower * uBaseColor;

        vec3 lightDir = uLightPos - vPos;
        float dist = length(lightDir);
        lightDir = normalize(lightDir);
        float attenuation = 1.0 / (uAttenuationConstant + uAttenuationLinear * dist + uAttenuationQuadratic * dist * dist);

        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 diffuse = diff * uBaseColor * attenuation;
        vec3 color = ambient + diffuse;

        if (uUsePhong == 1) {
            vec3 viewDir = normalize(-vPos);
            vec3 reflectDir = reflect(-lightDir, vNormal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
            spec *= attenuation;
            color += spec;
        }
        outColor = vec4(color, 1.0);
    }`;

const vsGouraud = `#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uProjection;
    uniform vec3 uLightPos;
    uniform float uAmbientPower;
    uniform int uUsePhong;
    uniform vec3 uBaseColor;
    uniform float uAttenuationConstant;
    uniform float uAttenuationLinear;
    uniform float uAttenuationQuadratic;
    out vec3 vColor;
    void main() {
        vec4 worldPos = uModel * vec4(aPosition, 1.0);
        vec3 normal = normalize(mat3(uModel) * aNormal);

        vec3 lightDir = uLightPos - worldPos.xyz;
        float dist = length(lightDir);
        lightDir = normalize(lightDir);
        float attenuation = 1.0 / (uAttenuationConstant + uAttenuationLinear * dist + uAttenuationQuadratic * dist * dist);

        float diff = max(dot(normal, lightDir), 0.0);
        vec3 ambient = uAmbientPower * uBaseColor;
        vec3 diffuse = diff * uBaseColor * attenuation;
        vec3 color = ambient + diffuse;

        if (uUsePhong == 1) {
            vec3 viewDir = normalize(-worldPos.xyz);
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
            spec *= attenuation;
            color += spec;
        }
        vColor = color;
        gl_Position = uProjection * worldPos;
    }`;

const fsGouraud = `#version 300 es
    precision mediump float;
    in vec3 vColor;
    out vec4 outColor;
    void main() {
        outColor = vec4(vColor, 1.0);
    }`;

function createShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
    return s;
}

function createProgramWithBindings(vsSrc, fsSrc, bindings) {
    const prog = gl.createProgram();
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fsSrc));
    for (let [name, index] of Object.entries(bindings)) {
        gl.bindAttribLocation(prog, index, name);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
    }
    return prog;
}

const attribBindings = { aPosition: 0, aNormal: 1, aTexCoord: 2 };

const progPhong = createProgramWithBindings(vsPhong, fsPhong, attribBindings);
const progGouraud = createProgramWithBindings(vsGouraud, fsGouraud, attribBindings);

const phongUniforms = {
    model: gl.getUniformLocation(progPhong, "uModel"),
    projection: gl.getUniformLocation(progPhong, "uProjection"),
    lightPos: gl.getUniformLocation(progPhong, "uLightPos"),
    ambientPower: gl.getUniformLocation(progPhong, "uAmbientPower"),
    usePhong: gl.getUniformLocation(progPhong, "uUsePhong"),
    baseColor: gl.getUniformLocation(progPhong, "uBaseColor"),
    attConst: gl.getUniformLocation(progPhong, "uAttenuationConstant"),
    attLin: gl.getUniformLocation(progPhong, "uAttenuationLinear"),
    attQuad: gl.getUniformLocation(progPhong, "uAttenuationQuadratic")
};

const gouraudUniforms = {
    model: gl.getUniformLocation(progGouraud, "uModel"),
    projection: gl.getUniformLocation(progGouraud, "uProjection"),
    lightPos: gl.getUniformLocation(progGouraud, "uLightPos"),
    ambientPower: gl.getUniformLocation(progGouraud, "uAmbientPower"),
    usePhong: gl.getUniformLocation(progGouraud, "uUsePhong"),
    baseColor: gl.getUniformLocation(progGouraud, "uBaseColor"),
    attConst: gl.getUniformLocation(progGouraud, "uAttenuationConstant"),
    attLin: gl.getUniformLocation(progGouraud, "uAttenuationLinear"),
    attQuad: gl.getUniformLocation(progGouraud, "uAttenuationQuadratic")
};

let currentProgram = progPhong;
let currentUniforms = phongUniforms;
gl.useProgram(currentProgram);

function setUniforms(prog, uniforms) {
    gl.useProgram(prog);
    gl.uniform3fv(uniforms.lightPos, lightPos);
    gl.uniform1f(uniforms.ambientPower, ambientPower);
    gl.uniform1i(uniforms.usePhong, usePhongModel);
    gl.uniform3fv(uniforms.baseColor, baseColor);
    gl.uniform1f(uniforms.attConst, attConstant);
    gl.uniform1f(uniforms.attLin, attLinear);
    gl.uniform1f(uniforms.attQuad, attQuadratic);
}

setUniforms(progPhong, phongUniforms);
setUniforms(progGouraud, gouraudUniforms);
gl.useProgram(currentProgram);
updateInfo();

async function loadOBJ(url) {
    const res = await fetch(url);
    const text = await res.text();
    const lines = text.split("\n");

    const pos = [];
    const nor = [];
    const uv = [];
    const vertices = [];
    const indices = [];
    const map = new Map();

    function getIndex(v, vt, vn) {
        const key = `${v}/${vt}/${vn}`;
        if (map.has(key)) return map.get(key);

        const px = pos[v * 3];
        const py = pos[v * 3 + 1];
        const pz = pos[v * 3 + 2];

        let nx = 0, ny = 0, nz = 1;
        if (vn >= 0) {
            nx = nor[vn * 3];
            ny = nor[vn * 3 + 1];
            nz = nor[vn * 3 + 2];
        }

        const u = vt >= 0 ? uv[vt * 2] : 0;
        const vcoord = vt >= 0 ? uv[vt * 2 + 1] : 0;

        vertices.push(px, py, pz, nx, ny, nz, u, vcoord);

        const id = vertices.length / 8 - 1;
        map.set(key, id);
        return id;
    }

    for (let l of lines) {
        l = l.trim();
        if (l === "" || l.startsWith("#")) continue;

        const p = l.split(/\s+/);

        if (p[0] === "v")
            pos.push(+p[1], +p[2], +p[3]);
        else if (p[0] === "vn")
            nor.push(+p[1], +p[2], +p[3]);
        else if (p[0] === "vt")
            uv.push(+p[1], +p[2]);
        else if (p[0] === "f") {
            const face = [];
            for (let i = 1; i < p.length; i++) {
                const t = p[i].split("/");
                const v = parseInt(t[0]) - 1;
                const vt = t[1] ? parseInt(t[1]) - 1 : -1;
                const vn = t[2] ? parseInt(t[2]) - 1 : -1;
                face.push(getIndex(v, vt, vn));
            }
            for (let i = 1; i < face.length - 1; i++)
                indices.push(face[0], face[i], face[i + 1]);
        }
    }

    // Нормализация размеров: центрируем модель и масштабируем в [-1, 1]
    let minX = Infinity,  minY = Infinity,  minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 8) {
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
    const normScale = maxExtent > 0 ? 2 / maxExtent : 1;
    for (let i = 0; i < vertices.length; i += 8) {
        vertices[i]     = (vertices[i]     - cx) * normScale;
        vertices[i + 1] = (vertices[i + 1] - cy) * normScale;
        vertices[i + 2] = (vertices[i + 2] - cz) * normScale;
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices)
    };
}

function createMesh(data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    const stride = 8 * 4;

    gl.enableVertexAttribArray(0); // aPosition
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(1); // aNormal
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);

    // aTexCoord
    if (gl.getAttribLocation(currentProgram, "aTexCoord") >= 0) {
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
    }

    return {
        vao: vao,
        count: data.indices.length
    };
}

let objects = [];

async function init() {
    const snowman = await loadOBJ("./models/snowman2.obj");
    const bench = await loadOBJ("./models/bench.obj");
    const head = await loadOBJ("./models/head.obj");
    // const bananaCat = await loadOBJ("./models/bananaCat.obj");

    objects.push({
        mesh: createMesh(snowman),
        tx: 0,
        ty: -0.4,
        tz: -3,
        scale: 1
    });

    objects.push({
        mesh: createMesh(bench),
        tx: -1.5,
        ty: -0.4,
        tz: -3,
        scale: 1
    });

    objects.push({
        mesh: createMesh(head),
        tx: 1.5,
        ty: -0.4,
        tz: -3,
        scale: 1
    });

    requestAnimationFrame(render);
}

let isRotating = true;

document.addEventListener("keydown", (e) => {
    if (e.key == "R" || e.key == "r") {
        isRotating = !isRotating;
    }

    // Регулировка ambient
    if (e.key == "+" || e.key == "=") {
        ambientPower = Math.min(1, ambientPower + 0.02);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }
    if (e.key == "-") {
        ambientPower = Math.max(0, ambientPower - 0.02);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }

    // Переключение модели света (Lambert/Phong specular)
    if (e.key == "l" || e.key == "L") {
        usePhongModel = 1 - usePhongModel;
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }

    // Переключение shading: Gouraud / Phong
    if (e.key == "g" || e.key == "G") {
        currentProgram = progGouraud;
        currentUniforms = gouraudUniforms;
        gl.useProgram(currentProgram);
        setUniforms(currentProgram, currentUniforms);
        updateInfo();
    }
    if (e.key == "p" || e.key == "P") {
        currentProgram = progPhong;
        currentUniforms = phongUniforms;
        gl.useProgram(currentProgram);
        setUniforms(currentProgram, currentUniforms);
        updateInfo();
    }

    // Линейное затухание
    if (e.key == "i") {
        attLinear = Math.min(1, attLinear + 0.01);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }
    if (e.key == "I") {
        attLinear = Math.max(0, attLinear - 0.01);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }

    // Квадратичное затухание
    if (e.key == "o") {
        attQuadratic = Math.min(1, attQuadratic + 0.01);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }
    if (e.key == "O") {
        attQuadratic = Math.max(0, attQuadratic - 0.01);
        setUniforms(progPhong, phongUniforms);
        setUniforms(progGouraud, gouraudUniforms);
        gl.useProgram(currentProgram);
        updateInfo();
    }
});

function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const projection = mat4.create();
    mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100);
    gl.uniformMatrix4fv(currentUniforms.projection, false, projection);

    for (const obj of objects) {
        const model = createTransformMatrix(
            anglex, angley, anglez,
            obj.scale, obj.scale, obj.scale,
            obj.tx, obj.ty, obj.tz
        );
        gl.uniformMatrix4fv(currentUniforms.model, false, model);
        gl.bindVertexArray(obj.mesh.vao);
        gl.drawElements(gl.TRIANGLES, obj.mesh.count, gl.UNSIGNED_INT, 0);
    }

    if (isRotating) {
        anglex += 0.005;
        angley += 0.005;
        anglez += 0.005;
    }
    requestAnimationFrame(render);
}

init();