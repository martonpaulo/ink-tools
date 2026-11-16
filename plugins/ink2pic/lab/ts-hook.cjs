/**
 * Lets Node require the product's TypeScript as it is, through the `typescript` devDependency the
 * gate already installs: no build step, no new dependency (#63). Each file is transpiled alone,
 * so an import used only as a type is dropped, as Babel drops it in the app.
 */
const fs = require('node:fs');
const ts = require('typescript');

const OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
};

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const {outputText} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: OPTIONS,
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}

/**
 * A shared package by its name, as the plugins' tsconfig `paths` map it: `@supernote-tools/<name>`
 * is `packages/<name>/src`, so a plugin constant that imports one loads here too (#183).
 */
const Module = require('node:module');
const path = require('node:path');

const PACKAGES = path.resolve(__dirname, '../../../packages');
const SCOPE = '@supernote-tools/';
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith(SCOPE)) {
    const [name, ...sub] = request.slice(SCOPE.length).split('/');
    const target = path.join(PACKAGES, name, 'src', ...sub);
    return resolve.call(this, path.join(target, sub.length ? '' : 'index.ts'), ...rest);
  }
  return resolve.call(this, request, ...rest);
};
