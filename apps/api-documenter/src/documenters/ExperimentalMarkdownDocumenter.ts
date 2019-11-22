import { ApiItem, ApiDocumentedItem, ApiItemKind, ApiPackage, ApiNamespace } from '@microsoft/api-extractor-model';
import { DocInlineTag, DocComment, DocSection, TSDocConfiguration } from '@microsoft/tsdoc';
import { DocHeading } from '../nodes/DocHeading';
import { DocTable } from '../nodes/DocTable';
import { DocTableRow } from '../nodes/DocTableRow';
import { MarkdownDocumenter } from './MarkdownDocumenter';

/**
 * EXPERIMENTAL - This documenter is a prototype of a new config file driven mode of operation for
 * API Documenter.  It is not ready for general usage yet.  Its design may change in the future.
 */
export class ExperimentalMarkdownDocumenter extends MarkdownDocumenter {

  // This is a direct copy of the _findInlineTagByName function in the ExperimentalYamlDocumenter class.
  private _findInlineTagByName(tagName: string, docComment: DocComment | undefined): DocInlineTag | undefined {
    const tagNameToCheck: string = `@${tagName}`;

    if (docComment instanceof DocInlineTag) {
      if (docComment.tagName === tagNameToCheck) {
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

  private _categorizeItems(apiItems: ReadonlyArray<ApiItem>): { [tagContent: string]: ApiItem[] } {
    const categoryMap: { [tagContent: string]: ApiItem[] } = {};

    let inlineTagName: string | undefined;
    if (this._documenterConfig && this._documenterConfig.configFile.tableOfContents) {
      inlineTagName = this._documenterConfig.configFile.tableOfContents.categoryInlineTag;
    }

    if (inlineTagName) {
      for (const apiItem of apiItems) {
        let filtered: boolean = false;
        if (apiItem instanceof ApiDocumentedItem) {

          const inlineTag: DocInlineTag | undefined = this._findInlineTagByName(inlineTagName, apiItem.tsdocComment);
          const tagContent: string | undefined = inlineTag && inlineTag.tagContent && inlineTag.tagContent.trim();

          if (tagContent) {
            if (!categoryMap.hasOwnProperty(tagContent)) {
              categoryMap[tagContent] = [];
            }
            categoryMap[tagContent].push(apiItem);
            filtered = true;
          }

          if (!filtered) {
            if (!categoryMap.hasOwnProperty('Uncategorized')) {
              categoryMap.Uncategorized = [];
            }
            categoryMap.Uncategorized.push(apiItem);
          }
        }
      }
    }
    return categoryMap;
  }

  private _writeTable(configuration: TSDocConfiguration, output: DocSection, apiMembers: ReadonlyArray<ApiItem>, category?: string): void {
    let headingLevel: number = 1;

    const classesTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Class', 'Description' ]
    });

    const enumerationsTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Enumeration', 'Description' ]
    });

    const functionsTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Function', 'Description' ]
    });

    const interfacesTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Interface', 'Description' ]
    });

    const namespacesTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Namespace', 'Description' ]
    });

    const variablesTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Variable', 'Description' ]
    });

    const typeAliasesTable: DocTable = new DocTable({ configuration,
      headerTitles: [ 'Type Alias', 'Description' ]
    });

    if (category) {
      headingLevel = 2;
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: category }));
    }

    for (const apiMember of apiMembers) {
      const row: DocTableRow = new DocTableRow({ configuration }, [
        this._createTitleCell(apiMember),
        this._createDescriptionCell(apiMember)
      ]);

      switch (apiMember.kind) {
        case ApiItemKind.Class:
          classesTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.Enum:
          enumerationsTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.Interface:
          interfacesTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.Namespace:
          namespacesTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.Function:
          functionsTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.TypeAlias:
          typeAliasesTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;

        case ApiItemKind.Variable:
          variablesTable.addRow(row);
          this._writeApiItemPage(apiMember);
          break;
      }
    }

    if (classesTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Classes', level: headingLevel }));
      output.appendNode(classesTable);
    }

    if (enumerationsTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Enumerations', level: headingLevel }));
      output.appendNode(enumerationsTable);
    }

    if (functionsTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Functions', level: headingLevel }));
      output.appendNode(functionsTable);
    }

    if (interfacesTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Interfaces', level: headingLevel }));
      output.appendNode(interfacesTable);
    }

    if (namespacesTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Namespaces', level: headingLevel }));
      output.appendNode(namespacesTable);
    }

    if (variablesTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Variables', level: headingLevel }));
      output.appendNode(variablesTable);
    }

    if (typeAliasesTable.rows.length > 0) {
      output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Type Aliases', level: headingLevel }));
      output.appendNode(typeAliasesTable);
    }
  }

  /**
   * GENERATE PAGE: PACKAGE or NAMESPACE
   */
  protected _writePackageOrNamespaceTables(output: DocSection, apiContainer: ApiPackage | ApiNamespace): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const apiMembers: ReadonlyArray<ApiItem> = apiContainer.kind === ApiItemKind.Package ?
      (apiContainer as ApiPackage).entryPoints[0].members
      : (apiContainer as ApiNamespace).members;

    const categoryMap: { [tagContent: string]: ReadonlyArray<ApiItem> } = this._categorizeItems(apiMembers);

    const categories: string[] = Object.keys(categoryMap);
    if (categories.length > 0) {
      // Write one table per category, alphabetized by category
      for (const category of categories.sort()) {
        this._writeTable(configuration, output, categoryMap[category], category);
      }
    } else {
      // No categories, just write one table
      this._writeTable(configuration, output, apiMembers);
    }
  }
}