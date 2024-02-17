// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalProvider } from '@rushstack/terminal';

/**
 * A terminal provider like /dev/null
 */
export class NullTerminalProvider implements ITerminalProvider {
  public supportsColor: boolean = false;
  public eolCharacter: string = '\n';
  public write(): void {}
}
