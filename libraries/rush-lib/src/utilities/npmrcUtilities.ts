// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT - do not use any non-built-in libraries in this file

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ILogger {
  info: (string: string) => void;
  error: (string: string) => void;
}

/**
 * This function reads the content for given .npmrc file path, and also trims
 * unusable lines from the .npmrc file.
 *
 * @returns
 * The text of the the .npmrc.
 */

// create a global _combinedNpmrc for cache purpose
const _combinedNpmrcMap: Map<string, string> = new Map();

function _trimNpmrcFile(
  options: Pick<
    INpmrcTrimOptions,
    'sourceNpmrcPath' | 'linesToAppend' | 'linesToPrepend' | 'supportEnvVarFallbackSyntax'
  >
): string {
  const { sourceNpmrcPath, linesToPrepend, linesToAppend, supportEnvVarFallbackSyntax } = options;
  const combinedNpmrcFromCache: string | undefined = _combinedNpmrcMap.get(sourceNpmrcPath);
  if (combinedNpmrcFromCache !== undefined) {
    return combinedNpmrcFromCache;
  }

  let npmrcFileLines: string[] = [];
  if (linesToPrepend) {
    npmrcFileLines.push(...linesToPrepend);
  }

  if (fs.existsSync(sourceNpmrcPath)) {
    npmrcFileLines.push(...fs.readFileSync(sourceNpmrcPath).toString().split('\n'));
  }

  if (linesToAppend) {
    npmrcFileLines.push(...linesToAppend);
  }

  npmrcFileLines = npmrcFileLines.map((line) => (line || '').trim());

  const resultLines: string[] = trimNpmrcFileLines(npmrcFileLines, process.env, supportEnvVarFallbackSyntax);

  const combinedNpmrc: string = resultLines.join('\n');

  //save the cache
  _combinedNpmrcMap.set(sourceNpmrcPath, combinedNpmrc);

  return combinedNpmrc;
}

/**
 *
 * @param npmrcFileLines The npmrc file's lines
 * @param env The environment variables object
 * @param supportEnvVarFallbackSyntax Whether to support fallback values in the form of `${VAR_NAME:-fallback}`
 * @returns
 */
export function trimNpmrcFileLines(
  npmrcFileLines: string[],
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean
): string[] {
  const resultLines: string[] = [];

  // This finds environment variable tokens that look like "${VAR_NAME}"
  const expansionRegExp: RegExp = /\$\{([^\}]+)\}/g;

  // Comment lines start with "#" or ";"
  const commentRegExp: RegExp = /^\s*[#;]/;

  // Trim out lines that reference environment variables that aren't defined
  for (let line of npmrcFileLines) {
    let lineShouldBeTrimmed: boolean = false;

    //remove spaces before or after key and value
    line = line
      .split('=')
      .map((lineToTrim) => lineToTrim.trim())
      .join('=');

    // Ignore comment lines
    if (!commentRegExp.test(line)) {
      const environmentVariables: string[] | null = line.match(expansionRegExp);
      if (environmentVariables) {
        for (const token of environmentVariables) {
          /**
           * Remove the leading "${" and the trailing "}" from the token
           *
           * ${nameString}                  -> nameString
           * ${nameString-fallbackString}   -> name-fallbackString
           * ${nameString:-fallbackString}  -> name:-fallbackString
           */
          const nameWithFallback: string = token.substring(2, token.length - 1);

          let environmentVariableName: string;
          let fallback: string | undefined;
          if (supportEnvVarFallbackSyntax) {
            /**
             * Get the environment variable name and fallback value.
             *
             *                                name          fallback
             * nameString                 ->  nameString    undefined
             * nameString-fallbackString  ->  nameString    fallbackString
             * nameString:-fallbackString ->  nameString    fallbackString
             */
            const matched: string[] | null = nameWithFallback.match(/^([^:-]+)(?:\:?-(.+))?$/);
            // matched: [originStr, variableName, fallback]
            environmentVariableName = matched?.[1] ?? nameWithFallback;
            fallback = matched?.[2];
          } else {
            environmentVariableName = nameWithFallback;
          }

          // Is the environment variable and fallback value defined.
          if (!env[environmentVariableName] && !fallback) {
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

  return resultLines;
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
 * The text of the the .npmrc with lines containing undefined variables commented out.
 */
interface INpmrcTrimOptions {
  sourceNpmrcPath: string;
  targetNpmrcPath: string;
  logger: ILogger;
  linesToPrepend?: string[];
  linesToAppend?: string[];
  supportEnvVarFallbackSyntax: boolean;
}

function _copyAndTrimNpmrcFile(options: INpmrcTrimOptions): string {
  const { logger, sourceNpmrcPath, targetNpmrcPath } = options;
  logger.info(`Transforming ${sourceNpmrcPath}`); // Verbose
  logger.info(`  --> "${targetNpmrcPath}"`);

  const combinedNpmrc: string = _trimNpmrcFile(options);

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
export interface ISyncNpmrcOptions {
  sourceNpmrcFolder: string;
  targetNpmrcFolder: string;
  supportEnvVarFallbackSyntax: boolean;
  useNpmrcPublish?: boolean;
  logger?: ILogger;
  linesToPrepend?: string[];
  linesToAppend?: string[];
  createIfMissing?: boolean;
}

export function syncNpmrc(options: ISyncNpmrcOptions): string | undefined {
  const {
    sourceNpmrcFolder,
    targetNpmrcFolder,
    useNpmrcPublish,
    logger = {
      // eslint-disable-next-line no-console
      info: console.log,
      // eslint-disable-next-line no-console
      error: console.error
    },
    createIfMissing = false
  } = options;
  const sourceNpmrcPath: string = path.join(
    sourceNpmrcFolder,
    !useNpmrcPublish ? '.npmrc' : '.npmrc-publish'
  );
  const targetNpmrcPath: string = path.join(targetNpmrcFolder, '.npmrc');
  try {
    if (fs.existsSync(sourceNpmrcPath) || createIfMissing) {
      // Ensure the target folder exists
      if (!fs.existsSync(targetNpmrcFolder)) {
        fs.mkdirSync(targetNpmrcFolder, { recursive: true });
      }

      return _copyAndTrimNpmrcFile({
        sourceNpmrcPath,
        targetNpmrcPath,
        logger,
        ...options
      });
    } else if (fs.existsSync(targetNpmrcPath)) {
      // If the source .npmrc doesn't exist and there is one in the target, delete the one in the target
      logger.info(`Deleting ${targetNpmrcPath}`); // Verbose
      fs.unlinkSync(targetNpmrcPath);
    }
  } catch (e) {
    throw new Error(`Error syncing .npmrc file: ${e}`);
  }
}

export function isVariableSetInNpmrcFile(
  sourceNpmrcFolder: string,
  variableKey: string,
  supportEnvVarFallbackSyntax: boolean
): boolean {
  const sourceNpmrcPath: string = `${sourceNpmrcFolder}/.npmrc`;

  //if .npmrc file does not exist, return false directly
  if (!fs.existsSync(sourceNpmrcPath)) {
    return false;
  }

  const trimmedNpmrcFile: string = _trimNpmrcFile({ sourceNpmrcPath, supportEnvVarFallbackSyntax });

  const variableKeyRegExp: RegExp = new RegExp(`^${variableKey}=`, 'm');
  return trimmedNpmrcFile.match(variableKeyRegExp) !== null;
}
