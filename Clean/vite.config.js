import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    resolve: {
        alias: {
            // Позволяет импортировать утилиты как: import { initGL } from '@utils/webgl'
            '@utils': resolve(__dirname, 'src/utils'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                lab3: resolve(__dirname, 'Lab3/index.html'),
                // lab4: resolve(__dirname, 'Lab4/index.html'),
            },
        },
    },
});
