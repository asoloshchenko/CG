const express = require('express');
const path = require('path');

const app = express();
app.set('strict routing', true);   // /labN и /labN/ — разные маршруты
const PORT = 4000;

// Лаб 3 — Vite-проект, раздаём собранный dist/
// Пересобрать: cd Lab3 && npm run build
const lab3Dist = path.join(__dirname, 'Lab3', 'dist');
const lab3Dir  = path.join(__dirname, 'Lab3');
app.get('/lab3', (req, res) => res.redirect('/lab3/'));
app.use('/lab3', express.static(lab3Dist, { redirect: false })); // HTML + JS бандл
app.use('/lab3', express.static(lab3Dir,  { redirect: false })); // models/, textures/ (не попали в dist)

// Лабы 4–7: статика напрямую из папки лабы
const staticLabs = [4, 5, 6, 7];
for (const n of staticLabs) {
    const dir = path.join(__dirname, `Lab${n}`);
    // Редирект /labN → /labN/ чтобы относительные пути в main.js работали
    app.get(`/lab${n}`, (req, res) => res.redirect(`/lab${n}/`));
    // redirect:false — без него express.static зацикливается на /labN/
    app.use(`/lab${n}`, express.static(dir, { redirect: false }));
}

// Лаб 8 — нативное C++ приложение, показываем страницу-заглушку
app.get('/lab8', (req, res) => res.redirect('/lab8/'));
app.get('/lab8/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Лаб 8 — Тесселяция</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d0d14; color: #e0e0f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #16162a; border: 1px solid #2a2a4a; border-radius: 16px; padding: 48px; max-width: 560px; text-align: center; }
    .badge { display: inline-block; background: #2a1a3a; color: #c080ff; border: 1px solid #6030a0; border-radius: 6px; padding: 4px 12px; font-size: 13px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 16px; color: #fff; }
    p { color: #a0a0c0; line-height: 1.6; margin-bottom: 12px; }
    code { background: #0d0d20; border: 1px solid #2a2a4a; border-radius: 4px; padding: 2px 8px; font-size: 14px; color: #80d0ff; }
    .back { display: inline-block; margin-top: 32px; color: #6080ff; text-decoration: none; font-size: 14px; }
    .back:hover { color: #88aaff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Нативное приложение</div>
    <h1>Лаб 8 — Программируемая геометрия на GPU</h1>
    <p>Это C++ / OpenGL 4.1 приложение — его нельзя открыть в браузере.</p>
    <p>Чтобы запустить, откройте проект в Visual Studio:</p>
    <p><code>Lab8.slnx</code></p>
    <p>Управление: <strong>WASD</strong> — движение, <strong>мышь</strong> — вращение камеры, <strong>N</strong> — показать нормали, <strong>Esc</strong> — выход.</p>
    <a class="back" href="/">← Вернуться к списку лаб</a>
  </div>
</body>
</html>`);
});

// Главная страница
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log(`\n  ✓ Сервер запущен: http://localhost:${PORT}\n`);
});
