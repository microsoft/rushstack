// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSDocConfiguration, DocNodeKind } from '@microsoft/tsdoc';

import { DocEmphasisSpan } from './DocEmphasisSpan';
import { DocHeading } from './DocHeading';
import { DocNoteBox } from './DocNoteBox';
import { DocTable } from './DocTable';
import { DocTableCell } from './DocTableCell';
import { DocTableRow } from './DocTableRow';

/**
 * Identifies custom subclasses of {@link DocNode}.
 */
export enum CustomDocNodeKind {
  EmphasisSpan = 'EmphasisSpan',
  Heading = 'Heading',
  NoteBox = 'NoteBox',
  Table = 'Table',
  TableCell = 'TableCell',
  TableRow = 'TableRow'
}

export class CustomDocNodes {
  private static _configuration: TSDocConfiguration | undefined;

  public static get configuration(): TSDocConfiguration {
    if (CustomDocNodes._configuration === undefined) {
      const configuration: TSDocConfiguration = new TSDocConfiguration();

      configuration.docNodeManager.registerDocNodes('@micrososft/api-documenter', [
        { docNodeKind: CustomDocNodeKind.EmphasisSpan, constructor: DocEmphasisSpan },
        { docNodeKind: CustomDocNodeKind.Heading, constructor: DocHeading },
        { docNodeKind: CustomDocNodeKind.NoteBox, constructor: DocNoteBox },
        { docNodeKind: CustomDocNodeKind.Table, constructor: DocTable },
        { docNodeKind: CustomDocNodeKind.TableCell, constructor: DocTableCell },
        { docNodeKind: CustomDocNodeKind.TableRow, constructor: DocTableRow }
      ]);

      configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.EmphasisSpan, [
        DocNodeKind.PlainText,
        DocNodeKind.SoftBreak
      ]);

      configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Section, [
        CustomDocNodeKind.Heading,
        CustomDocNodeKind.NoteBox,
        CustomDocNodeKind.Table
      ]);

      configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Paragraph, [
        CustomDocNodeKind.EmphasisSpan
      ]);

      CustomDocNodes._configuration = configuration;
    }
    return CustomDocNodes._configuration;
  }
}
