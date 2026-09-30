// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

'use strict';

// A Heft "run-script-plugin" script that rewrites a TypeScript-emitted CommonJS barrel
// (lib-commonjs/index.js by default) so that each re-exported module is only loaded when one of
// its exports is first accessed.
//
// Only the `var X_1 = require("./X");` lines are changed. The `exports.A = ... = void 0;` lines and the
// `Object.defineProperty(exports, "A", { enumerable: true, get: function () { return X_1.A; } });` lines are
// kept as emitted, so the export names, property attributes and values are identical, and Node.js can still
// detect the named exports for ESM importers. Any line that does not match the expected TypeScript output
// fails the build rather than producing a partially transformed barrel.

const fs = require('node:fs');
const path = require('node:path');

const MARKER = '__lazyBarrelRequire';

const REQUIRE_LINE_REGEXP = /^var ([A-Za-z_$][\w$]*) = require\(("\.{1,2}\/[^"]+")\);$/;
const ALLOWED_LINE_REGEXPS = [
  /^$/,
  /^"use strict";$/,
  /^\/\/.*$/,
  /^\s*\/?\*.*$/,
  /^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);$/,
  /^exports\.[A-Za-z_$][\w$]*( = exports\.[A-Za-z_$][\w$]*)* = void 0;$/,
  /^Object\.defineProperty\(exports, "[A-Za-z_$][\w$]*", \{ enumerable: true, get: function \(\) \{ return [A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*; \} \}\);$/
];

const HELPER =
  `function ${MARKER}(load) { var m; ` +
  'return new Proxy({}, { get: function (_target, key) { return (m || (m = load()))[key]; } }); }';

/**
 * @param {string} source - the emitted CommonJS barrel
 * @param {string} filePath - used in error messages
 * @returns {string} the lazy barrel
 */
function transformBarrel(source, filePath) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  let sourceMapLineIndex = -1;
  let requireCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const requireMatch = REQUIRE_LINE_REGEXP.exec(line);
    if (requireMatch) {
      lines[i] = `var ${requireMatch[1]} = ${MARKER}(function () { return require(${requireMatch[2]}); });`;
      requireCount++;
    } else if (line.startsWith('//# sourceMappingURL=')) {
      sourceMapLineIndex = i;
    } else if (!ALLOWED_LINE_REGEXPS.some((regexp) => regexp.test(line))) {
      throw new Error(`${filePath}:${i + 1}: unexpected line in the barrel, cannot make it lazy: ${line}`);
    }
  }

  if (requireCount === 0) {
    return source;
  }

  // Function declarations are hoisted, so the helper can be placed at the end of the file.
  // Keeping all other lines in place keeps the existing source map line numbers valid.
  if (sourceMapLineIndex >= 0) {
    lines.splice(sourceMapLineIndex, 0, HELPER);
  } else {
    lines.push(HELPER);
  }
  return lines.join(newline);
}

async function runAsync({ heftConfiguration, heftTaskSession, scriptOptions }) {
  const barrelPaths = (scriptOptions && scriptOptions.barrels) || ['lib-commonjs/index.js'];
  for (const barrelPath of barrelPaths) {
    const filePath = path.resolve(heftConfiguration.buildFolderPath, barrelPath);
    const source = await fs.promises.readFile(filePath, 'utf8');
    if (source.includes(MARKER)) {
      // Already transformed (for example, TypeScript did not re-emit the file in an incremental build)
      continue;
    }

    const result = transformBarrel(source, filePath);
    if (result !== source) {
      await fs.promises.writeFile(filePath, result, 'utf8');
      heftTaskSession.logger.terminal.writeVerboseLine(`Made ${barrelPath} lazy`);
    }
  }
}

exports.runAsync = runAsync;
exports.transformBarrel = transformBarrel;
