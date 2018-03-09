// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';

export interface IExportedMember {
  readonly name: string;
  readonly astSymbol: AstSymbol;
}

export interface IAstEntryPointParameters {
  readonly exportedMembers: ReadonlyArray<IExportedMember>;
}

export class AstEntryPoint {
  public readonly exportedMembers: ReadonlyArray<IExportedMember>;

  public constructor(parameters: IAstEntryPointParameters) {
    this.exportedMembers = parameters.exportedMembers;
  }
}
