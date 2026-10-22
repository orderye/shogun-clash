import js from "@eslint/js";

/**
 * ESLint flat config。
 *
 * js/ 下三个文件是浏览器端的经典 <script>（非 ESM），彼此通过顶层 const
 * 共享同一个全局词法作用域，因此这里按「脚本」而非「模块」解析，
 * 并按文件精确声明各自引用到的**其他文件**所定义的全局，避免 no-redeclare。
 */
const browserGlobals = {
  console: "readonly",
  document: "readonly",
  window: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  fetch: "readonly",
  alert: "readonly",
  confirm: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    // data.js：仅定义 CARDS，不引用其他文件的全局
    files: ["js/data.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: browserGlobals },
    rules: {
      "no-undef": "error",
      // CARDS 是给其他文件用的导出型全局
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^CARDS$" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // game.js：引用 data.js 的 CARDS 与 ui.js 的 UI；定义 Game / KIND_CN / TYPE_CN
    files: ["js/game.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserGlobals, CARDS: "readonly", UI: "readonly" },
    },
    rules: {
      "no-undef": "error",
      // Game 是给 ui.js 用的导出型全局
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^Game$" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // ui.js：引用 data.js 的 CARDS 与 game.js 的 Game / KIND_CN / TYPE_CN；定义 UI / hashStr
    files: ["js/ui.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...browserGlobals,
        CARDS: "readonly",
        Game: "readonly",
        KIND_CN: "readonly",
        TYPE_CN: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // 中文排版中全角空格用于缩进，属正常用法
      "no-irregular-whitespace": "off",
    },
  },
  {
    files: ["tests/**/*.js", "*.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { console: "readonly", process: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
