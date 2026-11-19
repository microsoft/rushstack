// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT - do not use any non-built-in libraries in this file

import * as fs from 'node:fs';
import * as path from 'node:path';

export type LogPrivacyClassification = 'public' | 'local-sensitive';

export interface ILogger {
  info: (text: string, privacy?: LogPrivacyClassification) => void;
  error: (text: string, privacy?: LogPrivacyClassification) => void;
  warning?: (text: string, privacy?: LogPrivacyClassification) => void;
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
    | 'moveSensitiveSettingsToEnvironment'
    | 'environmentVariableSettingNames'
    | 'env'
  >
): string {
  const {
    sourceNpmrcPath,
    linesToPrepend,
    linesToAppend,
    supportEnvVarFallbackSyntax,
    filterNpmIncompatibleProperties,
    moveSensitiveSettingsToEnvironment,
    environmentVariableSettingNames,
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
    filterNpmIncompatibleProperties,
    moveSensitiveSettingsToEnvironment,
    environmentVariableSettingNames
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

// Matches an environment variable reference such as "${NPM_TOKEN}" anywhere in a setting.
const ENVIRONMENT_VARIABLE_DETECTION_REGEX: RegExp = /\$\{[^\}]+\}/;

/**
 * The comment marker that is written in place of an .npmrc setting whose value was moved into an
 * `npm_config_*` environment variable. The remainder of the line is the original (unexpanded)
 * setting, so that the secret itself never gets written to disk.
 *
 * @remarks
 * See {@link getNpmrcEnvironmentVariables} for the code that reads these lines back.
 */
const PROVIDED_VIA_ENVIRONMENT_PREFIX: string = '; PROVIDED VIA ENVIRONMENT: ';

/**
 * The names of .npmrc settings that PNPM considers to be credentials. They may appear either
 * as a bare setting name (`_authToken=...`) or scoped to a registry URI
 * (`//registry.example.com/:_authToken=...`).
 *
 * @remarks
 * This list mirrors PNPM's own list; PNPM 10.34.2 and newer refuse to expand `${VAR}` tokens in
 * these settings when they come from a project or workspace .npmrc file.
 */
const AUTH_VALUE_SETTING_NAMES: Set<string> = new Set([
  '_authToken',
  '_auth',
  '_password',
  'username',
  'tokenHelper',
  'cert',
  'key'
]);

/**
 * The names of .npmrc settings that determine where PNPM sends a request. PNPM 10.34.2 and newer
 * refuse to expand `${VAR}` tokens in these settings when they come from a project or workspace
 * .npmrc file, because a compromised value could redirect a request (and its credentials) to an
 * attacker-controlled server.
 */
const REQUEST_DESTINATION_SETTING_NAMES: Set<string> = new Set([
  'registry',
  'proxy',
  'http-proxy',
  'https-proxy'
]);

function _isRegistrySettingName(settingName: string): boolean {
  return settingName === 'registry' || (settingName.startsWith('@') && settingName.endsWith(':registry'));
}

/**
 * Returns true if PNPM treats the setting's value as a credential.
 */
function _isAuthValueSettingName(settingName: string): boolean {
  if (AUTH_VALUE_SETTING_NAMES.has(settingName)) {
    return true;
  }

  // Example: "//registry.example.com/:_authToken" --> "_authToken"
  const lastColonIndex: number = settingName.lastIndexOf(':');
  return lastColonIndex >= 0 && AUTH_VALUE_SETTING_NAMES.has(settingName.substring(lastColonIndex + 1));
}

/**
 * Returns true if PNPM refuses to expand environment variables that appear in the setting's NAME.
 */
function _isRequestDestinationSettingName(settingName: string): boolean {
  return _isRegistrySettingName(settingName) || settingName.startsWith('//');
}

/**
 * Returns true if PNPM refuses to expand environment variables that appear in the setting's VALUE.
 */
function _isRequestDestinationValueSettingName(settingName: string): boolean {
  return _isRegistrySettingName(settingName) || REQUEST_DESTINATION_SETTING_NAMES.has(settingName);
}

interface IParsedNpmrcSetting {
  line: string;
  name: string;
  value: string;
}

function _tryParseNpmrcSetting(line: string): IParsedNpmrcSetting | undefined {
  const equalsIndex: number = line.indexOf('=');
  if (equalsIndex < 0) {
    return undefined;
  }

  return {
    line,
    name: line.substring(0, equalsIndex),
    value: line.substring(equalsIndex + 1)
  };
}

function _hasIgnoredEnvironmentVariable(setting: IParsedNpmrcSetting): boolean {
  const { name, value } = setting;
  return (
    (ENVIRONMENT_VARIABLE_DETECTION_REGEX.test(name) &&
      (_isRequestDestinationSettingName(name) || _isAuthValueSettingName(name))) ||
    (ENVIRONMENT_VARIABLE_DETECTION_REGEX.test(value) &&
      (_isRequestDestinationValueSettingName(name) || _isAuthValueSettingName(name)))
  );
}

/**
 * Reproduces PNPM's `envKeyToSetting()`, which converts the portion of an `npm_config_*` environment
 * variable name that follows the prefix back into an .npmrc setting name.
 */
function _environmentVariableSuffixToSettingName(suffix: string): string {
  const colonIndex: number = suffix.indexOf(':');
  if (colonIndex === -1) {
    return _normalizeSettingNamePart(suffix);
  }

  return `${suffix.substring(0, colonIndex)}:${_normalizeSettingNamePart(suffix.substring(colonIndex + 1))}`;
}

function _normalizeSettingNamePart(settingNamePart: string): string {
  const lowerCased: string = settingNamePart.toLowerCase();
  if (lowerCased === '_authtoken') {
    return '_authToken';
  }

  // Underscores become dashes, except for a leading underscore
  return lowerCased.charAt(0) + lowerCased.substring(1).replace(/_/g, '-');
}

/**
 * Returns true if the setting can be expressed as an `npm_config_*` environment variable without
 * being mangled by PNPM's name normalization.
 *
 * @remarks
 * For example, a registry URL that includes an explicit port such as
 * `//registry.example.com:8080/:_authToken` cannot round-trip, because PNPM splits the name on its
 * FIRST colon and then normalizes everything after it.
 */
function _canSettingRoundTripThroughEnvironmentVariable(settingName: string): boolean {
  return _environmentVariableSuffixToSettingName(settingName) === settingName;
}

interface IEnvironmentVariableExpansionResult {
  /**
   * The text with all `${VAR}` tokens replaced. If `hasUndefinedVariable` is true, this is the
   * original text.
   */
  expandedText: string;
  /**
   * Whether the text contained at least one `${VAR}` token.
   */
  hasVariable: boolean;
  /**
   * Whether the text referenced a variable that is not defined and has no fallback value.
   */
  hasUndefinedVariable: boolean;
}

// This finds environment variable tokens that look like "${VAR_NAME}"
const ENVIRONMENT_VARIABLE_REGEX: RegExp = /\$\{([^\}]+)\}/g;

function _expandEnvironmentVariables(
  text: string,
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean
): IEnvironmentVariableExpansionResult {
  let hasVariable: boolean = false;
  let hasUndefinedVariable: boolean = false;

  const expandedText: string = text.replace(ENVIRONMENT_VARIABLE_REGEX, (token: string) => {
    hasVariable = true;

    /**
     * Remove the leading "${" and the trailing "}" from the token
     *
     * ${nameString}                  -> nameString
     * ${nameString-fallbackString}   -> nameString-fallbackString
     * ${nameString:-fallbackString}  -> nameString:-fallbackString
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

    const environmentVariableValue: string | undefined = env[environmentVariableName];
    if (environmentVariableValue) {
      return environmentVariableValue;
    } else if (fallback) {
      return fallback;
    } else {
      hasUndefinedVariable = true;
      return token;
    }
  });

  return {
    expandedText: hasUndefinedVariable ? text : expandedText,
    hasVariable,
    hasUndefinedVariable
  };
}

/**
 * Describes how a .npmrc setting containing `${VAR}` tokens must be transformed so that PNPM will
 * honor it. See {@link _classifySensitiveNpmrcSetting}.
 */
type ISensitiveNpmrcLineAction =
  | {
      /**
       * The setting is a credential, so its value is passed to PNPM via an environment variable
       * and never written to disk.
       */
      kind: 'environment';
      variableName: string;
      variableValue: string;
    }
  | {
      /**
       * The setting is not a credential (for example, a registry URL), so it is safe to write its
       * expanded value into the generated .npmrc file.
       */
      kind: 'expand';
      expandedLine: string;
    };

/**
 * Determines how a .npmrc line whose environment variables are all defined must be transformed
 * so that PNPM 10.34.2 and newer will honor it. Returns `undefined` if PNPM expands the line's
 * environment variables itself, in which case the line is left alone.
 */
function _classifySensitiveNpmrcSetting(
  setting: IParsedNpmrcSetting,
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean
): ISensitiveNpmrcLineAction | undefined {
  const { name: settingName, value: settingValue } = setting;

  const expandedName: IEnvironmentVariableExpansionResult = _expandEnvironmentVariables(
    settingName,
    env,
    supportEnvVarFallbackSyntax
  );
  const expandedValue: IEnvironmentVariableExpansionResult = _expandEnvironmentVariables(
    settingValue,
    env,
    supportEnvVarFallbackSyntax
  );
  if (expandedName.hasUndefinedVariable || expandedValue.hasUndefinedVariable) {
    return undefined;
  }

  // Consider both spellings, because PNPM discards the setting if EITHER form is sensitive
  const isAuthValue: boolean =
    _isAuthValueSettingName(expandedName.expandedText) || _isAuthValueSettingName(settingName);
  if (isAuthValue) {
    if (_canSettingRoundTripThroughEnvironmentVariable(expandedName.expandedText)) {
      return {
        kind: 'environment',
        variableName: `npm_config_${expandedName.expandedText}`,
        variableValue: expandedValue.expandedText
      };
    }

    throw new Error(
      `The .npmrc credential setting "${expandedName.expandedText}" cannot be provided via an ` +
        'environment variable because PNPM cannot round-trip this setting name.'
    );
  }

  const isRequestDestination: boolean =
    (expandedName.hasVariable &&
      (_isRequestDestinationSettingName(expandedName.expandedText) ||
        _isRequestDestinationSettingName(settingName))) ||
    (expandedValue.hasVariable && _isRequestDestinationValueSettingName(expandedName.expandedText));
  if (isRequestDestination) {
    return { kind: 'expand', expandedLine: `${expandedName.expandedText}=${expandedValue.expandedText}` };
  }

  return undefined;
}

/**
 * Returns the replacement text for a .npmrc line that PNPM would otherwise discard, or `undefined`
 * if the line does not need to be rewritten.
 */
function _rewriteSensitiveNpmrcLine(
  setting: IParsedNpmrcSetting,
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean
): string | undefined {
  const action: ISensitiveNpmrcLineAction | undefined = _classifySensitiveNpmrcSetting(
    setting,
    env,
    supportEnvVarFallbackSyntax
  );
  switch (action?.kind) {
    case 'environment':
      // Example output:
      // "; PROVIDED VIA ENVIRONMENT: //my-registry.com/npm/:_authToken=${MY_AUTH_TOKEN}"
      return PROVIDED_VIA_ENVIRONMENT_PREFIX + setting.line;
    case 'expand':
      return action.expandedLine;
    default:
      return undefined;
  }
}

/**
 *
 * @param npmrcFileLines The npmrc file's lines
 * @param env The environment variables object
 * @param supportEnvVarFallbackSyntax Whether to support fallback values in the form of `${VAR_NAME:-fallback}`
 * @param filterNpmIncompatibleProperties Whether to filter out properties that npm doesn't understand
 * @param moveSensitiveSettingsToEnvironment Whether to replace settings that PNPM refuses to expand
 * environment variables in with a `; PROVIDED VIA ENVIRONMENT: ` comment. See
 * {@link getNpmrcEnvironmentVariables}.
 * @param environmentVariableSettingNames If provided, collects settings containing environment
 * variable references that PNPM ignores in a project `.npmrc`.
 * @returns An array of processed npmrc file lines with undefined environment variables and npm-incompatible properties commented out
 */
export function trimNpmrcFileLines(
  npmrcFileLines: string[],
  env: NodeJS.ProcessEnv,
  supportEnvVarFallbackSyntax: boolean,
  filterNpmIncompatibleProperties: boolean = false,
  moveSensitiveSettingsToEnvironment: boolean = false,
  environmentVariableSettingNames?: Set<string>
): string[] {
  const resultLines: string[] = [];

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
      const parsedSetting: IParsedNpmrcSetting | undefined = _tryParseNpmrcSetting(line);
      if (environmentVariableSettingNames && parsedSetting && _hasIgnoredEnvironmentVariable(parsedSetting)) {
        environmentVariableSettingNames.add(parsedSetting.name);
      }

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
        const { hasVariable, hasUndefinedVariable } = _expandEnvironmentVariables(
          line,
          env,
          supportEnvVarFallbackSyntax
        );

        if (hasUndefinedVariable) {
          lineShouldBeTrimmed = true;
          trimReason = 'MISSING_ENVIRONMENT_VARIABLE';
        } else if (hasVariable && moveSensitiveSettingsToEnvironment && parsedSetting) {
          const rewrittenLine: string | undefined = _rewriteSensitiveNpmrcLine(
            parsedSetting,
            env,
            supportEnvVarFallbackSyntax
          );
          if (rewrittenLine !== undefined) {
            resultLines.push(rewrittenLine);
            continue;
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
  moveSensitiveSettingsToEnvironment?: boolean;
  /**
   * If provided, collects settings containing environment variable references that PNPM ignores
   * when they come from a project `.npmrc`.
   */
  environmentVariableSettingNames?: Set<string>;
  env?: NodeJS.ProcessEnv;
}

function _copyAndTrimNpmrcFile(options: INpmrcTrimOptions): string {
  const { logger, sourceNpmrcPath, targetNpmrcPath } = options;
  logger.info(`Transforming ${sourceNpmrcPath}`, 'local-sensitive'); // Verbose
  logger.info(`  --> "${targetNpmrcPath}"`, 'local-sensitive');

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
  /**
   * PNPM 10.34.2 and newer refuse to expand `${VAR}` tokens that appear in credentials or registry
   * URLs in a project or workspace .npmrc file, because such files are normally committed to Git.
   * When this option is true, Rush resolves those settings itself: credentials are replaced with a
   * `; PROVIDED VIA ENVIRONMENT: ` comment and must be passed to the package manager using the
   * variables returned by {@link getNpmrcEnvironmentVariables}, and non-secret settings such as
   * registry URLs are written to the generated .npmrc file with their values already expanded.
   */
  moveSensitiveSettingsToEnvironment?: boolean;
  /**
   * If provided, collects settings containing environment variable references that PNPM ignores
   * when they come from a project `.npmrc`.
   */
  environmentVariableSettingNames?: Set<string>;
  env?: NodeJS.ProcessEnv;
}

export function syncNpmrc(options: ISyncNpmrcOptions): string | undefined {
  const {
    sourceNpmrcFolder,
    targetNpmrcFolder,
    useNpmrcPublish,
    logger = {
      // eslint-disable-next-line no-console
      info: (text: string) => console.log(text),
      // eslint-disable-next-line no-console
      error: (text: string) => console.error(text)
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
      logger.info(`Deleting ${targetNpmrcPath}`, 'local-sensitive'); // Verbose
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

/**
 * Options for {@link getNpmrcEnvironmentVariables}.
 */
export interface IGetNpmrcEnvironmentVariablesOptions {
  /**
   * The folder containing the generated .npmrc file, i.e. the folder that was passed as
   * `targetNpmrcFolder` to {@link syncNpmrc}.
   */
  npmrcFolder: string;
  supportEnvVarFallbackSyntax: boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * Returns the `npm_config_*` environment variables that must be passed to the package manager to
 * provide the credentials that {@link syncNpmrc} moved out of the generated .npmrc file when its
 * `moveSensitiveSettingsToEnvironment` option was enabled. Returns `undefined` if there are none.
 *
 * @remarks
 * PNPM only expands `${VAR}` tokens in credentials that come from a trusted source, and an
 * environment variable is such a source. Recomputing the variables from the generated .npmrc file
 * (instead of remembering them from the {@link syncNpmrc} call) allows commands such as
 * `rush-pnpm` to authenticate without re-synchronizing the file.
 */
export function getNpmrcEnvironmentVariables(
  options: IGetNpmrcEnvironmentVariablesOptions
): Record<string, string> | undefined {
  const { npmrcFolder, supportEnvVarFallbackSyntax, env = process.env } = options;

  let npmrcFileContent: string;
  try {
    npmrcFileContent = fs.readFileSync(path.join(npmrcFolder, '.npmrc')).toString();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw e;
  }

  let environmentVariables: Record<string, string> | undefined;
  for (const npmrcFileLine of npmrcFileContent.split('\n')) {
    const trimmedLine: string = npmrcFileLine.trim();
    if (!trimmedLine.startsWith(PROVIDED_VIA_ENVIRONMENT_PREFIX)) {
      continue;
    }

    const originalLine: string = trimmedLine.substring(PROVIDED_VIA_ENVIRONMENT_PREFIX.length);
    const parsedSetting: IParsedNpmrcSetting | undefined = _tryParseNpmrcSetting(originalLine);
    const action: ISensitiveNpmrcLineAction | undefined =
      parsedSetting && _classifySensitiveNpmrcSetting(parsedSetting, env, supportEnvVarFallbackSyntax);
    if (action?.kind === 'environment') {
      environmentVariables ??= {};
      environmentVariables[action.variableName] = action.variableValue;
    }
  }

  return environmentVariables;
}
