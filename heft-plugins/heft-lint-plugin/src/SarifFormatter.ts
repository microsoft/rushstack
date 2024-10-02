// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import url from 'url';

import type * as TEslint from 'eslint';

export interface ISerifFormatterOptions {
  ignoreSuppressed: boolean;
  eslintVersion?: string;
}

interface ISarifRun {
  tool: {
    driver: {
      name: string;
      informationUri: string;
      version?: string;
      rules: IStaticAnalysisRules[];
    };
  };
  artifacts?: string[];
  results?: ISarifRepresentation[];
  invocations?: {
    toolConfigurationNotifications: ISarifRepresentation[];
    executionSuccessful: boolean;
  }[];
}

interface ISarifFile {
  location: {
    uri: string;
  };
}

interface ISarifRepresentation {
  level: string;
  message: {
    text: string;
  };
  locations: ISarifLocation[];
  ruleId?: string;
  descriptor?: {
    id: string;
  };
  suppressions?: ISuppressedAnalysis[];
}

interface ISuppressedAnalysis {
  kind: string;
  justification: string;
}

// Interface for the SARIF log structure
interface ISarifLog {
  version: string;
  $schema: string;
  runs: ISarifRun[];
}

interface IRegion {
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  snippet?: {
    text: string;
  };
}

interface IStaticAnalysisRules {
  id: string;
  name?: string;
  shortDescription?: {
    text: string;
  };
  fullDescription?: {
    text: string;
  };
  defaultConfiguration?: {
    level: 'note' | 'warning' | 'error';
  };
  helpUri?: string;
  properties?: {
    category?: string;
    precision?: 'very-high' | 'high' | 'medium' | 'low';
    tags?: string[];
    problem?: {
      severity?: 'recommendation' | 'warning' | 'error';
      securitySeverity?: number;
    };
  };
}

interface ISarifLocation {
  physicalLocation: ISarifPhysicalLocation;
}

interface ISarifPhysicalLocation {
  artifactLocation: {
    uri: string;
    index: number;
  };
  region?: IRegion;
}

interface IMessage extends TEslint.Linter.LintMessage {
  suppressions?: ISuppressedAnalysis[];
}

interface IExtendedLintResult extends TEslint.ESLint.LintResult {
  suppressedMessages: TEslint.ESLint.LintResult['suppressedMessages'];
}

const sarifFiles: Map<string, ISarifFile> = new Map();
const sarifResults: ISarifRepresentation[] = [];

const internalErrorId: string = 'ESL0999';
const toolConfigurationNotifications: ISarifRepresentation[] = [];

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

// Main function
export function formatAsSARIF(results: IExtendedLintResult[], options: ISerifFormatterOptions): ISarifLog {
  const { ignoreSuppressed, eslintVersion } = options;

  if (typeof eslintVersion !== undefined) {
    sarifRun.tool.driver.version = eslintVersion;
  }
  let executionSuccessful: boolean = true;

  for (const result of results) {
    const { filePath } = result;
    let sarifFile: ISarifFile | undefined = sarifFiles.get(filePath);
    if (sarifFile === undefined) {
      const artifactIndex: number = sarifFiles.size;
      const fileUrl: string = url.pathToFileURL(filePath).toString();

      sarifFile = {
        location: {
          uri: fileUrl
        }
      };
      sarifFiles.set(filePath, sarifFile);

      const containsSuppressedMessages: boolean =
        result.suppressedMessages && result.suppressedMessages.length > 0;
      const messages: IMessage[] =
        containsSuppressedMessages && !ignoreSuppressed
          ? [...result.messages, ...result.suppressedMessages]
          : result.messages;

      if (messages.length > 0) {
        for (const message of messages) {
          const level: string = message.fatal || message.severity === 2 ? 'error' : 'warning';
          const sarifRepresentation: ISarifRepresentation = {
            level,
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
                ? message.suppressions.map((suppression: ISuppressedAnalysis) => {
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

          const physicalLocation: ISarifPhysicalLocation = sarifRepresentation.locations[0].physicalLocation;

          if (message.line! > 0 || message.column! > 0) {
            physicalLocation.region = {};
            const { line, column, endLine, endColumn } = message;
            const region: IRegion = {
              startLine: line !== undefined && line > 0 ? line : undefined,
              startColumn: column !== undefined && column > 0 ? column : undefined,
              endLine: endLine !== undefined && endLine > 0 ? endLine : undefined,
              endColumn: endColumn !== undefined && endColumn > 0 ? endColumn : undefined
            };
            physicalLocation.region = region;
          }

          if (message.source) {
            physicalLocation.region = physicalLocation.region || {};
            physicalLocation.region.snippet = {
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
        toolConfigurationNotifications,
        executionSuccessful
      }
    ];
  }

  return sarifLog;
}
