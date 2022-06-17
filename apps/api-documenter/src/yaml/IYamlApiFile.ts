// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * TypeScript interface describing a Universal Reference YAML documentation file,
 * as defined by typescript.schema.json.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.PageViewModel` in DocFX.
 */
export interface IYamlApiFile {
  /**
   * The items contained in this file.
   *
   * NOTE: Corresponds to `ExceptionInfo.Items` in DocFX.
   */
  items: IYamlItem[];

  /**
   * References to other items.
   *
   * NOTE: Corresponds to `ExceptionInfo.References` in DocFX.
   */
  references?: IYamlReference[];

  /**
   * NOTE: Corresponds to `ExceptionInfo.ShouldSkipMarkup` in DocFX.
   */
  shouldSkipMarkup?: boolean;
}

/**
 * Part of the IYamlApiFile structure. Represents basic API elements such as
 * classes, interfaces, members, etc.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.ItemViewModel` in DocFX.
 */
export interface IYamlItem {
  /**
   * The Unique Identifier (UID) for this item.
   *
   * NOTE: Corresponds to `ItemViewModel.Uid` in DocFX.
   */
  uid: string;

  /**
   * A Roslyn comment ID (unused).
   *
   * NOTE: Corresponds to `ItemViewModel.CommentId` in DocFX.
   */
  commentId?: string;

  /**
   * The ID for this item.
   *
   * NOTE: Corresponds to `ItemViewModel.Id` in DocFX.
   */
  id?: string;

  /**
   * The Unique Identifier (UID) of the parent item. This value can vary by development language
   * by setting the relevant `parent.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Parent` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.ParentInDevLangs` in DocFX when `parent.${lang}` is used.
   */
  parent?: string;
  'parent.typeScript'?: string;

  /**
   * The Unique Identifiers (UID) of the children of this item. This value can vary by development language
   * by setting the relevant `children.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Children` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.ChildrenInDevLangs` in DocFX when `children.${lang}` is used.
   */
  children?: string[];
  'children.typeScript'?: string[];

  /**
   * Item's link URL. An item can only have a single link in cross references, so varying `href` by development
   * languages is not supported.
   *
   * NOTE: Corresponds to `ItemViewModel.Href` in DocFX.
   */
  href?: string;

  /**
   * The development languages supported by this item.
   *
   * NOTE: Corresponds to `ItemViewModel.SupportedLanguages` in DocFX.
   */
  langs?: YamlDevLangs[];

  /**
   * The local name of this item. This name should generally not be namespace qualified or include
   * parent type information. This value can vary by development language by setting the relevant
   * `name.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Name` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.Names` in DocFX when `name.${lang}` is used.
   */
  name?: string;
  'name.typeScript'?: string;

  /**
   * The name of this item including its parent type, if it has one. This name should generally not be namespace
   * qualified. This value can vary by development language by setting the relevant `nameWithType.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.NameWithType` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.NamesWithType` in DocFX when `nameWithType.${lang}` is used.
   */
  nameWithType?: string;
  'nameWithType.typeScript'?: string;

  /**
   * The namespace-qualified name of this item including its parent type. This value can vary by development language
   * by setting the relevant `fullName.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.FullName` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.FullNames` in DocFX when `fullName.${lang}` is used.
   */
  fullName?: string;
  'fullName.typeScript'?: string;

  /**
   * The type of source element this item represents. This value cannot vary by development language.
   *
   * NOTE: Corresponds to `ItemViewModel.Type` in DocFX.
   */
  type: YamlTypeId;

  /**
   * The location of the item's source. This value can vary by development language by setting the relevant
   * `source.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Source` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.SourceInDevLangs` in DocFX when `source.${lang}` is used.
   */
  source?: IYamlSource;
  'source.typeScript'?: IYamlSource;

  /**
   * The location of the item's documentation overrides. This value cannot vary by development language.
   *
   * NOTE: Corresponds to `ItemViewModel.Documentation` in DocFX.
   */
  documentation?: IYamlSource;

  /**
   * The names of managed assemblies that contain this item. This value can vary by development language by setting
   * the relevant `assemblies.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.AssemblyNameList` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.AssemblyNameListInDevLangs` in DocFX when `assemblies.${lang}` is used.
   */
  assemblies?: string[];
  'assemblies.typeScript'?: string[];

  /**
   * The Unique Identifier (UID) of the namespace that contains this item. This value can vary by development language
   * by setting the relevant `namespace.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.NamespaceName` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.NamespaceNameInDevLangs` in DocFX.
   */
  namespace?: string;
  'namespace.typeScript'?: string;

  /**
   * The summary for the item. This value cannot vary by development language.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ItemViewModel.Summary` in DocFX.
   */
  summary?: string;

  /**
   * The remarks for the item. This value cannot vary by development language.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ItemViewModel.Remarks` in DocFX.
   */
  remarks?: string;

  /**
   * The examples for the item. This value cannot vary by development language.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ItemViewModel.Examples` in DocFX.
   */
  example?: string[];

  /**
   * The syntax for this item. This value itself cannot vary by development language, but
   * instead contains properties that may vary by development language.
   *
   * NOTE: Corresponds to `ItemViewModel.Syntax` in DocFX.
   */
  syntax?: IYamlSyntax;

  /**
   * The Unique Identifier (UID) of the member this item overrides. This value can vary by development language
   * by setting the relevant `overridden.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Overridden` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.OverriddenInDevLangs` in DocFX when `overriden.${lang}` is used.
   */
  overridden?: string;
  'overridden.typeScript'?: string;

  /**
   * The Unique Identifier (UID) of the member this item overloads. This value can vary by development language
   * by setting the relevant `overload.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Overload` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.OverloadInDevLangs` in DocFX when `overload.${lang}` is used.
   */
  overload?: string;
  'overload.typeScript'?: string;

  /**
   * The exceptions thrown by this item. This value can vary by development language by setting the relevant
   * `exceptions.${lang}` property.
   *
   * NOTE: Corresponds to `ItemViewModel.Exceptions` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.ExceptionsInDevLangs` in DocFX when `exceptions.${lang}` is used.
   */
  exceptions?: IYamlException[];
  'exceptions.typeScript'?: IYamlException[];

  /**
   * Links to additional content related to this item.
   *
   * NOTE: Corresponds to `ItemViewModel.SeeAlsos` in DocFX.
   */
  seealso?: IYamlLink[];

  /**
   * Additional information about other content related to this item.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ItemViewModel.SeeAlsoContent` in DocFX.
   */
  seealsoContent?: string;

  /**
   * Links to additional content related to this item.
   *
   * NOTE: Corresponds to `ItemViewModel.Sees` in DocFX.
   */
  see?: IYamlLink[];

  /**
   * The inheritance tree for this item. Multiple inheritance is permitted for languages like Python.
   *
   * NOTE: Corresponds to `ItemViewModel.Inheritance` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.InheritanceInDevLangs` in DocFX when `inheritance.${lang}` is used.
   */
  inheritance?: IYamlInheritanceTree[];
  'inheritance.typeScript'?: IYamlInheritanceTree[];

  /**
   * NOTE: Corresponds to `ItemViewModel.DerivedClassses` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.DerivedClasssesInDevLangs` in DocFX when `derivedClasses.${lang}` is used.
   */
  derivedClasses?: string[];
  'derivedClasses.typeScript'?: string[];

  /**
   * NOTE: Corresponds to `ItemViewModel.Implements` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.ImplementsInDevLangs` in DocFX when `implements.${lang}` is used.
   */
  implements?: string[];
  'implements.typeScript'?: string[];

  /**
   * NOTE: Corresponds to `ItemViewModel.InheritedMembers` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.InheritedMembersInDevLangs` in DocFX when `inheritedMembers.${lang}` is used.
   */
  inheritedMembers?: string[];
  'inheritedMembers.typeScript'?: string[];

  /**
   * NOTE: Corresponds to `ItemViewModel.ExtensionMethods` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.ExtensionMethodsInDevLangs` in DocFX when `extensionMethods.${lang}` is used.
   */
  extensionMethods?: string[];
  'extensionMethods.typeScript'?: string[];

  /**
   * NOTE: Corresponds to `ItemViewModel.Conceptual` in DocFX.
   */
  conceptual?: string;

  /**
   * NOTE: Corresponds to `ItemViewModel.Platform` in DocFX.
   * NOTE: Corresponds to `ItemViewModel.PlatformInDevLangs` in DocFX when `platform.${lang}` is used.
   */
  platform?: string[];
  'platform.typeScript'?: string[];

  /**
   * NOTE: This is an extension and corresponds to `ItemViewModel.Metadata` in DocFX.
   */
  deprecated?: IYamlDeprecatedNotice;

  /**
   * NOTE: This is an extension and corresponds to `ItemViewModel.Metadata` in DocFX.
   */
  extends?: string[];

  /**
   * NOTE: This is an extension and corresponds to `ItemViewModel.Metadata` in DocFX.
   */
  isPreview?: boolean;

  /**
   * NOTE: In TypeScript, enum members can be strings or integers.
   * If it is an integer, then enumMember.value will be a string representation of the integer.
   * If it is a string, then enumMember.value will include the quotation marks.
   *
   * NOTE: This is an extension and corresponds to `ItemViewModel.Metadata` in DocFX.
   */
  numericValue?: string;

  /**
   * NOTE: This is an extension and corresponds to `ItemViewModel.Metadata` in DocFX.
   */
  package?: string;
}

/**
 * Part of the IYamlApiFile structure. Represents the type of an IYamlItem.
 */
export type YamlTypeId =
  | 'class'
  | 'constructor'
  | 'enum'
  | 'field'
  | 'function'
  | 'interface'
  | 'method'
  | 'package'
  | 'property'
  | 'event'
  | 'typealias'
  | 'variable'
  | 'namespace';

/**
 * Development languages supported by the Universal Reference file format, as defined by typescript.schema.json.
 */
export type YamlDevLangs = 'typeScript';

/**
 * Part of the IYamlApiFile structure.  Documents the source file where an IYamlItem is defined.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.Common.SourceDetail` in DocFX.
 */
export interface IYamlSource {
  /**
   * Information about the Git repository where this source can be found.
   *
   * NOTE: Corresponds to `SourceDetail.Remote` in DocFX.
   */
  remote?: IYamlRemote;

  /**
   * The base path for the source for this item.
   *
   * NOTE: Corresponds to `SourceDetail.BasePath` in DocFX.
   */
  basePath?: string;

  /**
   * The name of the item.
   *
   * NOTE: Corresponds to `SourceDetail.Name` in DocFX.
   */
  id?: string;

  /**
   * A link to the source for this item.
   *
   * NOTE: Corresponds to `SourceDetail.Href` in DocFX.
   */
  href?: string;

  /**
   * The path to the source for this item. This path will be made relative to `basePath` in the documentation.
   *
   * NOTE: Corresponds to `SourceDetail.Path` in DocFX.
   */
  path?: string;

  /**
   * The starting line of the source for this item.
   *
   * NOTE: Corresponds to `SourceDetail.StartLine` in DocFX.
   */
  startLine?: number;

  /**
   * The ending line of the source for this item.
   *
   * NOTE: Corresponds to `SourceDetail.EndLine` in DocFX.
   */
  endLine?: number;

  /**
   * The content of the source for this item.
   *
   * NOTE: Corresponds to `SourceDetail.Content` in DocFX.
   */
  content?: string;

  /**
   * Indicates whether the path to the source is not locally available.
   *
   * NOTE: Corresponds to `SourceDetail.IsExternal` in DocFX.
   */
  isExternal?: boolean;
}

/**
 * Part of the IYamlApiFile structure.  Indicates the open source Git repository
 * where an IYamlItem is defined.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.Common.GitDetail` in DocFX.
 */
export interface IYamlRemote {
  /**
   * The relative path of the current item to the Git repository root directory.
   *
   * NOTE: Corresponds to `GitDetail.RelativePath` in DocFX.
   */
  path?: string;

  /**
   * The Git branch in which this item can be found.
   *
   * NOTE: Corresponds to `GitDetail.RemoteBranch` in DocFX.
   */
  branch?: string;

  /**
   * The Git repository in which this item can be found.
   *
   * NOTE: Corresponds to `GitDetail.RemoteRepositoryUrl` in DocFX.
   */
  repo?: string;
}

/**
 * Part of the IYamlApiFile structure.  Documents the type signature for an IYamlItem.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.SyntaxDetailViewModel` in DocFX.
 */
export interface IYamlSyntax {
  /**
   * The content for the syntax of this item.
   *
   * NOTE: Corresponds to `SyntaxDetailViewModel.Content` in DocFX.
   * NOTE: Corresponds to `SyntaxDetailViewModel.Contents` in DocFX when `content.${lang}` is used.
   */
  content?: string;
  'content.typeScript'?: string;

  /**
   * The parameters for this item.
   *
   * NOTE: Corresponds to `SyntaxDetailViewModel.Parameters` in DocFX.
   */
  parameters?: IYamlParameter[];

  /**
   * The type parameters for this item.
   *
   * NOTE: Corresponds to `SyntaxDetailViewModel.TypeParameters` in DocFX.
   */
  typeParameters?: IYamlParameter[];

  /**
   * The return type for this item.
   *
   * NOTE: Corresponds to `SyntaxDetailViewModel.Return` in DocFX.
   * NOTE: Corresponds to `SyntaxDetailViewModel.ReturnInDevLangs` in DocFX when `return.${lang}` is used.
   */
  return?: IYamlReturn;
  'return.typeScript'?: IYamlReturn;
}

/**
 * Part of the IYamlApiFile structure.  Represents a method or function parameter.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.ApiParameter` in DocFX.
 */
export interface IYamlParameter {
  /**
   * The name of the parameter.
   *
   * NOTE: Corresponds to `ApiParameter.Name` in DocFX.
   */
  id?: string;

  /**
   * The Unique Identifiers (UIDs) of the types for this parameter.
   *
   * NOTE: Corresponds to `ApiParameter.Type` in DocFX.
   */
  type?: string[];

  /**
   * The description for this parameter.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ApiParameter.Description` in DocFX.
   */
  description?: string;

  /**
   * Indicates whether the parameter is optional.
   *
   * NOTE: Corresponds to `ApiParameter.Optional` in DocFX.
   */
  optional?: boolean;

  /**
   * The default value for the parameter.
   *
   * NOTE: Corresponds to `ApiParameter.DefaultValue` in DocFX.
   */
  defaultValue?: string;
}

/**
 * Part of the IYamlApiFile structure. Documents the return value of a function
 * or method.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.ApiParameter` in DocFX.
 */
export interface IYamlReturn {
  /**
   * The Unique Identifiers (UIDs) of the types for this parameter.
   *
   * NOTE: Corresponds to `ApiParameter.Type` in DocFX.
   */
  type?: string[];

  /**
   * The description for this parameter.
   * Markdown is permitted.
   *
   * NOTE: Corresponds to `ApiParameter.Description` in DocFX.
   */
  description?: string;
}

/**
 * Part of the IYamlApiFile structure.  Used to document exceptions that can be thrown
 * by a method, property, function, or constructor.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.ExceptionInfo` in DocFX.
 */
export interface IYamlException {
  /**
   * The Unique Identifier (UID) of the type for this exception.
   *
   * NOTE: Corresponds to `ExceptionInfo.Type` in DocFX.
   */
  type?: string;

  /**
   * The description for this exception.
   *
   * NOTE: Corresponds to `ExceptionInfo.Description` in DocFX.
   */
  description?: string;
}

/**
 * Part of the IYamlApiFile structure. Used to indicate links to external content or other documentation.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.LinkInfo` in DocFX.
 */
export interface IYamlLink {
  /**
   * The type of link.
   *
   * The value `"CRef"` indicates that `linkId` is a Unique Identifier (UID) reference to
   * another documentation entry.
   *
   * The value `"HRef"` indicates that `linkId` is a link to external documentation.
   * NOTE: Corresponds to `LinkInfo.LinkType` in DocFX.
   */
  linkType: 'CRef' | 'HRef';

  /**
   * When `linkType` is `"CRef"`, this is a Unique Identifier (UID) reference to another documentation entry.
   *
   * When `linkType` is `"HRef"`, this is a link to external documentation.
   *
   * NOTE: Corresponds to `LinkInfo.LinkId` in DocFX.
   */
  linkId: string;

  /**
   * A Roslyn comment ID for this link.
   *
   * NOTE: Corresponds to `LinkInfo.CommentId` in DocFX.
   */
  commentId?: string;

  /**
   * Alternate text to display for thie link.
   *
   * NOTE: Corresponds to `LinkInfo.AltText` in DocFX.
   */
  altText?: string;
}

/**
 * Part of the IYamlApiFile structure. Represents the inheritance hierarchy of an item.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.UniversalReference.InheritanceTree` in DocFX.
 */
export interface IYamlInheritanceTree {
  /**
   * The Unique Identifier (UID) of the type from which an item or type inherits.
   *
   * NOTE: Corresponds to `InheritanceTree.Type` in DocFX.
   */
  type: string;

  /**
   * The inheritance tree for the specified type. Multiple inheritance is permitted for languages like Python.
   *
   * NOTE: Corresponds to `InheritanceTree.Inheritance` in DocFX.
   */
  inheritance?: IYamlInheritanceTree[];
}

/**
 * Part of the IYamlApiFile structure. Represents a reference to an item that is
 * declared in a separate YAML file.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.Common.ReferenceViewModel` in DocFX.
 */
export interface IYamlReference {
  /**
   * NOTE: Corresponds to `ReferenceViewModel.Uid` in DocFX.
   */
  uid?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.CommentId` in DocFX.
   */
  commentId?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.Parent` in DocFX.
   */
  parent?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.Definition` in DocFX.
   */
  definition?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.IsExternal` in DocFX.
   */
  isExternal?: boolean;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.Href` in DocFX.
   */
  href?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.Name` in DocFX.
   * NOTE: Corresponds to `ReferenceViewModel.NameInDevLangs` in DocFX when `name.${lang}` is used.
   */
  name?: string;
  'name.typeScript'?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.NameWithType` in DocFX.
   * NOTE: Corresponds to `ReferenceViewModel.NameWithTypeInDevLangs` in DocFX when `nameWithType.${lang}` is used.
   */
  nameWithType?: string;
  'nameWithType.typeScript'?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.FullName` in DocFX.
   * NOTE: Corresponds to `ReferenceViewModel.FullNameInDevLangs` in DocFX when `fullName.${lang}` is used.
   */
  fullName?: string;
  'fullName.typeScript'?: string;

  /**
   * NOTE: Corresponds to `ReferenceViewModel.Spec` in DocFX.
   */
  'spec.typeScript'?: IYamlReferenceSpec[];
}

/**
 * Part of the IYamlApiFile structure. Represents a text specification for a reference.
 *
 * NOTE: Corresponds to `Microsoft.DocAsCode.DataContracts.Common.SpecViewModel` in DocFX.
 */
export interface IYamlReferenceSpec {
  /**
   * NOTE: Corresponds to `SpecViewModel.Uid` in DocFX.
   */
  uid?: string;

  /**
   * NOTE: Corresponds to `SpecViewModel.Name` in DocFX.
   */
  name?: string;

  /**
   * NOTE: Corresponds to `SpecViewModel.NameWithType` in DocFX.
   */
  nameWithType?: string;

  /**
   * NOTE: Corresponds to `SpecViewModel.FullName` in DocFX.
   */
  fullName?: string;

  /**
   * NOTE: Corresponds to `SpecViewModel.IsExternal` in DocFX.
   */
  isExternal?: boolean;

  /**
   * NOTE: Corresponds to `SpecViewModel.Href` in DocFX.
   */
  href?: string;
}

/**
 * NOTE: This is an extension to the Universal Reference format and does not correspond to
 * a known type in DocFX.
 */
export interface IYamlDeprecatedNotice {
  content: string;
}
