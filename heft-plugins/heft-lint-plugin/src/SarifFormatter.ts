/* eslint-disable unicorn/no-null */
/**
 * @fileoverview SARIF v2.1 formatter
 * @author Microsoft
 */

import url from 'url';

import type * as TEslint from 'eslint';

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

interface ESLint {
  version: string;
}

interface Suppression {
  kind: string;
  justification: string;
}

// Interface for ESLint message object
interface ESLintMessage {
  fatal?: boolean;
  severity?: number;
  message: string;
  ruleId?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  suppressions?: Suppression[];
}

/**
 * Returns the severity of warning or error
 * @param {ESLintMessage} message message object to examine
 * @returns {string} severity level
 * @private
 */
function getResultLevel(message: ESLintMessage): string {
  if (message.fatal || message.severity === 2) {
    return 'error';
  }
  return 'warning';
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

interface ISarifRun {
  tool: {
    driver: {
      name: string;
      informationUri: string;
      version?: string;
      rules: any[];
    };
  };
  artifacts?: any[];
  results?: any[];
  invocations?: {
    toolConfigurationNotifications: any[];
    executionSuccessful: boolean;
  }[];
}

// Interface for the SARIF log structure
interface ISarifLog {
  version: string;
  $schema: string;
  runs: ISarifRun[];
}

export interface ISerifFormatterOptions {
  ignoreSuppressed: boolean;
  eslintVersion: string;
}

interface IExtendedLintResult extends TEslint.ESLint.LintResult {
  suppressedMessages?: TEslint.ESLint.LintResult['messages'];
}

// Main function
export function formatAsSARIF(results: IExtendedLintResult[], options: ISerifFormatterOptions): ISarifLog {
  const sarifRun: ISarifRun = {
    tool: {
      driver: {
        name: 'ESLint',
        informationUri: 'https://eslint.org',
        rules: []
      }
    }
  };
  const sarifLog: ISarifLog = {
    version: '2.1.0',
    $schema: 'http://json.schemastore.org/sarif-2.1.0-rtm.5',
    runs: [sarifRun]
  };

  const { ignoreSuppressed, eslintVersion } = options;

  if (typeof eslintVersion !== 'undefined') {
    sarifRun.tool.driver.version = eslintVersion;
  }

  const sarifFiles: Map<string, ISarifFile> = new Map();
  const sarifResults: any[] = [];

  const internalErrorId = 'ESL0999';
  const toolConfigurationNotifications: any[] = [];
  let executionSuccessful = true;

  for (const result of results) {
    const { filePath } = result;
    let sarifFile: ISarifFIle | undefined = sarifFiles.get(filePath);
    if (sarifFile === undefined) {
      const artifactIndex: number = sarifFiles.size;
      const fileUrl: string = url.pathToFileURL(filePath).toString();

      sarifFile = {
        location: {
          uri: fileUrl
        }
      };
      sarifFiles.set(filePath, sarifFile);

      const containsSuppressedMessages = result.suppressedMessages && result.suppressedMessages.length > 0;
      const messages =
        containsSuppressedMessages && !ignoreSuppressed
          ? [...result.messages, ...result.suppressedMessages]
          : result.messages;

      if (messages.length > 0) {
        for (const message of messages) {
          const sarifRepresentation: any = {
            level: getResultLevel(message),
            message: {
              text: message.message
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: fileUrl,
                    index: artifactIndex
                  }
                }
              }
            ]
          };

          if (message.ruleId) {
            sarifRepresentation.ruleId = message.ruleId;

            if (containsSuppressedMessages && !ignoreSuppressed) {
              sarifRepresentation.suppressions = message.suppressions
                ? message.suppressions.map((suppression: Suppression) => {
                    return {
                      kind: suppression.kind === 'directive' ? 'inSource' : 'external',
                      justification: suppression.justification
                    };
                  })
                : [];
            }
          } else {
            sarifRepresentation.descriptor = {
              id: internalErrorId
            };

            if (sarifRepresentation.level === 'error') {
              executionSuccessful = false;
            }
          }

          if (message.line! > 0 || message.column! > 0) {
            sarifRepresentation.locations[0].physicalLocation.region = {};
            if (message.line! > 0) {
              sarifRepresentation.locations[0].physicalLocation.region.startLine = message.line;
            }
            if (message.column! > 0) {
              sarifRepresentation.locations[0].physicalLocation.region.startColumn = message.column;
            }
            if (message.endLine! > 0) {
              sarifRepresentation.locations[0].physicalLocation.region.endLine = message.endLine;
            }
            if (message.endColumn! > 0) {
              sarifRepresentation.locations[0].physicalLocation.region.endColumn = message.endColumn;
            }
          }

          if (message.source) {
            sarifRepresentation.locations[0].physicalLocation.region =
              sarifRepresentation.locations[0].physicalLocation.region || {};
            sarifRepresentation.locations[0].physicalLocation.region.snippet = {
              text: message.source
            };
          }

          if (message.ruleId) {
            sarifResults.push(sarifRepresentation);
          } else {
            toolConfigurationNotifications.push(sarifRepresentation);
          }
        }
      }
    }
  }

  const sarifFileValues: string[] = Object.values(sarifFiles);
  if (sarifFileValues.length > 0) {
    sarifRun.artifacts = sarifFileValues;
  }

  sarifRun.results = sarifResults;

  if (toolConfigurationNotifications.length > 0) {
    sarifRun.invocations = [
      {
        toolConfigurationNotifications: toolConfigurationNotifications,
        executionSuccessful: executionSuccessful
      }
    ];
  }

  return sarifLog;
}
