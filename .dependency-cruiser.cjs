/** Package boundaries: packages may import only `contracts` (through its public
 * entry) and outside libraries. `app` is the one package allowed to wire others. */
module.exports = {
  forbidden: [
    {
      name: "no-cross-package-imports",
      comment:
        "A package may depend on `contracts` and outside libraries, never on another Rosetta package. Only `app` composes packages.",
      severity: "error",
      from: { path: "^packages/([^/]+)/", pathNot: "^packages/app/" },
      to: { path: "^packages/", pathNot: ["^packages/$1/", "^packages/contracts/"] },
    },
    {
      name: "no-contracts-internals",
      comment: "Import `contracts` through its public entry (src/index.ts), never its internals.",
      severity: "error",
      from: { path: "^packages/", pathNot: "^packages/contracts/" },
      to: { path: "^packages/contracts/", pathNot: "^packages/contracts/src/index\\.ts$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    exclude: { path: "(^|/)(dist|node_modules)/" },
  },
};
