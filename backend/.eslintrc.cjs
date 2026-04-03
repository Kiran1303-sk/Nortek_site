module.exports = {
  root: true,
  env: {
    es2022: true
  },
  extends: ["eslint:recommended", "prettier"],
  parserOptions: {
    ecmaVersion: "latest"
  },
  ignorePatterns: ["node_modules/", "uploads/", "public/*.html"],
  rules: {
    eqeqeq: ["error", "always"],
    curly: ["error", "all"],
    "no-var": "error",
    "prefer-const": ["error", { destructuring: "all" }],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-implicit-coercion": "error",
    "object-shorthand": ["error", "always"],
    "prefer-template": "error"
  },
  overrides: [
    {
      files: [".eslintrc.cjs"],
      env: {
        node: true
      }
    },
    {
      files: ["public/**/*.js"],
      env: {
        browser: true
      }
    },
    {
      files: ["*.js", "routes/**/*.js", "models/**/*.js", "middleware/**/*.js", "utils/**/*.js"],
      excludedFiles: ["public/**/*.js"],
      env: {
        node: true
      },
      rules: {
        "no-console": "off"
      }
    }
  ]
};
