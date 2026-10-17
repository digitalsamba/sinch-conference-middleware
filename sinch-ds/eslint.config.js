import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'api-specs/'] },
    js.configs.recommended,
    {
        files: ['src/**/*.js', 'test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(req|res|next)$', caughtErrors: 'none' }],
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: { globals: { ...globals.browser } },
    },
];
