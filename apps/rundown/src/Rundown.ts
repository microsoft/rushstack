// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

export class Rundown {
  public static invoke(scriptPath: string, trace: boolean, args: string): void {
    if (!FileSystem.exists(scriptPath)) {
      throw new Error('The specified script path does not exist: ' + scriptPath);
    }

    console.log(scriptPath);
  }
}
