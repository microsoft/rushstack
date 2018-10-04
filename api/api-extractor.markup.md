[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md)

# Markup class

Provides various operations for working with MarkupElement objects.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`BREAK`](./api-extractor.markup.break.md) |  | `IMarkupLineBreak` | A predefined constant for the IMarkupLineBreak element. |
|  [`PARAGRAPH`](./api-extractor.markup.paragraph.md) |  | `IMarkupParagraph` | A predefined constant for the IMarkupParagraph element. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendTextElements(output, text, options)`](./api-extractor.markup.appendtextelements.md) |  | `void` | Appends text content to the `output` array. If the last item in the array is a compatible IMarkupText element, the text will be merged into it. Otherwise, a new IMarkupText element will be created. |
|  [`createApiLink(textElements, target)`](./api-extractor.markup.createapilink.md) |  | `IMarkupApiLink` | Constructs an IMarkupApiLink element that represents a hyperlink to the specified API object. The hyperlink is applied to an existing stream of markup elements. |
|  [`createApiLinkFromText(text, target)`](./api-extractor.markup.createapilinkfromtext.md) |  | `IMarkupApiLink` | Constructs an IMarkupApiLink element that represents a hyperlink to the specified API object. The hyperlink is applied to a plain text string. |
|  [`createCode(code, highlighter)`](./api-extractor.markup.createcode.md) |  | `IMarkupHighlightedText` | Constructs an IMarkupHighlightedText element representing a program code text with optional syntax highlighting |
|  [`createCodeBox(code, highlighter)`](./api-extractor.markup.createcodebox.md) |  | `IMarkupCodeBox` | Constructs an IMarkupCodeBox element representing a program code text with the specified syntax highlighting |
|  [`createHeading1(text)`](./api-extractor.markup.createheading1.md) |  | `IMarkupHeading1` | Constructs an IMarkupHeading1 element with the specified title text |
|  [`createHeading2(text)`](./api-extractor.markup.createheading2.md) |  | `IMarkupHeading2` | Constructs an IMarkupHeading2 element with the specified title text |
|  [`createHtmlTag(token)`](./api-extractor.markup.createhtmltag.md) |  | `IMarkupHtmlTag` | Constructs an IMarkupHtmlTag element representing an opening or closing HTML tag. |
|  [`createNoteBox(textElements)`](./api-extractor.markup.createnotebox.md) |  | `IMarkupNoteBox` | Constructs an IMarkupNoteBox element that will display the specified markup content |
|  [`createNoteBoxFromText(text)`](./api-extractor.markup.createnoteboxfromtext.md) |  | `IMarkupNoteBox` | Constructs an IMarkupNoteBox element that will display the specified plain text string |
|  [`createPage(title)`](./api-extractor.markup.createpage.md) |  | `IMarkupPage` | Constructs an IMarkupTable element with the specified title. |
|  [`createTable(headerCellValues)`](./api-extractor.markup.createtable.md) |  | `IMarkupTable` | Constructs an IMarkupTable element containing the specified header cells, which each contain a sequence of MarkupBasicElement content. |
|  [`createTableRow(cellValues)`](./api-extractor.markup.createtablerow.md) |  | `IMarkupTableRow` | Constructs an IMarkupTableRow element containing the specified cells, which each contain a sequence of MarkupBasicElement content |
|  [`createTextElements(text, options)`](./api-extractor.markup.createtextelements.md) |  | `IMarkupText[]` | Constructs an IMarkupText element representing the specified text string, with optional formatting. |
|  [`createTextParagraphs(text, options)`](./api-extractor.markup.createtextparagraphs.md) |  | `MarkupBasicElement[]` | This function is similar to [Markup.createTextElements](./api-extractor.markup.createtextelements.md)<!-- -->, except that multiple newlines will be converted to a Markup.PARAGRAPH object. |
|  [`createWebLink(textElements, targetUrl)`](./api-extractor.markup.createweblink.md) |  | `IMarkupWebLink` | Constructs an IMarkupWebLink element that represents a hyperlink an internet URL. |
|  [`createWebLinkFromText(text, targetUrl)`](./api-extractor.markup.createweblinkfromtext.md) |  | `IMarkupWebLink` | Constructs an IMarkupWebLink element that represents a hyperlink an internet URL. |
|  [`extractTextContent(elements)`](./api-extractor.markup.extracttextcontent.md) |  | `string` | Extracts plain text from the provided markup elements, discarding any formatting. |
|  [`formatApiItemReference(apiItemReference)`](./api-extractor.markup.formatapiitemreference.md) |  | `string` | This formats an IApiItemReference as its AEDoc notation. |
|  [`normalize(elements)`](./api-extractor.markup.normalize.md) |  | `void` | Use this to clean up a MarkupElement sequence, assuming the sequence is now in its final form. |

