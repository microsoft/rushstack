// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BasePackage } from './base/BasePackage';

export class PackageLookup {
  private _packageMap: Map<string, BasePackage>;

  constructor() {
    this._packageMap = new Map<string, BasePackage>();
  }

  public loadTree(root: BasePackage): void {
    const queue: BasePackage[] = [root];

    // We want the lookup to return the shallowest match, so this is a breadth first
    // traversal

    // tslint:disable-next-line:no-constant-condition
    while (true) {
      const current: BasePackage | undefined = queue.shift();
      if (!current) {
        break;
      }

      for (const child of current.children) {
        queue.push(child);
      }

      const key: string = current.nameAndVersion;

      if (!this._packageMap.has(key)) {
        this._packageMap.set(key, current);
      }
    }
  }

  public getPackage(nameAndVersion: string): BasePackage | undefined {
    return this._packageMap.get(nameAndVersion);
  }
}
