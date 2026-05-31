# Лаб 4 — Текстурирование. Как это сделано

Стек: **WebGL2** + JS. Вся логика в [main.js](main.js).

## Сцена
Три «кубика-пьедестала» с цифрами 1, 2, 3 (`renderCube(0,…)`, `renderCube(1,…)`, `renderCube(2,…)` в main.js:529) и три OBJ-модели — `bananaCat`, `Sherlock`, `GrumpyCat`, грузятся в `loadModel()` (main.js:429).

## Два разных шейдер-пайплайна
1. **Шейдер кубов** (`vsSource` / `fsSource`, main.js:125, 144). Главное — фрагментный смешивает 4 источника:
   - `uBaseColor` — цвет куба,
   - `uTextureMat` — текстура материала (`gold.jpg`, `copper.jpg`, `tree.jpg`),
   - `uTextureNum` — текстура с цифрой (PNG с альфой),
   - и два веса `ucolorWeight`, `uNumWeight`.

   Формула смешивания (main.js:157):
   ```glsl
   numberMask = uNumWeight * tex2.a            // цифра «прорезается» только там, где есть альфа
   resTex     = mix(tex1, tex2.rgb, numberMask) // материал ⨯ цифра
   resColor   = vColor * resTex                // окрашивание (цвет умножается, а не заменяет!)
   finalColor = mix(resTex, resColor, ucolorWeight) // вклад цвета
   ```

   Это и есть пункт «цвет + текстура материала + текстура цифры», причём вклад каждого слоя регулируется отдельно.

2. **Шейдер моделей** (`vsModel` / `fsModel`, main.js:171, 183) — простой: одна диффузная текстура, без смешивания.

## Геометрия куба
Жёстко заданный массив `vertices` (main.js:239): по 4 вершины на каждую из 6 граней, каждая вершина — позиция (3) + цвет per-vertex (3, не используется в финальном шейдере) + UV (2). Грани индексируются `indices` (по 2 треугольника на грань).

## Загрузка текстур
`loadTexture()` (main.js:322) создаёт пустую `gl.TEXTURE_2D`, асинхронно подгружает картинку и в `img.onload` заливает её через `gl.texImage2D`. Используется `CLAMP_TO_EDGE` и `LINEAR`.

В массивах `textureMat[3]` и `textureNum[3]` лежат пары «материал — номер». В `renderCube(num, tx)` (main.js:473) к нужному кубу биндятся `textureMat[num]` (TEXTURE0) и `textureNum[num]` (TEXTURE1).

## Управление вкладами
В `keydown` (main.js:362):
- **R / F** — увеличить/уменьшить `colorWeight` (вклад цвета).
- **T / G** — увеличить/уменьшить `numWeight` (вклад текстуры цифры).

Текущие значения показываются в `#info` (main.js:562).

## Парсер OBJ моделей
`loadOBJ()` (main.js:371) читает `v`, `vt`, `f`; флипит `v` по Y (`1 - parseFloat(parts[2])`); триангулирует «веером». Возвращает массив из `[x,y,z,u,v]` на каждую вершину уже развёрнутого треугольника (без EBO, рисуется `drawArrays`).

## Рендер
- Анимация — три угла `anglex/y/z` тикают по 0.01 каждый кадр.
- Сначала `gl.useProgram(program)` — отрисовка трёх кубов.
- Потом `gl.useProgram(programModel)` — отрисовка моделей (`models.forEach`).
- `gl.enable(DEPTH_TEST)` включён единожды.

## Что соответствует пунктам задания
1. Текстуры с цифрами на кубах — `uTextureNum` + альфа-маска.
2. Смешивание цифр с цветом куба — `vColor * resTex` и `mix(...)` через `ucolorWeight`.
3. Текстуры материала (gold/copper/tree) + регулировка вклада — `uTextureMat` + `uNumWeight` (T/G).
4. Полное смешение «цвет + материал + номер» — итоговая формула `finalColor`.
