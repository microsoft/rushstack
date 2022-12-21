// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT - do not use any non-built-in libraries in this file

import * as fs from 'fs';
import * as path from 'path';

export interface ILogger {
  info: (string: string) => void;
  error: (string: string) => void;
}

/**
 * As a workaround, copyAndTrimNpmrcFile() copies the .npmrc file to the target folder, and also trims
 * unusable lines from the .npmrc file.
 *
 * Why are we trimming the .npmrc lines?  NPM allows environment variables to be specified in
 * the .npmrc file to provide different authentication tokens for different registry.
 * However, if the environment variable is undefined, it expands to an empty string, which
 * produces a valid-looking mapping with an invalid URL that causes an error.  Instead,
 * we'd prefer to skip that line and continue looking in other places such as the user's
 * home directory.
 *
 * @returns
 * The text of the the .npmrc.
 */
function _copyAndTrimNpmrcFile(logger: ILogger, sourceNpmrcPath: string, targetNpmrcPath: string): string {
  logger.info(`Transforming ${sourceNpmrcPath}`); // Verbose
  logger.info(`  --> "${targetNpmrcPath}"`);
  let npmrcFileLines: string[] = fs.readFileSync(sourceNpmrcPath).toString().split('\n');
  npmrcFileLines = npmrcFileLines.map((line) => (line || '').trim());
  const resultLines: string[] = [];

  // This finds environment variable tokens that look like "${VAR_NAME}"
  const expansionRegExp: RegExp = /\$\{([^\}]+)\}/g;

  // Comment lines start with "#" or ";"
  const commentRegExp: RegExp = /^\s*[#;]/;

  // Trim out lines that reference environment variables that aren't defined
  for (const line of npmrcFileLines) {
    let lineShouldBeTrimmed: boolean = false;

    // Ignore comment lines
    if (!commentRegExp.test(line)) {
      const environmentVariables: string[] | null = line.match(expansionRegExp);
      if (environmentVariables) {
        for (const token of environmentVariables) {
          // Remove the leading "${" and the trailing "}" from the token
          const environmentVariableName: string = token.substring(2, token.length - 1);

          // Is the environment variable defined?
          if (!process.env[environmentVariableName]) {
            // No, so trim this line
            lineShouldBeTrimmed = true;
            break;
          }
        }
      }
    }

    if (lineShouldBeTrimmed) {
      // Example output:
      // "; MISSING ENVIRONMENT VARIABLE: //my-registry.com/npm/:_authToken=${MY_AUTH_TOKEN}"
      resultLines.push('; MISSING ENVIRONMENT VARIABLE: ' + line);
    } else {
      resultLines.push(line);
    }
  }

  const combinedNpmrc: string = resultLines.join('\n');
  fs.writeFileSync(targetNpmrcPath, combinedNpmrc);

  return combinedNpmrc;
}

/**
 * syncNpmrc() copies the .npmrc file to the target folder, and also trims unusable lines from the .npmrc file.
 * If the source .npmrc file not exist, then syncNpmrc() will delete an .npmrc that is found in the target folder.
 *
 * IMPORTANT: THIS CODE SHOULD BE KEPT UP TO DATE WITH Utilities._syncNpmrc()
 *
 * @returns
 * The text of the the synced .npmrc, if one exists. If one does not exist, then undefined is returned.
 */
export function syncNpmrc(
  sourceNpmrcFolder: string,
  targetNpmrcFolder: string,
  useNpmrcPublish?: boolean,
  logger: ILogger = {
    info: console.log,
    error: console.error
  }
): string | undefined {
  const sourceNpmrcPath: string = path.join(
    sourceNpmrcFolder,
    !useNpmrcPublish ? '.npmrc' : '.npmrc-publish'
  );
  const targetNpmrcPath: string = path.join(targetNpmrcFolder, '.npmrc');
  try {
    if (fs.existsSync(sourceNpmrcPath)) {
      return _copyAndTrimNpmrcFile(logger, sourceNpmrcPath, targetNpmrcPath);
    } else if (fs.existsSync(targetNpmrcPath)) {
      // If the source .npmrc doesn't exist and there is one in the target, delete the one in the target
      logger.info(`Deleting ${targetNpmrcPath}`); // Verbose
      fs.unlinkSync(targetNpmrcPath);
    }
  } catch (e) {
    throw new Error(`Error syncing .npmrc file: ${e}`);
  }
}
