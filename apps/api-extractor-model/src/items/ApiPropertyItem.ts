// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { IApiDeclaredItemOptions, ApiDeclaredItem, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';

/**
 * Constructor options for {@link ApiPropertyItem}.
 * @public
 */
export interface IApiPropertyItemOptions extends
  IApiNameMixinOptions,
  IApiReleaseTagMixinOptions,
  IApiDeclaredItemOptions {

  propertyTypeTokenRange: IExcerptTokenRange;
}

export interface IApiPropertyItemJson extends IApiDeclaredItemJson {
  propertyTypeTokenRange: IExcerptTokenRange;
}

/**
 * The abstract base class for {@link ApiProperty} and {@link ApiPropertySignature}.
 *
 * @public
 */
export class ApiPropertyItem extends ApiNameMixin(ApiReleaseTagMixin(ApiDeclaredItem)) {
  /**
   * An {@link Excerpt} that describes the type of the property.
   */
  public readonly propertyTypeExcerpt: Excerpt;

  /** @override */
  public static onDeserializeInto(options: Partial<IApiPropertyItemOptions>, jsonObject: IApiPropertyItemJson): void {
    super.onDeserializeInto(options, jsonObject);

    options.propertyTypeTokenRange = jsonObject.propertyTypeTokenRange;
  }

  public constructor(options: IApiPropertyItemOptions) {
    super(options);

    this.propertyTypeExcerpt = this.buildExcerpt(options.propertyTypeTokenRange);
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

  /** @override */
  public serializeInto(jsonObject: Partial<IApiPropertyItemJson>): void {
    super.serializeInto(jsonObject);

    jsonObject.propertyTypeTokenRange = this.propertyTypeExcerpt.tokenRange;
  }
}
