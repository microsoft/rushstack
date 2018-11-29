// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ApiFunctionLikeMixin, ApiItem
} from '@microsoft/api-extractor';

export class Utilities {
  /**
   * Generates a concise signature for a function.  Example: "getArea(width, height)"
   */
  public static getConciseSignature(apiItem: ApiItem): string {
    if (ApiFunctionLikeMixin.isBaseClassOf(apiItem)) {
      return apiItem.name + '(' + apiItem.parameters.map(x => x.name).join(', ') + ')';
    }
    return apiItem.name;
  }
}
