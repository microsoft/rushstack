// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Package } from '@microsoft/rush-lib';

export default class PackageLookup {
  private _packageMap: Map<string, Package>;

  constructor() {
    this._packageMap = new Map<string, Package>();
  }

  public loadTree(root: Package): void {
    const queue: Package[] = [root];

    // We want the lookup to return the shallowest match, so this is a breadth first
    // traversal

    // tslint:disable-next-line:no-constant-condition
    while (true) {
      const current: Package = queue.shift();
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

  public getPackage(nameAndVersion: string): Package {
    return this._packageMap.get(nameAndVersion);
  }
}
