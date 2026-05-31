# Лаб 7 — Постобработка. Как это сделано

Стек: **WebGL2** + JS, постобработка через **off-screen framebuffer**. Вся логика в [main.js](main.js).

## Идея пайплайна
Сцена не рендерится сразу на экран. Если включён хотя бы один эффект, она рисуется в **FBO** с цветовой и глубинной текстурой, а потом весь экран закрашивается одним полноэкранным треугольником (точнее, двумя), при этом фрагментный шейдер читает `sceneColorTex` и применяет к ней эффекты. Если эффекты выключены — кадр рисуется прямо в default framebuffer (`render()` в main.js:849).

```
[scene shaders] → sceneFbo(sceneColorTex + sceneDepthTex)
                  → [postProgram, fullscreen quad] → screen
```

## Сцена
Те же три кубика (с текстурами `gold/copper/tree.jpg`) и три OBJ-модели (`bananaCat`, `Sherlock`, `GrumpyCat`), что и в лабе 4 — но без смешивания, тут шейдер сцены простейший (main.js:185): просто `texture(uTextureMat, vUV)`. Сама модель рисуется тем же `program`.

## FBO
`resizeRenderTargets()` (main.js:367) пересоздаёт каждый ресайз:
- `sceneColorTex` — RGBA8, `COLOR_ATTACHMENT0`;
- `sceneDepthTex` — `DEPTH_COMPONENT24`, `DEPTH_ATTACHMENT`;
- `sceneFbo` — собственно framebuffer, проверка `gl.checkFramebufferStatus`.

## Постпроцесс-шейдер (main.js:210)
В одном фрагментном шейдере живут все эффекты, каждый со своим uniform-«силой» — таким образом чекбоксы UI просто включают/выключают вес.

### 1. Bloom
`extractBright(uv)` (main.js:227) выделяет яркие пиксели по luminance с порогом 0.62..1.0. Дальше **дешёвая «размытая» свёртка**: текущий пиксель + крест на 1.5 текселя + диагонали на 3 текселя с весами:
```
bloom = base*0.24 + (±x, ±y)*0.15 + (диагонали)*0.08
color = base + bloom * uBloomStrength
```

### 2. Vignette
```glsl
centered = vUV * 2 - 1
vignette = 1 - smoothstep(0.45, 1.12, length(centered))
color   *= mix(1.0, vignette, uVignetteStrength)
```
Чем ближе к центру — тем светлее.

### 3. Grain (шум)
Псевдо-рандом по координате пикселя + времени:
```glsl
float n = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
color += (n - 0.5) * uGrainStrength;
```
`uTime` смещает паттерн каждый кадр → анимированный «киношный шум».

### 4. Color Grading через LUT
LUT хранится как **strip-текстура** размера `size×(size·size)` (в коде `size = 33`, итог 33×1089). Каждый «слой» по синему — отдельная горизонтальная плитка size×size с уже окрашенными RGB.

- `createGeneratedLutTexture(size, fn)` (main.js:533) — генератор identity-LUT или произвольной функции грейдинга.
- `createLutTextureFromCubeText(cubeText)` (main.js:584) — парсер `.cube` (формат Adobe Cube LUT). Подгружается файл `textures/08_Film Emulation LUTs_B&W.cube` → ч/б эмуляция плёнки.
- `sampleLutStrip()` (main.js:238) в шейдере: по `B` находит две соседние плитки `z0`, `z1`, берёт два сэмпла и интерполирует — это и есть «3D-LUT поверх 2D-текстуры».

Итог: `color = mix(color, gradedColor, uGradingStrength)`.

## Чекбоксы и анимация
В HTML стоят `#toggleBloom`, `#toggleVignette`, `#toggleGrain`, `#toggleGrading` (main.js:12–19). На каждое `change` пишется флаг в JS.

Каждая «сила» пульсирует от времени — `anim = 0.5 + 0.5 * sin(t*0.9)` (main.js:879), так что все 4 эффекта живут (выполнен пункт «анимация параметров»):
```
bloomStrength    = 0.85 * anim
vignetteStrength = 0.6 + 0.6 * anim
grainStrength    = 0.14 * (0.3 + 1.2 * anim)
gradingStrength  = 1.0 * anim
```

## Что соответствует пунктам задания
- ✅ Bloom, Vignette, Grain — три отдельных эффекта в постшейдере + чекбоксы.
- ✅ Color Grading c LUT — парсер `.cube` + strip-текстура + `sampleLutStrip`.
- ✅ Анимация параметров — `sin(t·0.9)` модулирует все четыре силы.
- 〰️ Depth of Field — есть `sceneDepthTex` и `viewZToDepth()` (main.js:161), всё подготовлено для DoF, но сам эффект в текущем шейдере не активирован.
- ❌ Адаптивное качество (снижение разрешения при низком FPS) — не реализовано.
