// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DocSection,
  TSDocConfiguration,
  DocPlainText,
  StringBuilder,
  DocParagraph,
  DocSoftBreak,
  DocLinkTag,
  DocHtmlStartTag,
  DocHtmlEndTag,
  DocBlockTag
} from '@microsoft/tsdoc';

import { CustomDocNodes } from '../../nodes/CustomDocNodeKind';
import { DocHeading } from '../../nodes/DocHeading';
import { DocEmphasisSpan } from '../../nodes/DocEmphasisSpan';
import { DocTable } from '../../nodes/DocTable';
import { DocTableRow } from '../../nodes/DocTableRow';
import { DocTableCell } from '../../nodes/DocTableCell';
import { CustomMarkdownEmitter } from '../CustomMarkdownEmitter';
import { ApiModel, ApiItem } from '@microsoft/api-extractor-model';

test('render Markdown from TSDoc', () => {
  const configuration: TSDocConfiguration = CustomDocNodes.configuration;

  const output: DocSection = new DocSection({ configuration });

  output.appendNodes([
    new DocHeading({ configuration, title: 'Simple bold test' }),
    new DocParagraph({ configuration }, [
      new DocPlainText({ configuration, text: 'This is a ' }),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'bold' })]),
      new DocPlainText({ configuration, text: ' word.' })
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'All whitespace bold' }),
    new DocParagraph({ configuration }, [
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: '  ' })])
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Newline bold' }),
    new DocParagraph({ configuration }, [
      new DocEmphasisSpan({ configuration, bold: true }, [
        new DocPlainText({ configuration, text: 'line 1' }),
        new DocSoftBreak({ configuration }),
        new DocPlainText({ configuration, text: 'line 2' })
      ])
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Newline bold with spaces' }),
    new DocParagraph({ configuration }, [
      new DocEmphasisSpan({ configuration, bold: true }, [
        new DocPlainText({ configuration, text: '  line 1  ' }),
        new DocSoftBreak({ configuration }),
        new DocPlainText({ configuration, text: '  line 2  ' }),
        new DocSoftBreak({ configuration }),
        new DocPlainText({ configuration, text: '  line 3  ' })
      ])
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Adjacent bold regions' }),
    new DocParagraph({ configuration }, [
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'one' })]),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'two' })]),
      new DocEmphasisSpan({ configuration, bold: true }, [
        new DocPlainText({ configuration, text: ' three ' })
      ]),
      new DocPlainText({ configuration, text: '' }),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'four' })]),
      new DocPlainText({ configuration, text: 'non-bold' }),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'five' })])
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Adjacent to other characters' }),
    new DocParagraph({ configuration }, [
      new DocLinkTag({
        configuration,
        tagName: '@link',
        linkText: 'a link',
        urlDestination: './index.md'
      }),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'bold' })]),
      new DocPlainText({ configuration, text: 'non-bold' }),
      new DocPlainText({ configuration, text: 'more-non-bold' })
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Unknown block tag' }),
    new DocParagraph({ configuration }, [
      new DocBlockTag({
        configuration,
        tagName: '@unknown'
      }),
      new DocEmphasisSpan({ configuration, bold: true }, [new DocPlainText({ configuration, text: 'bold' })]),
      new DocPlainText({ configuration, text: 'non-bold' }),
      new DocPlainText({ configuration, text: 'more-non-bold' })
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Bad characters' }),
    new DocParagraph({ configuration }, [
      new DocEmphasisSpan({ configuration, bold: true }, [
        new DocPlainText({ configuration, text: '*one*two*' })
      ]),
      new DocEmphasisSpan({ configuration, bold: true }, [
        new DocPlainText({ configuration, text: 'three*four' })
      ])
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Characters that should be escaped' }),
    new DocParagraph({ configuration }, [
      new DocPlainText({ configuration, text: 'Double-encoded JSON: "{ \\"A\\": 123}"' })
    ]),
    new DocParagraph({ configuration }, [
      new DocPlainText({ configuration, text: 'HTML chars: <script>alert("[You] are #1!");</script>' })
    ]),
    new DocParagraph({ configuration }, [new DocPlainText({ configuration, text: 'HTML escape: &quot;' })]),
    new DocParagraph({ configuration }, [
      new DocPlainText({ configuration, text: '3 or more hyphens: - -- --- ---- ----- ------' })
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'HTML tag' }),
    new DocParagraph({ configuration }, [
      new DocHtmlStartTag({ configuration, name: 'b' }),
      new DocPlainText({ configuration, text: 'bold' }),
      new DocHtmlEndTag({ configuration, name: 'b' })
    ])
  ]);

  output.appendNodes([
    new DocHeading({ configuration, title: 'Table' }),
    new DocTable(
      {
        configuration,
        headerTitles: ['Header 1', 'Header 2']
      },
      [
        new DocTableRow({ configuration }, [
          new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [new DocPlainText({ configuration, text: 'Cell 1' })])
          ]),
          new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [new DocPlainText({ configuration, text: 'Cell 2' })])
          ])
        ])
      ]
    )
  ]);

  const stringBuilder: StringBuilder = new StringBuilder();
  const apiModel: ApiModel = new ApiModel();
  const markdownEmitter: CustomMarkdownEmitter = new CustomMarkdownEmitter(apiModel);
  markdownEmitter.emit(stringBuilder, output, {
    contextApiItem: undefined,
    onGetFilenameForApiItem: (apiItem: ApiItem) => {
      return '#';
    }
  });

  expect(stringBuilder).toMatchSnapshot();
});
