// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.s

import { ApiItem, IApiItemJson, IApiItemConstructor, IApiItemOptions, ApiItemKind } from '../items/ApiItem';
import { ExcerptToken, ExcerptTokenKind, IExcerptTokenRange } from './Excerpt';
import { ApiDeclaredItem } from '../items/ApiDeclaredItem';
import { InternalError, LegacyAdapters } from '@rushstack/node-core-library';
import { ApiModel } from '../model/ApiModel';
import { DeserializerContext } from '../model/DeserializerContext';
import { HeritageType } from '../model/HeritageType';
import { IResolveDeclarationReferenceResult } from '../model/ModelReferenceResolver';
import { ApiNameMixin } from './ApiNameMixin';

/**
 * Result object for {@link (ApiExtendsMixin:interface).findMembersWithInheritance}.
 * @public
 */
export interface IFindMembersWithInheritanceResult {
  /**
   * The inherited members that could be found. Not guaranteed to contain all of the item's
   * inherited members.
   */
  members: ApiItem[];

  /**
   * Diagnostic messages regarding the search operation.
   */
  messages: IFindMembersWithInheritanceMessage[];

  /**
   * Indicates whether the result is potentially incomplete due to errors or gaps in finding
   * inherited members. If true, this result object will contain messages explaining the
   * errors in more detail.
   */
  maybeIncompleteResult: boolean;
}

/**
 * This object is used for messages reported by `ApiExtendsMixin.findMembersWithInheritance`.
 * @public
 */
export interface IFindMembersWithInheritanceMessage {
  /**
   * Unique identifier for the message.
   */
  messageId: FindMembersWithInheritanceMessageId;

  /**
   * Text description of the message.
   */
  text: string;
}

/**
 * Unique identifiers for messages reported by `ApiExtendsMixin.findMembersWithInheritance`.
 * @public
 */
export enum FindMembersWithInheritanceMessageId {
  /**
   * "Declaration resolution failed for ___. Error message: ___."
   */
  DeclarationResolutionFailed = 'declaration-resolution-failed',

  /**
   * "Unable to get the associated model of ___."
   */
  MissingApiModel = 'missing-api-model',

  /**
   * "Unable to find reference token within extends clause of ___."
   */
  MissingReferenceToken = 'missing-reference-token',

  /**
   * "Unable to resolve inherited members from ___ of kind ___."
   */
  UnsupportedKind = 'unsupported-kind'
}

/**
 * Constructor options for {@link (ApiExtendsMixin:interface)}.
 * @public
 */
export interface IApiExtendsMixinOptions extends IApiItemOptions {
  extendsTokenRanges: IExcerptTokenRange[];
}

export interface IApiExtendsMixinJson extends IApiItemJson {
  extendsTokenRanges: IExcerptTokenRange[];
}

const _extendsTypes: unique symbol = Symbol('ApiExtendsMixin._extendsTypes');

/**
 * The mixin base class for API items that can extend other API items.
 *
 * @remarks
 *
 * This is part of the {@link ApiModel} hierarchy of classes, which are serializable representations of
 * API declarations.  The non-abstract classes (e.g. `ApiClass`, `ApiEnum`, `ApiInterface`, etc.) use
 * TypeScript "mixin" functions (e.g. `ApiDeclaredItem`, `ApiItemContainerMixin`, etc.) to add various
 * features that cannot be represented as a normal inheritance chain (since TypeScript does not allow a child class
 * to extend more than one base class).  The "mixin" is a TypeScript merged declaration with three components:
 * the function that generates a subclass, an interface that describes the members of the subclass, and
 * a namespace containing static members of the class.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ApiExtendsMixin extends ApiItem {
  /**
   * The types referenced via an "extends" heritage clause.
   */
  readonly extendsTypes: HeritageType[];

  /**
   * Finds all of the ApiItem's immediate and inherited members by walking up the inheritance tree.
   */
  findMembersWithInheritance(): IFindMembersWithInheritanceResult;

  /** @override */
  serializeInto(jsonObject: Partial<IApiExtendsMixinJson>): void;
}

/**
 * Mixin function for {@link (ApiExtendsMixin:interface)}.
 *
 * @param baseClass - The base class to be extended
 * @returns A child class that extends baseClass, adding the {@link (ApiExtendsMixin:interface)} functionality.
 *
 * @public
 */
export function ApiExtendsMixin<TBaseClass extends IApiItemConstructor>(
  baseClass: TBaseClass
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): TBaseClass & (new (...args: any[]) => ApiExtendsMixin) {
  class MixedClass extends baseClass implements ApiExtendsMixin {
    public readonly [_extendsTypes]: HeritageType[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      super(...args);

      const options: IApiExtendsMixinOptions = args[0];

      if (this instanceof ApiDeclaredItem) {
        for (const extendsTokenRange of options.extendsTokenRanges) {
          this.extendsTypes.push(new HeritageType(this.buildExcerpt(extendsTokenRange)));
        }
      } else {
        throw new InternalError('ApiExtendsMixin expects a base class that inherits from ApiDeclaredItem');
      }
    }

    /**
     * Finds all of the ApiItem's immediate and inherited members by walking up the inheritance tree.
     *
     * @remarks
     *
     * Given the following class heritage:
     *
     * ```
     * export class A {
     *   public a: number|boolean;
     * }
     *
     * export class B extends A {
     *   public a: number;
     *   public b: string;
     * }
     *
     * export class C extends B {
     *   public c: boolean;
     * }
     * ```
     *
     * Calling `findMembersWithInheritance` on `C` will return `B.a`, `B.b`, and `C.c`. Calling the
     * method on `B` will return `B.a` and `B.b`. And calling the method on `A` will return just
     * `A.a`.
     *
     * The inherited members returned by this method may be incomplete. If so, there will be a flag
     * on the result object indicating this as well as messages explaining the errors in more detail.
     * Some scenarios include:
     *
     * - Interface extending from a type alias.
     * - Class extending from a variable.
     * - Extending from a declaration not present in the model (e.g. external package).
     * - Extending from an unexported declaration (e.g. ae-forgotten-export). Common in mixin
     *   patterns.
     * - Unexpected runtime errors...
     *
     * Lastly, be aware that the types of inherited members are returned with respect to their
     * defining class as opposed to with respect to the inheriting class. For example, consider
     * the following:
     *
     * ```
     * export class A<T> {
     *   public a: T;
     * }
     *
     * export class B extends A<number> {}
     * ```
     *
     * When called on `B`, this method will return `B.a` with type `T` as opposed to type
     * `number`, although the latter is more accurate.
     */
    public findMembersWithInheritance(): IFindMembersWithInheritanceResult {
      const messages: IFindMembersWithInheritanceMessage[] = [];
      let maybeIncompleteResult: boolean = false;

      // This method uses the same logic as that in `ApiItemContainerMixin` to store members by
      // by name and kind.
      const membersByName: Map<string, ApiItem[]> = new Map();
      const membersByKind: Map<ApiItemKind, ApiItem[]> = new Map();

      const toVisit: ApiItem[] = [];
      let next: ApiItem | undefined = this;

      while (next) {
        const membersToAdd: ApiItem[] = [];

        // For each member, check to see if we've already seen a member with the same name
        // previously in the inheritance tree. If so, we know we won't inherit it, and thus
        // do not add it to our `membersToAdd` array.
        for (const member of next.members) {
          // We add the to-be-added members to an intermediate array instead of immediately
          // to the maps themselves to support method overloads with the same name.
          if (ApiNameMixin.isBaseClassOf(member)) {
            if (!membersByName.has(member.name)) {
              membersToAdd.push(member);
            }
          } else {
            if (!membersByKind.has(member.kind)) {
              membersToAdd.push(member);
            }
          }
        }

        for (const member of membersToAdd) {
          if (ApiNameMixin.isBaseClassOf(member)) {
            const members: ApiItem[] = membersByName.get(member.name) || [];
            members.push(member);
            membersByName.set(member.name, members);
          } else {
            const members: ApiItem[] = membersByKind.get(member.kind) || [];
            members.push(member);
            membersByKind.set(member.kind, members);
          }
        }

        if (!ApiExtendsMixin.isBaseClassOf(next)) {
          messages.push({
            messageId: FindMembersWithInheritanceMessageId.UnsupportedKind,
            text: `Unable to resolve inherited members from ${next.displayName} of kind ${next.kind}.`
          });
          maybeIncompleteResult = true;
          break;
        }

        // Interfaces can extend multiple interfaces, so iterate through all of them.
        const extendedItems: ApiItem[] = [];
        for (const extendsType of next.extendsTypes) {
          // We want to find the reference token associated with the actual inherited declaration.
          // In every case we support, this is the first reference token. For example:
          //
          // ```
          // export class A extends B {}
          //                        ^
          // export class A extends B<C> {}
          //                        ^
          // export class A extends B.C {}
          //                        ^^^
          // ```
          const firstReferenceToken: ExcerptToken | undefined = extendsType.excerpt.spannedTokens.find(
            (token: ExcerptToken) => {
              return token.kind === ExcerptTokenKind.Reference && token.canonicalReference;
            }
          );

          if (!firstReferenceToken) {
            messages.push({
              messageId: FindMembersWithInheritanceMessageId.MissingReferenceToken,
              text: `Unable to find reference token within extends clause of ${next.displayName}.`
            });
            maybeIncompleteResult = true;
            continue;
          }

          const apiModel: ApiModel | undefined = this.getAssociatedModel();
          if (!apiModel) {
            messages.push({
              messageId: FindMembersWithInheritanceMessageId.MissingApiModel,
              text: `Unable to get the associated model of ${next.displayName}.`
            });
            maybeIncompleteResult = true;
            continue;
          }

          const apiItemResult: IResolveDeclarationReferenceResult = apiModel.resolveDeclarationReference(
            firstReferenceToken.canonicalReference!,
            undefined
          );

          const apiItem: ApiItem | undefined = apiItemResult.resolvedApiItem;
          if (!apiItem) {
            messages.push({
              messageId: FindMembersWithInheritanceMessageId.DeclarationResolutionFailed,
              text: `Declaration resolution failed for ${next.displayName}. Error message: ${apiItemResult.errorMessage}.`
            });
            maybeIncompleteResult = true;
            continue;
          }

          extendedItems.push(apiItem);
        }

        // For classes, this array will only have one item. For interfaces, there may be multiple items. Sort the array
        // into alphabetical order before adding to our list of API items to visit. This ensures that in the case
        // of multiple interface inheritance, a member inherited from multiple interfaces is attributed to the interface
        // earlier in alphabetical order (as opposed to source order).
        //
        // For example, in the code block below, `Bar.x` is reported as the inherited item, not `Foo.x`.
        //
        // ```
        // interface Foo {
        //   public x: string;
        // }
        //
        // interface Bar {
        //   public x: string;
        // }
        //
        // interface FooBar extends Foo, Bar {}
        // ```
        LegacyAdapters.sortStable(extendedItems, (x: ApiItem, y: ApiItem) =>
          x.getSortKey().localeCompare(y.getSortKey())
        );

        toVisit.push(...extendedItems);
        next = toVisit.shift();
      }

      const foundMembers: ApiItem[] = [];
      for (const members of membersByName.values()) {
        foundMembers.push(...members);
      }
      for (const members of membersByKind.values()) {
        foundMembers.push(...members);
      }
      LegacyAdapters.sortStable(foundMembers, (x: ApiItem, y: ApiItem) =>
        x.getSortKey().localeCompare(y.getSortKey())
      );

      return {
        members: foundMembers,
        messages,
        maybeIncompleteResult
      };
    }

    /** @override */
    public static onDeserializeInto(
      options: Partial<IApiExtendsMixinOptions>,
      context: DeserializerContext,
      jsonObject: IApiExtendsMixinJson
    ): void {
      baseClass.onDeserializeInto(options, context, jsonObject);

      options.extendsTokenRanges = jsonObject.extendsTokenRanges;
    }

    public get extendsTypes(): HeritageType[] {
      return this[_extendsTypes];
    }

    /** @override */
    public serializeInto(jsonObject: Partial<IApiExtendsMixinJson>): void {
      super.serializeInto(jsonObject);

      jsonObject.extendsTokenRanges = this.extendsTypes.map((x) => x.excerpt.tokenRange);
    }
  }

  return MixedClass;
}

/**
 * Static members for {@link (ApiExtendsMixin:interface)}.
 * @public
 */
export namespace ApiExtendsMixin {
  /**
   * A type guard that tests whether the specified `ApiItem` subclass extends the `ApiExtendsMixin` mixin.
   *
   * @remarks
   *
   * The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of
   * the mixin function produces a different subclass.  (This could be mitigated by `Symbol.hasInstance`, however
   * the TypeScript type system cannot invoke a runtime test.)
   */
  export function isBaseClassOf(apiItem: ApiItem): apiItem is ApiExtendsMixin {
    return apiItem.hasOwnProperty(_extendsTypes);
  }
}
