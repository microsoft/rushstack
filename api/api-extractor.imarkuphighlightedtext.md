[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IMarkupHighlightedText](./api-extractor.imarkuphighlightedtext.md)

# IMarkupHighlightedText interface

Source code shown in a fixed-width font, with syntax highlighting.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`highlighter`](./api-extractor.imarkuphighlightedtext.highlighter.md) | `MarkupHighlighter` | Indicates the syntax highlighting that will be applied to this text |
|  [`kind`](./api-extractor.imarkuphighlightedtext.kind.md) | `'code'` | The kind of markup element |
|  [`text`](./api-extractor.imarkuphighlightedtext.text.md) | `string` | The text content to display. |

## Remarks

NOTE: IMarkupHighlightedText is just a span of text, whereas IMarkupCodeBox is a box showing a larger code sample.
