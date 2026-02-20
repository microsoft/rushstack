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

function _trimNpmrcFile(
  options: Pick<
    INpmrcTrimOptions,
    | 'sourceNpmrcPath'
    | 'linesToAppend'
    | 'linesToPrepend'
    | 'supportEnvVarFallbackSyntax'
    | 'filterNpmIncompatibleProperties'
    | 'env'
  >
): string {
  const {
    sourceNpmrcPath,
    linesToPrepend,
    linesToAppend,
    supportEnvVarFallbackSyntax,
    filterNpmIncompatibleProperties,
    env = process.env
  } = options;

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

  const resultLines: string[] = trimNpmrcFileLines(
    npmrcFileLines,
    env,
    supportEnvVarFallbackSyntax,
    filterNpmIncompatibleProperties
  );

  const combinedNpmrc: string = resultLines.join('\n');

  return combinedNpmrc;
}

/**
 * List of npmrc properties that are not supported by npm but may be present in the config.
 * These include pnpm-specific properties and deprecated npm properties.
 */
const NPM_INCOMPATIBLE_PROPERTIES: Set<string> = new Set([
  // pnpm-specific hoisting configuration
  'hoist',
  'hoist-pattern',
  'public-hoist-pattern',
  'shamefully-hoist',
  // Deprecated or unknown npm properties that cause warnings
  'email',
  'publish-branch'
]);

/**
 * List of registry-scoped npmrc property suffixes that are pnpm-specific.
 * These are properties like "//registry.example.com/:tokenHelper" where "tokenHelper"
 * is the suffix after the last colon.
 */
const NPM_INCOMPATIBLE_REGISTRY_SCOPED_PROPERTIES: Set<string> = new Set([
  // pnpm-specific token helper properties
  'tokenHelper',
  'urlTokenHelper'
]);

/**
 * Regular expression to extract property names from .npmrc lines.
 * Matches everything before '=', '[', or whitespace to capture the property name.
 * Note: The 'g' flag is intentionally omitted since we only need the first match.
 * Examples:
 *   "registry=https://..." -> matches "registry"
 *   "hoist-pattern[]=..." -> matches "hoist-pattern"
 */
const PROPERTY_NAME_REGEX: RegExp = /^([^=\[\s]+)/;

/**
 * Regular expression to extract environment variable names and optional fallback values.
 * Matches patterns like:
 *   nameString                 -> group 1: nameString,    group 2: undefined
 *   nameString-fallbackString  -> group 1: nameString,    group 2: fallbackString
 *   nameString:-fallbackString -> group 1: nameString,    group 2: fallbackString
 */
const ENV_VAR_WITH_FALLBACK_REGEX: RegExp = /^(?<name>[^:-]+)(?::?-(?<fallback>.+))?$/;

/**
 *
 * @param npmrcFileLines The npmrc file's lines
 * @param env The environment variables object
 * @param supportEnvVarFallbackSyntax Whether to support fallback values in the form of `${VAR_NAME:-fallback}`
 * @param filterNpmIncompatibleProperties Whether to filter out properties that npm doesn't understand
 * @returns An array of processed npmrc file lines with undefined environment variables and npm-incompatible properties commented out
 */
export function trimNpmrcFileLines(
  npmrcFileLines: string[],
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean,
  filterNpmIncompatibleProperties: boolean = false
): string[] {
  const resultLines: string[] = [];

  // This finds environment variable tokens that look like "${VAR_NAME}"
  const expansionRegExp: RegExp = /\$\{([^\}]+)\}/g;

  // Comment lines start with "#" or ";"
  const commentRegExp: RegExp = /^\s*[#;]/;

  // Trim out lines that reference environment variables that aren't defined
  for (let line of npmrcFileLines) {
    let lineShouldBeTrimmed: boolean = false;
    let trimReason: string = '';

    //remove spaces before or after key and value
    line = line
      .split('=')
      .map((lineToTrim) => lineToTrim.trim())
      .join('=');

    // Ignore comment lines
    if (!commentRegExp.test(line)) {
      // Check if this is a property that npm doesn't understand
      if (filterNpmIncompatibleProperties) {
        // Extract the property name (everything before the '=' or '[')
        const match: RegExpMatchArray | null = line.match(PROPERTY_NAME_REGEX);
        if (match) {
          const propertyName: string = match[1];

          // Check if this is a registry-scoped property (starts with "//" like "//registry.npmjs.org/:_authToken")
          const isRegistryScoped: boolean = propertyName.startsWith('//');

          if (isRegistryScoped) {
            // For registry-scoped properties, check if the suffix (after the last colon) is npm-incompatible
            // Example: "//registry.example.com/:tokenHelper" -> suffix is "tokenHelper"
            const lastColonIndex: number = propertyName.lastIndexOf(':');
            if (lastColonIndex !== -1) {
              const registryPropertySuffix: string = propertyName.substring(lastColonIndex + 1);
              if (NPM_INCOMPATIBLE_REGISTRY_SCOPED_PROPERTIES.has(registryPropertySuffix)) {
                lineShouldBeTrimmed = true;
                trimReason = 'NPM_INCOMPATIBLE_PROPERTY';
              }
            }
          } else {
            // For non-registry-scoped properties, check the full property name
            if (NPM_INCOMPATIBLE_PROPERTIES.has(propertyName)) {
              lineShouldBeTrimmed = true;
              trimReason = 'NPM_INCOMPATIBLE_PROPERTY';
            }
          }
        }
      }

      // Check for undefined environment variables
      if (!lineShouldBeTrimmed) {
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
            const nameWithFallback: string = token.slice(2, -1);

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
              const matched: RegExpMatchArray | null = nameWithFallback.match(ENV_VAR_WITH_FALLBACK_REGEX);
              environmentVariableName = matched?.groups?.name ?? nameWithFallback;
              fallback = matched?.groups?.fallback;
            } else {
              environmentVariableName = nameWithFallback;
            }

            // Is the environment variable and fallback value defined.
            if (!env[environmentVariableName] && !fallback) {
              // No, so trim this line
              lineShouldBeTrimmed = true;
              trimReason = 'MISSING_ENVIRONMENT_VARIABLE';
              break;
            }
          }
        }
      }
    }

    if (lineShouldBeTrimmed) {
      // Comment out the line with appropriate reason
      if (trimReason === 'NPM_INCOMPATIBLE_PROPERTY') {
        // Example output:
        // "; UNSUPPORTED BY NPM: email=test@example.com"
        resultLines.push('; UNSUPPORTED BY NPM: ' + line);
      } else {
        // Example output:
        // "; MISSING ENVIRONMENT VARIABLE: //my-registry.com/npm/:_authToken=${MY_AUTH_TOKEN}"
        resultLines.push('; MISSING ENVIRONMENT VARIABLE: ' + line);
      }
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
  filterNpmIncompatibleProperties?: boolean;
  env?: NodeJS.ProcessEnv;
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
  filterNpmIncompatibleProperties?: boolean;
  env?: NodeJS.ProcessEnv;
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

  const trimmedNpmrcFile: string = _trimNpmrcFile({
    sourceNpmrcPath,
    supportEnvVarFallbackSyntax,
    filterNpmIncompatibleProperties: false
  });

  const variableKeyRegExp: RegExp = new RegExp(`^${variableKey}=`, 'm');
  return trimmedNpmrcFile.match(variableKeyRegExp) !== null;
}
