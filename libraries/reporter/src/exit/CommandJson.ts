// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The independently-resolved JSON controls on a command line.
 *
 * @beta
 */
export interface IJsonControls {
  /**
   * Whether the command-specific `--json` flag was requested. This selects the
   * command's own JSON schema and is unchanged by the reporter system.
   */
  readonly commandJson: boolean;

  /**
   * Whether the `json` reporter was requested through `--reporter`.
   */
  readonly reporterJson: boolean;
}

/**
 * Separates the command-specific `--json` flag from the `json` reporter selection.
 *
 * @remarks
 * The command-specific `--json` behavior is preserved and is never an alias for
 * `--reporter=json`. Both may be requested independently, and each keeps its own
 * output schema.
 *
 * @param argv - the command-line arguments, excluding the node executable and script
 *
 * @beta
 */
export function separateJsonControls(argv: readonly string[]): IJsonControls {
  let commandJson: boolean = false;
  let reporterJson: boolean = false;

  for (let index: number = 0; index < argv.length; index++) {
    const arg: string = argv[index];
    if (arg === '--json') {
      commandJson = true;
    } else if (arg === '--reporter=json') {
      reporterJson = true;
    } else if (arg === '--reporter' && argv[index + 1] === 'json') {
      reporterJson = true;
    }
  }

  return { commandJson, reporterJson };
}
