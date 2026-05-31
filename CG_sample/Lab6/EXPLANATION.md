# Лаб 6 — Система частиц. Как это сделано

Стек: **WebGL1** + JS, рендер частиц через `gl.POINTS`. Вся логика в [main.js](main.js), всё обёрнуто в IIFE.

## Что вообще такое «частица» здесь
Каждая частица — обычный JS-объект в массиве `particles[]` (main.js:264) c полями:
- `x, y` — позиция; `prevX, prevY` — для следов; `vx, vy` — скорость; `ax, ay` — ускорение; `drag` — сопротивление;
- `life`, `maxLife` — таймер;
- `size`/`sizeEnd`, `color`/`colorEnd`, `alpha`/`alphaEnd` — анимируемые параметры;
- `gravityScale` — множитель глобальной `gravity = 450`;
- `sprite` — 0 (радиальный круг), 1 (текстура `beng_light.png`), 2 (`snowflake.png`);
- `kind` — тип, влияет на спец-логику (`sparkler`, `sparklerLecture`).

Пул `state.maxParticles = 18000` — ограничение сверху, лишние срезаются (main.js:729).

## Рендер: один draw call на все частицы
Каждый кадр (`frame()`, main.js:897):
1. `spawnByMode(dt, time)` — спавнит новые частицы в зависимости от режима.
2. `updateParticles(dt)` — интегрирует физику: `v *= (1 - drag·dt)`, `v += (a + gravity·gScale)·dt`, `pos += v·dt`. Срок жизни истёк → удалить.
3. `fillBuffers()` — кладёт в типизированные массивы `positions`, `sizes`, `colors`, `sprites` интерполированные значения (через `lerp` по `life01 = 1 - life/maxLife`), плюс fade-in.
4. `draw()` (main.js:801) — биндит DYNAMIC_DRAW в VBO и зовёт `gl.drawArrays(gl.POINTS, 0, count)`. Блендинг `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`.

## Шейдеры частиц (main.js:9, 32)
Вершинный конвертит координаты из пикселей экрана в clip-space, задаёт `gl_PointSize = a_size` (каждой точке свой размер!) и пробрасывает цвет/спрайт.

Фрагментный — самая мякотка:
```glsl
vec2 p = gl_PointCoord - 0.5;
float d = length(p) * 2.0;
float core = smoothstep(0.75, 0.0, d);
float glow = smoothstep(1.0, 0.2, d) * 0.35;
float radialAlpha = (core + glow) * v_color.a;
```
По `gl_PointCoord` (0..1 внутри спрайта-точки) строится круглый «фейк-блик» — ядро + halo. Если у частицы выставлен `spriteType`, вместо этого мьюлится текстура (`beng_light.png` для бенгальского огня, `snowflake.png` для снежинок).

## Режимы (переключение цифрами 1–6, E, Q)
- **1 — Sparkler** (бенгальский огонь). Спавнит из центра 340 частиц/сек, каждый кадр `update` добавляет каждой sparkler-частице ещё короткоживущую «trail»-частицу (main.js:708) → видимый шлейф из искр.
- **2 — Smoke**. Серые крупные частицы с малым αlpha, отрицательный `gravityScale` → всплывают.
- **3 — Rain**. Быстро падающие синеватые точки, спавн по всей ширине сверху.
- **4 — Clouds + Steam**. Два эмиттера: медленные кластеры облаков сверху + 6 «струй пара» снизу с фaze-in/out.
- **5 — Fireworks**. Отдельный массив `rockets[]`: ракета летит вверх с `gravity * 0.34`, оставляя огненный хвост; когда `vy >= -20` либо достигнута `targetY` — вызывается `explodeFirework(x, y, color, type)`. 4 типа взрыва: случайный шар, ровный кольцевой, спираль, «цветок» (`speed *= sin(ang * 6)`).
- **6 — Northern Lights**. 3 «полосы» (lanes), цвет вытаскивается из градиента `gradientColor()` (main.js:141) — циан → синий → фиолетовый → розовый; вертикальное колебание `sin/cos` от времени.
- **E — Snow**. Снежинки со спрайтом снежинки, ветер `sin(t·0.7 + y·0.04)`.
- **Q — Sparkler Lecture**. Тот же бенгальский огонь, но дополнительно рисуются прямые «лучи» от точки эмиссии до текущей позиции — через **отдельную программу** `trailProgram` (main.js:67–93) и `gl.drawArrays(gl.LINES, …)`. Буферы заполняются `fillTrailBuffers()` (main.js:734).

## Текстуры
`createTexturePlaceholder()` (main.js:166) — заглушка 1×1 (белый пиксель). Реальная картинка асинхронно подгружается в `loadTexture()` (main.js:187), флаги `sparklerTextureReady`/`snowTextureReady` передаются в шейдер как `u_bengReady`/`u_snowReady` — пока флаг = 0, частица рисуется как процедурный круг.

## Прочее
- DPI-aware resize с `devicePixelRatio` (но не выше 2×).
- `setMode()` чистит массив частиц и ракет, меняет `document.title`.
- Глобальная гравитация `gravity = 450` пикс/с² применяется только если у частицы `gravityScale != 0`.
