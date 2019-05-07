// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageName } from '@microsoft/node-core-library';
import { DocComment, DocInlineTag } from '@microsoft/tsdoc';
import { ApiModel, ApiItem, ApiItemKind, ApiDocumentedItem } from '@microsoft/api-extractor-model';

import { IConfigFile, IConfigTableOfContents } from './IConfigFile';
import { IYamlTocItem, IYamlTocFile } from '../yaml/IYamlTocFile';
import { YamlDocumenter } from './YamlDocumenter';

/**
 * EXPERIMENTAL - This documenter is a prototype of a new config file driven mode of operation for
 * API Documenter.  It is not ready for general usage yet.  Its design may change in the future.
 */
export class ExperimentYamlDocumenter extends YamlDocumenter {
  private _config: IConfigTableOfContents;
  private _tocPointerMap: { [key: string]: IYamlTocItem };
  private _catchAllPointer: IYamlTocItem;

  public constructor(apiModel: ApiModel, configFile: IConfigFile) {
    super(apiModel);
    this._config = configFile.tableOfContents!;

    this._tocPointerMap = {}; // need a type?

    this._generateTocPointersMap(this._config.tocConfig);
  }

  /** @override */
  protected buildYamlTocFile(apiItems: ReadonlyArray<ApiItem>): IYamlTocFile {
    this._buildTocItems2(apiItems);
    return this._config.tocConfig;
  }

  private _buildTocItems2(apiItems: ReadonlyArray<ApiItem>): IYamlTocItem[] {
    const tocItems: IYamlTocItem[] = [];
    for (const apiItem of apiItems) {
      let tocItem: IYamlTocItem;

      if (apiItem.kind === ApiItemKind.Namespace) {
        // Namespaces don't have nodes yet
        tocItem = {
          name: apiItem.displayName
        };
      } else {
        if (this._shouldEmbed(apiItem.kind)) {
          // Don't generate table of contents items for embedded definitions
          continue;
        }

        if (apiItem.kind === ApiItemKind.Package) {
          tocItem = {
            name: PackageName.getUnscopedName(apiItem.displayName),
            uid: this._getUid(apiItem)
          };
        } else {
          tocItem = {
            name: apiItem.displayName,
            uid: this._getUid(apiItem)
          };
          // Filtering out the api-items as we build the tocItems array.
          if (apiItem instanceof ApiDocumentedItem) {
            const docInlineTag: DocInlineTag | undefined =
              (this._config && this._config.filterByInlineTag)
                ? this._findInlineTagByName(this._config.filterByInlineTag, apiItem.tsdocComment)
                : undefined;

                const tagContent: string | undefined =
              docInlineTag && docInlineTag.tagContent && docInlineTag.tagContent.trim();

            if (tagContent && this._tocPointerMap[tagContent]) {
              // null assertion used because when pointer map was created we checked for presence of empty `items` array
              this._tocPointerMap[tagContent].items!.push(tocItem);
            } else {
              if (this._catchAllPointer && this._catchAllPointer.items) {
                this._catchAllPointer.items.push(tocItem);
              }
            }
          }

        }
      }

      tocItems.push(tocItem);

      let children: ReadonlyArray<ApiItem>;
      if (apiItem.kind === ApiItemKind.Package) {
        // Skip over the entry point, since it's not part of the documentation hierarchy
        children = apiItem.members[0].members;
      } else {
        children = apiItem.members;
      }

      const childItems: IYamlTocItem[] = this._buildTocItems2(children);
      if (childItems.length > 0) {
        tocItem.items = childItems;
      }
    }
    return tocItems;
  }

  // Parses the tocConfig object to build a pointers map of nodes where we want to sort out the API items
  private _generateTocPointersMap(tocConfig: IYamlTocFile | IYamlTocItem): void {
    if (tocConfig.items) {
      for (const tocItem of tocConfig.items) {
        if (tocItem.items && tocItem.items.length > 0) {
          this._generateTocPointersMap(tocItem);
        } else {
          // check for presence of the `catchAllCategory` config option
          if (this._config && this._config.catchAllCategory && tocItem.name === this._config.catchAllCategory) {
            this._catchAllPointer = tocItem;
          } else {
            this._tocPointerMap[tocItem.name] = tocItem;
          }
        }
      }
    }
  }

  // This is a direct copy of a @docCategory inline tag finder in office-ui-fabric-react,
  // but is generic enough to be used for any inline tag
  private _findInlineTagByName(tagName: string, docComment: DocComment | undefined): DocInlineTag | undefined {
    if (docComment instanceof DocInlineTag) {
      if (docComment.tagName === tagName) {
        return docComment;
      }
    }
    if (docComment) {
      for (const childNode of docComment.getChildNodes()) {
        const result: DocInlineTag | undefined = this._findInlineTagByName(tagName, childNode as DocComment);
        if (result !== undefined) {
          return result;
        }
      }
    }
    return undefined;
  }
}
