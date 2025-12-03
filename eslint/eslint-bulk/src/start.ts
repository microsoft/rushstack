// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type ExecSyncOptionsWithBufferEncoding,
  type SpawnSyncOptionsWithBufferEncoding,
  execSync,
  spawnSync
} from 'node:child_process';
import * as process from 'node:process';
import * as fs from 'node:fs';

import type {
  ESLINT_BULK_STDOUT_START_DELIMETER as ESLINT_BULK_STDOUT_START_DELIMETER_TYPE,
  ESLINT_BULK_STDOUT_END_DELIMETER as ESLINT_BULK_STDOUT_END_DELIMETER_TYPE,
  ESLINT_PACKAGE_NAME_ENV_VAR_NAME as ESLINT_PACKAGE_NAME_ENV_VAR_NAME_TYPE
} from '@rushstack/eslint-patch/lib/eslint-bulk-suppressions/constants';

const ESLINT_BULK_STDOUT_START_DELIMETER: typeof ESLINT_BULK_STDOUT_START_DELIMETER_TYPE =
  'RUSHSTACK_ESLINT_BULK_START';
const ESLINT_BULK_STDOUT_END_DELIMETER: typeof ESLINT_BULK_STDOUT_END_DELIMETER_TYPE =
  'RUSHSTACK_ESLINT_BULK_END';
const ESLINT_PACKAGE_NAME_ENV_VAR_NAME: typeof ESLINT_PACKAGE_NAME_ENV_VAR_NAME_TYPE =
  '_RUSHSTACK_ESLINT_PACKAGE_NAME';
const BULK_SUPPRESSIONS_CLI_ESLINT_PACKAGE_NAME: string =
  process.env[ESLINT_PACKAGE_NAME_ENV_VAR_NAME] ?? 'eslint';

const ESLINT_CONFIG_FILES: string[] = [
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  '.eslintrc.js',
  '.eslintrc.cjs'
];

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
  const candidatePaths: string[] = ESLINT_CONFIG_FILES.map((fileName) => `${process.cwd()}/${fileName}`);
  let eslintConfigPath: string | undefined;
  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      eslintConfigPath = candidatePath;
      break;
    }
  }

  if (!eslintConfigPath) {
    console.error(
      '@rushstack/eslint-bulk: Please run this command from the directory that contains one of the following ' +
        `ESLint configuration files: ${ESLINT_CONFIG_FILES.join(', ')}`
    );
    process.exit(1);
  }

  const env: NodeJS.ProcessEnv = { ...process.env, _RUSHSTACK_ESLINT_BULK_DETECT: 'true' };

  let eslintPackageJsonPath: string | undefined;
  try {
    eslintPackageJsonPath = require.resolve(`${BULK_SUPPRESSIONS_CLI_ESLINT_PACKAGE_NAME}/package.json`, {
      paths: [process.cwd()]
    });
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }

  let eslintBinPath: string | undefined;
  if (eslintPackageJsonPath) {
    eslintPackageJsonPath = eslintPackageJsonPath.replace(/\\/g, '/');
    const packagePath: string = eslintPackageJsonPath.substring(0, eslintPackageJsonPath.lastIndexOf('/'));
    const { bin: { eslint: relativeEslintBinPath } = {} }: { bin?: Record<string, string> } = require(
      eslintPackageJsonPath
    );
    if (relativeEslintBinPath) {
      eslintBinPath = `${packagePath}/${relativeEslintBinPath}`;
    } else {
      console.warn(
        `@rushstack/eslint-bulk: The eslint package resolved at "${packagePath}" does not contain an eslint bin path. ` +
          'Attempting to use a globally-installed eslint instead.'
      );
    }
  } else {
    console.log(
      '@rushstack/eslint-bulk: Unable to resolve the eslint package as a dependency of the current project. ' +
        'Attempting to use a globally-installed eslint instead.'
    );
  }

  const eslintArgs: string[] = ['--stdin', '--config'];
  const spawnOrExecOptions: SpawnSyncOptionsWithBufferEncoding & ExecSyncOptionsWithBufferEncoding = {
    env,
    input: '',
    stdio: 'pipe'
  };
  let runEslintFn: () => Buffer;
  if (eslintBinPath) {
    runEslintFn = () =>
      spawnSync(process.argv0, [eslintBinPath, ...eslintArgs, eslintConfigPath], spawnOrExecOptions).stdout;
  } else {
    // Try to use a globally-installed eslint if a local package was not found
    runEslintFn = () => execSync(`eslint ${eslintArgs.join(' ')} "${eslintConfigPath}"`, spawnOrExecOptions);
  }

  let stdout: Buffer;
  try {
    stdout = runEslintFn();
  } catch (e) {
    console.error('@rushstack/eslint-bulk: Error finding patch path: ' + e.message);
    process.exit(1);
  }

  const regex: RegExp = new RegExp(
    `${ESLINT_BULK_STDOUT_START_DELIMETER}(.*?)${ESLINT_BULK_STDOUT_END_DELIMETER}`
  );
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
  require(patchPath);
} catch (e) {
  console.error(`@rushstack/eslint-bulk: Error running patch at ${patchPath}:\n` + e.message);
  process.exit(1);
}
