'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_START_MARKER = '// BEGIN GENERATED BOOTSTRAP PROTOCOL';
const SOURCE_END_MARKER = '// END GENERATED BOOTSTRAP PROTOCOL';
const SOURCE_PATH = path.resolve(__dirname, '../src/bootstrap/BootstrapProtocol.ts');
const PROTOCOL_SOURCE_PATH = path.resolve(__dirname, '../src/protocol/ReporterProtocol.ts');
const TARGET_PATH = path.resolve(__dirname, '../../rush-lib/src/scripts/generated/BootstrapProtocol.ts');

function renderGeneratedFile() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
  const protocolSource = fs.readFileSync(PROTOCOL_SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(SOURCE_START_MARKER);
  const endIndex = source.indexOf(SOURCE_END_MARKER);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`Unable to find the generated bootstrap protocol markers in ${SOURCE_PATH}.`);
  }

  const generatedSource = source.slice(startIndex + SOURCE_START_MARKER.length, endIndex).trim();
  if (/^\s*import\b/m.test(generatedSource) || /\brequire\s*\(/.test(generatedSource)) {
    throw new Error('The generated bootstrap protocol must not contain imports or require() calls.');
  }

  const bootstrapMajorMatch = generatedSource.match(/export const BOOTSTRAP_PROTOCOL_MAJOR: number = (\d+);/);
  const reporterMajorMatch = protocolSource.match(/REPORTER_PROTOCOL_VERSION:[^=]+=\s*\{\s*major:\s*(\d+),/);
  if (!bootstrapMajorMatch || !reporterMajorMatch) {
    throw new Error('Unable to read the bootstrap and reporter protocol-major constants.');
  }
  if (bootstrapMajorMatch[1] !== reporterMajorMatch[1]) {
    throw new Error(
      `BOOTSTRAP_PROTOCOL_MAJOR (${bootstrapMajorMatch[1]}) must match ` +
        `REPORTER_PROTOCOL_VERSION.major (${reporterMajorMatch[1]}).`
    );
  }

  return [
    '// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.',
    '// See LICENSE in the project root for license information.',
    '',
    '// THIS FILE IS GENERATED. Run "rushx generate-bootstrap-protocol" in libraries/reporter to update it.',
    '// Sources: libraries/reporter/src/bootstrap/BootstrapProtocol.ts',
    '//          libraries/reporter/src/protocol/ReporterProtocol.ts',
    '',
    generatedSource,
    ''
  ].join('\n');
}

function writeGeneratedFile() {
  fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
  fs.writeFileSync(TARGET_PATH, renderGeneratedFile(), 'utf8');
}

function checkGeneratedFile() {
  const expected = renderGeneratedFile();
  let actual;
  try {
    actual = fs.readFileSync(TARGET_PATH, 'utf8').replace(/\r\n/g, '\n');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(
        `The generated bootstrap protocol is missing at ${TARGET_PATH}. ` +
          'Run "rushx generate-bootstrap-protocol" in libraries/reporter.'
      );
    }
    throw error;
  }

  if (actual !== expected) {
    throw new Error(
      `The generated bootstrap protocol is stale at ${TARGET_PATH}. ` +
        'Run "rushx generate-bootstrap-protocol" in libraries/reporter.'
    );
  }
}

module.exports = {
  runAsync: async ({
    heftTaskSession: {
      logger: { terminal }
    }
  }) => {
    checkGeneratedFile();
    terminal.writeVerboseLine('The generated install-run-rush bootstrap protocol is up to date.');
  }
};

if (require.main === module) {
  try {
    const mode = process.argv[2];
    if (mode === '--write') {
      writeGeneratedFile();
    } else if (mode === '--check') {
      checkGeneratedFile();
    } else {
      throw new Error('Specify either --write or --check.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
