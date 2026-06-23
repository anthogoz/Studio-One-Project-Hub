import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'out', 'release', 'node_modules', 'dist-electron']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-case-declarations': 'off',
      'no-empty': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
])
