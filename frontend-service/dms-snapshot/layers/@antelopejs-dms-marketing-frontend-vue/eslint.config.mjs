import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      curly: ['error', 'all'],
      'vue/multi-word-component-names': 'off',
    },
  },
  { files: ['**/*.ts'], languageOptions: { parser: ts.parser } },
]
