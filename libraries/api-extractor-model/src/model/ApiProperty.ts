// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeclarationReference,
  Meaning,
  Navigation,
  Component
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference';
import { ApiItemKind } from '../items/ApiItem';
import { ApiProtectedMixin, IApiProtectedMixinOptions } from '../mixins/ApiProtectedMixin';
import { ApiStaticMixin, IApiStaticMixinOptions } from '../mixins/ApiStaticMixin';
import { DeserializerContext } from '../model/DeserializerContext';
import { ApiPropertyItem, IApiPropertyItemJson, IApiPropertyItemOptions } from '../items/ApiPropertyItem';
import { Excerpt, IExcerptTokenRange } from '../mixins/Excerpt';

/**
 * Constructor options for {@link ApiProperty}.
 * @public
 */
export interface IApiPropertyOptions
  extends IApiPropertyItemOptions,
    IApiProtectedMixinOptions,
    IApiStaticMixinOptions {
  initializerTokenRange?: IExcerptTokenRange;
}

export interface IApiPropertyJson extends IApiPropertyItemJson {
  initializerTokenRange?: IExcerptTokenRange;
}

/**
 * Represents a TypeScript property declaration that belongs to an `ApiClass`.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiProperty` represents a TypeScript declaration such as the `width` and `height` members in this example:
 *
 * ```ts
 * export class Widget {
 *   public width: number = 100;
 *
 *   public get height(): number {
 *     if (this.isSquashed()) {
 *       return 0;
 *     } else {
 *       return this.clientArea.height;
 *     }
 *   }
 * }
 * ```
 *
 * Note that member variables are also considered to be properties.
 *
 * If the property has both a getter function and setter function, they will be represented by a single `ApiProperty`
 * and must have a single documentation comment.
 *
 * Compare with {@link ApiPropertySignature}, which represents a property belonging to an interface.
 * For example, a class property can be `static` but an interface property cannot.
 *
 * @public
 */
export class ApiProperty extends ApiProtectedMixin(ApiStaticMixin(ApiPropertyItem)) {
  /**
   * An {@link Excerpt} that describes the property's initializer.
   */
  public readonly initializerExcerpt: Excerpt | undefined;

  public constructor(options: IApiPropertyOptions) {
    super(options);

    if (options.initializerTokenRange) {
      this.initializerExcerpt = this.buildExcerpt(options.initializerTokenRange);
    }
  }

  /** @override */
  public static onDeserializeInto(
    options: Partial<IApiPropertyOptions>,
    context: DeserializerContext,
    jsonObject: IApiPropertyJson
  ): void {
    super.onDeserializeInto(options, context, jsonObject);

    options.initializerTokenRange = jsonObject.initializerTokenRange;
  }

  public static getContainerKey(name: string, isStatic: boolean): string {
    if (isStatic) {
      return `${name}|${ApiItemKind.Property}|static`;
    } else {
      return `${name}|${ApiItemKind.Property}|instance`;
    }
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Property;
  }

  /** @override */
  public get containerKey(): string {
    return ApiProperty.getContainerKey(this.name, this.isStatic);
  }

  /** @override */
  public serializeInto(jsonObject: Partial<IApiPropertyJson>): void {
    super.serializeInto(jsonObject);

    // Note that JSON does not support the "undefined" value, so we simply omit the field entirely if it is undefined
    if (this.initializerExcerpt) {
      jsonObject.initializerTokenRange = this.initializerExcerpt.tokenRange;
    }
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(this.isStatic ? Navigation.Exports : Navigation.Members, nameComponent)
      .withMeaning(Meaning.Member);
  }
}
