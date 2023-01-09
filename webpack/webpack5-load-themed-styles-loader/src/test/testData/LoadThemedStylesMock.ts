// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

class LoadThemedStylesMock {
  public static loadedData: string[] = [];
  public static calledWithAsync: boolean[] = [];

  public static loadStyles(data: string, async: boolean): void {
    this.loadedData.push(data);
    this.calledWithAsync.push(async);
  }
}

export = LoadThemedStylesMock;
