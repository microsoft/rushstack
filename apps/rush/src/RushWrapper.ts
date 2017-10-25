// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export default class RushWrapper {
  private _invokeFunction: () => void;
  public constructor(invokeFunction: () => void) {
    this._invokeFunction = invokeFunction;
  }

  public invokeRush(): void {
    this._invokeFunction();
  }
}
