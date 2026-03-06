// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DeclarationReference,
  Meaning,
  Navigation,
  type Component
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference';

import { ApiItemKind } from '../items/ApiItem.ts';
import { ApiDeclaredItem, type IApiDeclaredItemOptions } from '../items/ApiDeclaredItem.ts';
import { ApiReleaseTagMixin, type IApiReleaseTagMixinOptions } from '../mixins/ApiReleaseTagMixin.ts';
import {
  ApiItemContainerMixin,
  type IApiItemContainerMixinOptions
} from '../mixins/ApiItemContainerMixin.ts';
import type { ApiEnumMember } from './ApiEnumMember.ts';
import { type IApiNameMixinOptions, ApiNameMixin } from '../mixins/ApiNameMixin.ts';
import { type IApiExportedMixinOptions, ApiExportedMixin } from '../mixins/ApiExportedMixin.ts';

/**
 * Constructor options for {@link ApiEnum}.
 * @public
 */
export interface IApiEnumOptions
  extends IApiItemContainerMixinOptions,
    IApiNameMixinOptions,
    IApiReleaseTagMixinOptions,
    IApiDeclaredItemOptions,
    IApiExportedMixinOptions {}

/**
 * Represents a TypeScript enum declaration.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.
 *
 * `ApiEnum` represents an enum declaration such as `FontSizes` in the example below:
 *
 * ```ts
 * export enum FontSizes {
 *   Small = 100,
 *   Medium = 200,
 *   Large = 300
 * }
 * ```
 *
 * @public
 */
export class ApiEnum extends ApiItemContainerMixin(
  ApiNameMixin(ApiReleaseTagMixin(ApiExportedMixin(ApiDeclaredItem)))
) {
  public constructor(options: IApiEnumOptions) {
    super(options);
  }

  public static getContainerKey(name: string): string {
    return `${name}|${ApiItemKind.Enum}`;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Enum;
  }

  /** @override */
  public get members(): ReadonlyArray<ApiEnumMember> {
    return super.members as ReadonlyArray<ApiEnumMember>;
  }

  /** @override */
  public get containerKey(): string {
    return ApiEnum.getContainerKey(this.name);
  }

  /** @override */
  public addMember(member: ApiEnumMember): void {
    if (member.kind !== ApiItemKind.EnumMember) {
      throw new Error('Only ApiEnumMember objects can be added to an ApiEnum');
    }
    super.addMember(member);
  }

  /** @beta @override */
  public buildCanonicalReference(): DeclarationReference {
    const nameComponent: Component = DeclarationReference.parseComponent(this.name);
    const navigation: Navigation = this.isExported ? Navigation.Exports : Navigation.Locals;
    return (this.parent ? this.parent.canonicalReference : DeclarationReference.empty())
      .addNavigationStep(navigation, nameComponent)
      .withMeaning(Meaning.Enum);
  }
}
