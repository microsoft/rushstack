// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildContext } from './BuildContext';

export class BasicTasks {
  public static doClean(buildContext: BuildContext): void {
    console.log(`Project folder is: "${buildContext.projectFolder}"`);
  }
}
