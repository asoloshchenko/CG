# Лаб 3 — Освещение (Gouraud / Phong, Lambert / Phong-spec). Как это сделано

Стек: чистый **WebGL2** + JS, без библиотек. Точка входа — [index.html](index.html), вся логика в [main.js](main.js).

## Сцена
В `init()` (main.js:395) грузятся 4 OBJ-модели:
- `snowman1.obj` — снеговик из сфер (склеен в Blender),
- `cube.obj` — куб,
- `Sherlock.obj`, `bananaCat.obj` — две сторонние модели из интернета.

OBJ парсится вручную в `loadOBJ()` (main.js:292): читаются `v`, `vn`, `vt`, `f`; полигоны триангулируются «веером»; каждая уникальная пара `v/vt/vn` дедуплицируется через `Map`. На выходе плоский массив вершин (pos3 + nor3 + uv2 = 8 float) и индексы. `createMesh()` собирает VAO с буфером вершин + EBO.

## Матрицы
- `createTransformMatrix(ax,ay,az, sx,sy,sz, tx,ty,tz)` — собирает `T·Rz·Ry·Rx·S` вручную (умножение `mul()` внутри).
- `createPerspectiveMatrix(fov, aspect, near, far)` — стандартная OpenGL-перспектива.
Камера статичная (`uModel` уже содержит мировой сдвиг `tz = -3..-7`), `uProjection` пересчитывается каждый кадр.

## Две пары шейдеров — два типа шейдинга
Сделано два разных GLSL-программы:
1. **Phong shading** (`vsPhong` / `fsPhong`, main.js:126) — нормаль/позиция интерполируется по пикселям, освещение считается **во фрагментном** шейдере.
2. **Gouraud shading** (`vsGouraud` / `fsGouraud`, main.js:174) — освещение считается **в вершинном** шейдере, и уже готовый цвет интерполируется по треугольнику.

Переключение между ними — клавишами **G** (Gouraud) и **P** (Phong): меняется `currentProgram`/`currentUniforms`, см. main.js:469–482.

## Модель освещения
Внутри обеих программ один и тот же код:

```
ambient  = uAmbientPower * uBaseColor              // фоновая
diffuse  = max(dot(N, L), 0) * baseColor * att     // Ламберт
spec     = pow(max(dot(V, R), 0), 32) * att        // блик (Phong)
color    = ambient + diffuse + (uUsePhong ? spec : 0)
```

- `uUsePhong` — флаг: 0 = «чистый Ламберт» (только ambient + diffuse), 1 = добавляется зеркальная составляющая Фонга. Переключается клавишей **L** (main.js:460).
- `uAmbientPower` регулируется клавишами **+ / −** (main.js:444).

## Точечный источник и затухание
Свет — точечный с позицией `uLightPos`. Затухание считается по формуле

```
attenuation = 1 / (kc + kl·d + kq·d²)
```

где `kc, kl, kq` = `uAttenuationConstant`, `uAttenuationLinear`, `uAttenuationQuadratic`. Регулируется с клавиатуры:
- **I / Shift+I** — линейное `kl` (main.js:485),
- **O / Shift+O** — квадратичное `kq` (main.js:501).

## Анимация и UI
- Все объекты крутятся одной и той же матрицей вокруг трёх осей, флаг `isRotating` (клавиша **R**) ставит на паузу.
- В правом верхнем углу — `infoDiv` с текущими параметрами (ambient, затухание, модель света, тип шейдинга) — обновляется через `updateInfo()`.

## Что соответствует пунктам задания
- Точечный источник + регулировка линейного/квадратичного затухания — клавиши I, O.
- Регулировка ambient — клавиши +/−.
- Gouraud ↔ Phong shading — клавиши G/P (две разные пары шейдеров).
- Ламберт ↔ Фонг (наличие блика) — клавиша L (`uUsePhong`).
