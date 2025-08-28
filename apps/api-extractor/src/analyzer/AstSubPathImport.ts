// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstEntity, AstSyntheticEntity } from './AstEntity';

export interface IAstSubPathImportOptions {
  readonly astEntity: AstEntity;
  readonly exportPath: string[];
}

export class AstSubPathImport extends AstSyntheticEntity {
  public readonly astEntity: AstEntity;

  public readonly exportPath: string[];

  public isImportTypeEverywhere: boolean = true;

  public constructor(options: IAstSubPathImportOptions) {
    super();
    this.astEntity = options.astEntity;
    this.exportPath = options.exportPath;
  }

  /** {@inheritdoc} */
  public get localName(): string {
    // abstract
    return this.exportPath[this.exportPath.length - 1];
  }
}
