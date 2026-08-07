import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            '#shared': `${root}shared`,
            '~~': root.replace(/\/$/, ''),
            '@@': root.replace(/\/$/, ''),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
})
