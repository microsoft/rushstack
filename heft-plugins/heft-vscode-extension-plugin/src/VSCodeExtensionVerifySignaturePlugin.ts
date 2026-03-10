// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  CommandLineStringParameter
} from '@rushstack/heft';
import type { IWaitForExitResult } from '@rushstack/node-core-library';

import { executeAndWaitAsync, vsceScriptPath } from './util.ts';

interface IVSCodeExtensionVerifySignaturePluginOptions {}

const PLUGIN_NAME: 'vscode-extension-verify-signature-plugin' = 'vscode-extension-verify-signature-plugin';

const VSIX_PATH_PARAMETER_NAME: string = '--vsix-path';
const MANIFEST_PATH_PARAMETER_NAME: string = '--manifest-path';
const SIGNATURE_PATH_PARAMETER_NAME: string = '--signature-path';

export default class VSCodeExtensionVerifySignaturePlugin
  implements IHeftTaskPlugin<IVSCodeExtensionVerifySignaturePluginOptions>
{
  public apply(
    heftTaskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IVSCodeExtensionVerifySignaturePluginOptions
  ): void {
    const vsixPathParameter: CommandLineStringParameter =
      heftTaskSession.parameters.getStringParameter(VSIX_PATH_PARAMETER_NAME);
    const manifestPathParameter: CommandLineStringParameter = heftTaskSession.parameters.getStringParameter(
      MANIFEST_PATH_PARAMETER_NAME
    );
    const signaturePathParameter: CommandLineStringParameter = heftTaskSession.parameters.getStringParameter(
      SIGNATURE_PATH_PARAMETER_NAME
    );

    // required parameters defined in heft-plugin.json
    const vsixPath: string = vsixPathParameter.value!;
    const manifestPath: string = manifestPathParameter.value!;
    const signaturePath: string = signaturePathParameter.value!;

    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { buildFolderPath } = heftConfiguration;
      const {
        logger: { terminal }
      } = heftTaskSession;

      terminal.writeLine(`Using VSCE script: ${vsceScriptPath}`);
      terminal.writeLine(`Verifying signature ${vsixPath}`);

      const verifySignatureResult: IWaitForExitResult<string> = await executeAndWaitAsync(
        terminal,
        'node',
        [
          vsceScriptPath,
          'verify-signature',
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
      if (verifySignatureResult.exitCode !== 0) {
        throw new Error(
          `VSIX signature verification failed with exit code ${verifySignatureResult.exitCode}`
        );
      }
      terminal.writeLine('Successfully verified VSIX signature.');
    });
  }
}
