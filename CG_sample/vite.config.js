import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    server: {
        host: '0.0.0.0',
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                lab3: resolve(__dirname, 'Lab3/index.html'),
                lab4: resolve(__dirname, 'Lab4/index.html'),
                lab5: resolve(__dirname, 'Lab5/index.html'),
                lab6: resolve(__dirname, 'Lab6/index.html'),
                lab7: resolve(__dirname, 'Lab7/index.html'),
            },
        },
    },
});
