// Builds this template's frontend module against the real DMS core module and
// the real Vue/Inertia adapter, the same way `ajs-dms build` would, without
// needing a running backend.
//
// By default it uses the installed @antelopejs/dms and @antelopejs/dms-frontend
// packages. Point DMS_SOURCE and DMS_ADAPTER_SOURCE at local checkouts to check
// against unpublished versions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

function packageRoot(name) {
  return dirname(require.resolve(`${name}/package.json`));
}

const dmsRoot = resolve(
  process.env.DMS_SOURCE ?? packageRoot("@antelopejs/dms"),
);
const adapterRoot = resolve(
  process.env.DMS_ADAPTER_SOURCE ?? packageRoot("@antelopejs/dms-frontend"),
);
const adapterEntry = join(adapterRoot, "dist/common.js");
assert.ok(
  existsSync(adapterEntry),
  "The DMS frontend adapter must expose dist/common.js",
);
assert.ok(
  existsSync(join(dmsRoot, "frontend-vue/dms.frontend.ts")),
  "The DMS package must include frontend-vue",
);

const { createFrontendModuleRegistry, writeFrontendModuleRegistry } =
  await import(pathToFileURL(adapterEntry));

const workspace = mkdtempSync(join(tmpdir(), "template-dms-demo-frontend-"));
const templateRoot = join(adapterRoot, "templates/vue");
const layers = [
  {
    path: join(dmsRoot, "frontend-vue"),
    packageName: "@fixture/dms",
    priority: -100,
    options: { dms: { homepage: "/home" } },
  },
  {
    // Mirrors the AddFrontendModule() call in src/index.ts.
    path: join(root, "frontend-vue"),
    packageName: "@fixture/template-dms-demo",
    priority: 100,
  },
];
const excluded = new Set([
  "node_modules",
  "pnpm-lock.yaml",
  ".npmrc",
  "dist",
  ".git",
]);
const environment = { ...process.env };
delete environment.NODE_OPTIONS;

function readPackage(directory) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function prepareWorkspace() {
  for (const file of readdirSync(templateRoot).filter(
    (name) => name !== "npmrc",
  )) {
    cpSync(join(templateRoot, file), join(workspace, file), {
      recursive: true,
    });
  }
  const registry = createFrontendModuleRegistry(workspace, layers);
  let dependencies = {};
  for (const entry of registry.modules) {
    const source = layers.find(
      (layer) => layer.packageName === entry.packageName,
    );
    cpSync(source.path, entry.root, {
      recursive: true,
      filter: (path) => !excluded.has(basename(path)),
    });
    const pkg = readPackage(entry.root);
    dependencies = { ...pkg.dependencies, ...dependencies };
    delete pkg.devDependencies;
    writeFileSync(
      join(entry.root, "package.json"),
      JSON.stringify(pkg, null, 2),
    );
  }
  const pkg = readPackage(templateRoot);
  pkg.dependencies = { ...dependencies, ...pkg.dependencies };
  writeFileSync(join(workspace, "package.json"), JSON.stringify(pkg, null, 2));
  writeFrontendModuleRegistry(workspace, layers);
  writeFileSync(
    join(workspace, "dms-main.css"),
    '@import "tailwindcss";\n@import "@nuxt/ui";\n',
  );
}

function run(args) {
  execFileSync("pnpm", args, {
    cwd: workspace,
    env: environment,
    stdio: "inherit",
  });
}

console.log(`Frontend check workspace: ${workspace}`);
prepareWorkspace();
run(["install", "--ignore-scripts", "--no-frozen-lockfile"]);
run(["build"]);
run(["typecheck"]);
console.log(
  "DMS core + template frontend module: client, SSR and typecheck passed",
);
if (!process.env.KEEP_FRONTEND_CHECK)
  rmSync(workspace, { recursive: true, force: true });
