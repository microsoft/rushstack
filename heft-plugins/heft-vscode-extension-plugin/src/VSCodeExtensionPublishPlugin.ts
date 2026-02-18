// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  CommandLineStringParameter,
  CommandLineFlagParameter
} from '@rushstack/heft';
import type { IWaitForExitResult } from '@rushstack/node-core-library';

import { executeAndWaitAsync, vsceScriptPath } from './util';

interface IVSCodeExtensionPublishPluginOptions {}

const PLUGIN_NAME: 'vscode-extension-publish-plugin' = 'vscode-extension-publish-plugin';

const VSIX_PATH_PARAMETER_NAME: string = '--vsix-path';
const MANIFEST_PATH_PARAMETER_NAME: string = '--manifest-path';
const SIGNATURE_PATH_PARAMETER_NAME: string = '--signature-path';
const PUBLISH_UNSIGNED_PARAMETER_NAME: string = '--publish-unsigned';

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
    const publishUnsignedParameter: CommandLineFlagParameter = heftTaskSession.parameters.getFlagParameter(
      PUBLISH_UNSIGNED_PARAMETER_NAME
    );

    const {
      logger: { terminal }
    } = heftTaskSession;

    // required parameters defined in heft-plugin.json
    const vsixPath: string = vsixPathParameter.value!;

    // manifestPath and signaturePath are required if publishUnsigned is unset
    const manifestPath: string | undefined = manifestPathParameter.value;
    const signaturePath: string | undefined = signaturePathParameter.value;
    const publishUnsigned: boolean = publishUnsignedParameter.value;
    if (publishUnsigned) {
      terminal.writeLine(`Publishing unsigned VSIX ${vsixPath}`);
    } else {
      if (!manifestPath || !signaturePath) {
        throw new Error(
          `The parameters "${MANIFEST_PATH_PARAMETER_NAME}" and "${SIGNATURE_PATH_PARAMETER_NAME}" are required for the VSCodeExtensionPublishPlugin.`
        );
      }
    }

    heftTaskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { buildFolderPath } = heftConfiguration;

      terminal.writeLine(`Using VSCE script: ${vsceScriptPath}`);
      terminal.writeLine(`Publishing VSIX ${vsixPath}`);

      let publishResult: IWaitForExitResult<string>;

      if (publishUnsigned) {
        publishResult = await executeAndWaitAsync(
          terminal,
          'node',
          [
            vsceScriptPath,
            'publish',
            '--no-dependencies',
            '--azure-credential',
            '--packagePath',
            path.resolve(vsixPath)
          ],
          {
            currentWorkingDirectory: path.resolve(buildFolderPath)
          }
        );
      } else {
        if (!manifestPath) {
          throw new Error(`Missing manifest path for the VSCodeExtensionPublishPlugin.`);
        }
        if (!signaturePath) {
          throw new Error(`Missing signature path for the VSCodeExtensionPublishPlugin.`);
        }
        publishResult = await executeAndWaitAsync(
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
      }
      if (publishResult.exitCode !== 0) {
        throw new Error(`VSIX publishing failed with exit code ${publishResult.exitCode}`);
      }
      terminal.writeLine('VSIX successfully published.');
    });
  }
}
