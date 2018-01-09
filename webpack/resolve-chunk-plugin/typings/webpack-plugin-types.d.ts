// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IRange { }
interface ILoc { }

interface IConstDependency {
  loc: ILoc;
  new (value: string, range: IRange): IConstDependency;
}

interface IChunk {
  name: string;
  id: number;
}

interface IParam {
  string: string;
  isString(): boolean;
}

interface IModule {
  addDependency: (dependency: IConstDependency) => void;
}
