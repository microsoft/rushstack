// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { runScenariosAsync } from 'run-scenarios-helpers';

export async function runAsync(runScriptOptions: IRunScriptOptions): Promise<void> {
  await runScenariosAsync(runScriptOptions, {
    libFolderPath: __dirname,
    additionalApiExtractorConfig: {
      messages: {
        extractorMessageReporting: {
          // For test purposes, write these warnings into .api.md
          // TODO: Capture the full list of warnings in the tracked test output file
          'ae-cyclic-inherit-doc': {
            logLevel: 'warning',
            addToApiReportFile: true
          },
          'ae-unresolved-link': {
            logLevel: 'warning',
            addToApiReportFile: true
          }
        },
        tsdocMessageReporting: {
          'tsdoc-characters-after-block-tag': {
            logLevel: 'warning',
            addToApiReportFile: true
          }
        }
      }
    }
  });
}
