// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TSDocParserConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind
} from '@microsoft/tsdoc';

export class AedocDefinitions {
  public static readonly betaDocumentation: TSDocTagDefinition = new TSDocTagDefinition({
    tagName: '@betaDocumentation',
    syntaxKind: TSDocTagSyntaxKind.ModifierTag
  });

  public static readonly preapprovedTag: TSDocTagDefinition = new TSDocTagDefinition({
    tagName: '@preapproved',
    syntaxKind: TSDocTagSyntaxKind.ModifierTag
  });

  public static get parserConfiguration(): TSDocParserConfiguration {
    if (!AedocDefinitions._parserConfiguration) {
      const configuration: TSDocParserConfiguration = new TSDocParserConfiguration();
      configuration.addTagDefinitions([
        AedocDefinitions.betaDocumentation,
        AedocDefinitions.preapprovedTag
      ]);
      AedocDefinitions._parserConfiguration = configuration;
    }
    return AedocDefinitions._parserConfiguration;
  }

  private static _parserConfiguration: TSDocParserConfiguration | undefined;
}
