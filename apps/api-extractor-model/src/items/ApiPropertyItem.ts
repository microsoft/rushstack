// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';
import { IApiDeclaredItemOptions, ApiDeclaredItem, IApiDeclaredItemJson } from '../items/ApiDeclaredItem';
import { ApiReleaseTagMixin, IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin';
import { IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin';
import { DeserializerContext } from '../model/DeserializerContext';

/**
 * Constructor options for {@link ApiPropertyItem}.
 * @public
 */
export interface IApiPropertyItemOptions
  extends IApiNameMixinOptions,
    IApiReleaseTagMixinOptions,
    IApiDeclaredItemOptions {
  propertyTypeTokenRange: IExcerptTokenRange;
  isOptional?: boolean;
}

export interface IApiPropertyItemJson extends IApiDeclaredItemJson {
  propertyTypeTokenRange: IExcerptTokenRange;
  isOptional?: boolean;
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

  /**
   * True if this is an optional property.
   * @remarks
   * For example:
   * ```ts
   * interface X {
   *   y: string;   // not optional
   *   z?: string;  // optional
   * }
   * ```
   */
  public readonly isOptional: boolean;

  public constructor(options: IApiPropertyItemOptions) {
    super(options);

    this.propertyTypeExcerpt = this.buildExcerpt(options.propertyTypeTokenRange);
    this.isOptional = !!options.isOptional;
  }

  /** @override */
  public static onDeserializeInto(
    options: Partial<IApiPropertyItemOptions>,
    context: DeserializerContext,
    jsonObject: IApiPropertyItemJson
  ): void {
    super.onDeserializeInto(options, context, jsonObject);

    options.propertyTypeTokenRange = jsonObject.propertyTypeTokenRange;
    options.isOptional = !!jsonObject.isOptional;
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
    if (this.isOptional) {
      jsonObject.isOptional = true;
    }
  }
}
