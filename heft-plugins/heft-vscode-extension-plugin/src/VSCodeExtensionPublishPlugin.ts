// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  CommandLineStringParameter
} from '@rushstack/heft';
import type { IWaitForExitResult } from '@rushstack/node-core-library';
import * as path from 'node:path';
import { executeAndWaitAsync, vsceScriptPath } from './util';

interface IVSCodeExtensionPublishPluginOptions {}

const PLUGIN_NAME: 'vscode-extension-publish-plugin' = 'vscode-extension-publish-plugin';

const VSIX_PATH_PARAMETER_NAME: string = '--vsix-path';
const MANIFEST_PATH_PARAMETER_NAME: string = '--manifest-path';
const SIGNATURE_PATH_PARAMETER_NAME: string = '--signature-path';

export default class VSCodeExtensionPublishPlugin
  implements IHeftTaskPlugin<IVSCodeExtensionPublishPluginOptions>
{
  public apply(
    heftTaskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IVSCodeExtensionPublishPluginOptions
  ): void {
    const vsixPathParameter: CommandLineStringParameter =
      heftTaskSession.parameters.getStringParameter(VSIX_PATH_PARAMETER_NAME);
    const manifestPathParameter: CommandLineStringParameter = heftTaskSession.parameters.getStringParameter(
      MANIFEST_PATH_PARAMETER_NAME
    );
    const signaturePathParameter: CommandLineStringParameter = heftTaskSession.parameters.getStringParameter(
      SIGNATURE_PATH_PARAMETER_NAME
    );

    if (!vsixPathParameter.value) {
      throw new Error(
        `The parameter "${VSIX_PATH_PARAMETER_NAME}" is required for the VSCodeExtensionPublishPlugin.`
      );
    }
    if (!manifestPathParameter.value) {
      throw new Error(
        `The parameter "${MANIFEST_PATH_PARAMETER_NAME}" is required for the VSCodeExtensionPublishPlugin.`
      );
    }
    if (!signaturePathParameter.value) {
      throw new Error(
        `The parameter "${SIGNATURE_PATH_PARAMETER_NAME}" is required for the VSCodeExtensionPublishPlugin.`
      );
    }

    const vsixPath: string = vsixPathParameter.value;
    const manifestPath: string = manifestPathParameter.value;
    const signaturePath: string = signaturePathParameter.value;

    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { buildFolderPath } = heftConfiguration;
      const {
        logger: { terminal }
      } = heftTaskSession;

      terminal.writeLine(`Using VSCE script: ${vsceScriptPath}`);
      terminal.writeLine(`Publishing VSIX ${vsixPath}`);

      const publishResult: IWaitForExitResult<string> = await executeAndWaitAsync(
        terminal,
        'node',
        [
          vsceScriptPath,
          'publish',
          '--no-dependencies',
          '--azure-credential',
          '--packagePath',
          path.resolve(vsixPath),
          '--manifestPath',
          path.resolve(manifestPath),
          '--signaturePath',
          path.resolve(signaturePath)
        ],
        {
          currentWorkingDirectory: path.resolve(buildFolderPath)
        }
      );
      if (publishResult.exitCode !== 0) {
        throw new Error(`VSIX publishing failed with exit code ${publishResult.exitCode}`);
      }
      terminal.writeLine('VSIX successfully published.');
    });
  }
}
