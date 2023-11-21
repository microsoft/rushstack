#!/usr/bin/env node

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findPatchPath() {
  let eslintrcPath;
  if (fs.existsSync(path.join(process.cwd(), '.eslintrc.js'))) {
    eslintrcPath = '.eslintrc.js';
  } else if (fs.existsSync(path.join(process.cwd(), '.eslintrc.cjs'))) {
    eslintrcPath = '.eslintrc.cjs';
  } else {
    console.error(
      '@rushstack/eslint-bulk: Please run this command from the directory that contains .eslintrc.js or .eslintrc.cjs'
    );
    process.exit(1);
  }

  const env = { ...process.env, ESLINT_BULK_FIND: 'true' };

  let stdout;
  try {
    stdout = execSync(`echo "" | eslint --stdin --config ${eslintrcPath}`, { env, stdio: 'pipe' });
  } catch (e) {
    console.error('@rushstack/eslint-bulk: Error finding patch path: ' + e.message);
    process.exit(1);
  }

  const startDelimiter = 'ESLINT_BULK_STDOUT_START';
  const endDelimiter = 'ESLINT_BULK_STDOUT_END';

  const regex = new RegExp(`${startDelimiter}(.*?)${endDelimiter}`);
  const match = stdout.toString().match(regex);

  if (match) {
    const filePath = match[1].trim();
    return filePath;
  }

  console.error(
    '@rushstack/eslint-bulk: Error finding patch path. Are you sure the package you are in has @rushstack/eslint-patch as a direct or indirect dependency?'
  );
  process.exit(1);
}

const patchPath = findPatchPath();
try {
  const args = process.argv.slice(2).join(' ');
  const command = `node ${patchPath} ${args}`;
  execSync(command, { stdio: 'inherit' });
} catch (e) {
  console.error(`@rushstack/eslint-bulk: Error running patch at ${patchPath}:\n` + e.message);
  process.exit(1);
}
