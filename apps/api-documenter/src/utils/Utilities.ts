// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiParameterListMixin, ApiItem } from '@microsoft/api-extractor-model';

export class Utilities {
  /**
   * Generates a concise signature for a function.  Example: "getArea(width, height)"
   */
  public static getConciseSignature(apiItem: ApiItem): string {
    if (ApiParameterListMixin.isBaseClassOf(apiItem)) {
      return apiItem.displayName + '(' + apiItem.parameters.map(x => x.name).join(', ') + ')';
    }
    return apiItem.displayName;
  }
}
