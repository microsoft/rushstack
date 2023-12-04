// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execSync } from 'child_process';
import * as process from 'process';
import * as fs from 'fs';
import * as path from 'path';

interface IEslintBulkConfigurationJson {
  /**
   * `@rushtack/eslint`-bulk should report an error if its package.json is older than this number
   */
  minCliVersion: string;
  /**
   * `@rushtack/eslint-bulk` will invoke this entry point
   */
  cliEntryPoint: string;
}

function findPatchPath(): string {
  let eslintrcPath: string;
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

  const env: NodeJS.ProcessEnv = { ...process.env, _RUSHSTACK_ESLINT_BULK_DETECT: 'true' };

  let stdout: Buffer;
  try {
    stdout = execSync(`eslint --stdin --config ${eslintrcPath}`, { env, input: '', stdio: 'pipe' });
  } catch (e) {
    console.error('@rushstack/eslint-bulk: Error finding patch path: ' + e.message);
    process.exit(1);
  }

  const startDelimiter: string = 'RUSHSTACK_ESLINT_BULK_START';
  const endDelimiter: string = 'RUSHSTACK_ESLINT_BULK_END';

  const regex: RegExp = new RegExp(`${startDelimiter}(.*?)${endDelimiter}`);
  const match: RegExpMatchArray | null = stdout.toString().match(regex);

  if (match) {
    // The configuration data will look something like this:
    //
    // RUSHSTACK_ESLINT_BULK_START{"minCliVersion":"0.0.0","cliEntryPoint":"path/to/eslint-bulk.js"}RUSHSTACK_ESLINT_BULK_END
    const configurationJson: string = match[1].trim();
    let configuration: IEslintBulkConfigurationJson;
    try {
      configuration = JSON.parse(configurationJson);
      if (!configuration.minCliVersion || !configuration.cliEntryPoint) {
        throw new Error('Required field is missing');
      }
    } catch (e) {
      console.error('@rushstack/eslint-bulk: Error parsing patch configuration object:' + e.message);
      process.exit(1);
    }

    const myVersion: string = require('../package.json').version;
    const myVersionParts: number[] = myVersion.split('.').map((x) => parseInt(x, 10));
    const minVersion: string = configuration.minCliVersion;
    const minVersionParts: number[] = minVersion.split('.').map((x) => parseInt(x, 10));
    if (
      myVersionParts.length !== 3 ||
      minVersionParts.length !== 3 ||
      myVersionParts.some((x) => isNaN(x)) ||
      minVersionParts.some((x) => isNaN(x))
    ) {
      console.error(`@rushstack/eslint-bulk: Unable to compare versions "${myVersion}" and "${minVersion}"`);
      process.exit(1);
    }

    for (let i: number = 0; i < 3; ++i) {
      if (myVersionParts[i] > minVersionParts[i]) {
        break;
      }
      if (myVersionParts[i] < minVersionParts[i]) {
        console.error(
          `@rushstack/eslint-bulk: The @rushstack/eslint-bulk version ${myVersion} is too old;` +
            ` please upgrade to ${minVersion} or newer.`
        );
        process.exit(1);
      }
    }

    return configuration.cliEntryPoint;
  }

  console.error(
    '@rushstack/eslint-bulk: Error finding patch path. Are you sure the package you are in has @rushstack/eslint-patch as a direct or indirect dependency?'
  );
  process.exit(1);
}

const patchPath: string = findPatchPath();
try {
  const args: string = process.argv.slice(2).join(' ');
  const command: string = `node ${patchPath} ${args}`;
  execSync(command, { stdio: 'inherit' });
} catch (e) {
  console.error(`@rushstack/eslint-bulk: Error running patch at ${patchPath}:\n` + e.message);
  process.exit(1);
}
