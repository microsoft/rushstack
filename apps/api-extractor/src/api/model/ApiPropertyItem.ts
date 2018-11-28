// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { Excerpt } from '../mixins/Excerpt';
import { IApiDeclarationMixinOptions, ApiDeclarationMixin } from '../mixins/ApiDeclarationMixin';

/** @public */
export interface IApiPropertyItemOptions extends
  IApiDocumentedItemOptions,
  IApiDeclarationMixinOptions {
}

/**
 * Common base class for ApiProperty and ApiPropertySignature.
 *
 * @public
 */
export class ApiPropertyItem extends ApiDeclarationMixin(ApiDocumentedItem) {
  public readonly propertyTypeExcerpt: Excerpt;

  public constructor(options: IApiPropertyItemOptions) {
    super(options);

    this.propertyTypeExcerpt = this.getEmbeddedExcerpt('propertyType');
  }

  /**
   * Returns true if this property should be documented as an event.
   *
   * @remarks
   * The `@eventProperty` TSDoc modifier can be added to readonly properties to indicate that they return an
   * event object that event handlers can be attached to.  The event-handling API is implementation-defined, but
   * typically the return type would be a class with members such as `addHandler()` and `removeHandler()`.
   * The documentation should display such properties under an "Events" heading instead of the
   * usual "Properties" heading.
   */
  public get isEventProperty(): boolean {
    if (this.tsdocComment) {
      return this.tsdocComment.modifierTagSet.isEventProperty();
    }
    return false;
  }
}
