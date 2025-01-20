/** @type {import("eslint").Linter.Config} */
const config = {
  extends: [
    "next/core-web-vitals",
  ],
  rules: {
    "drizzle/enforce-delete-with-where": [
      "error",
      {
        drizzleObjectName: ["db", "ctx.db"],
      },
    ],
    "drizzle/enforce-update-with-where": [
      "error",
      {
        drizzleObjectName: ["db", "ctx.db"],
      },
    ],
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
      },
      plugins: ["@typescript-eslint", "drizzle"],
      extends: [
        "plugin:@typescript-eslint/recommended",
      ],
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/await-thenable": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/no-misused-promises": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/no-unsafe-enum-comparison": "off",
        "@typescript-eslint/no-base-to-string": "off",
        "@typescript-eslint/no-redundant-type-constituents": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "@typescript-eslint/no-unsafe-declaration-merging": "off",
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/prefer-as-const": "off",
        "@typescript-eslint/prefer-namespace-keyword": "off",
        "@typescript-eslint/triple-slash-reference": "off",
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
        "@typescript-eslint/no-extra-semi": "off",
        "@typescript-eslint/no-unnecessary-type-constraint": "off",
      },
    },
  ],
};
module.exports = config;
