[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Paragraph](local.onenote_paragraph.md)

# OneNote\_Paragraph class

A container for the visible content on a page. A Paragraph can contain any one ParagraphType type of content. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_paragraph.id.md) |  | `string` | Gets the ID of the Paragraph object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`image`](local.onenote_paragraph.image.md) |  | `OneNote.Image` | Gets the Image object in the Paragraph. Throws an exception if ParagraphType is not Image. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`inkWords`](local.onenote_paragraph.inkwords.md) |  | `OneNote.InkWordCollection` | Gets the Ink collection in the Paragraph. Throws an exception if ParagraphType is not Ink. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`outline`](local.onenote_paragraph.outline.md) |  | `OneNote.Outline` | Gets the Outline object that contains the Paragraph. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraphs`](local.onenote_paragraph.paragraphs.md) |  | `OneNote.ParagraphCollection` | The collection of paragraphs under this paragraph. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentParagraph`](local.onenote_paragraph.parentparagraph.md) |  | `OneNote.Paragraph` | Gets the parent paragraph object. Throws if a parent paragraph does not exist. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentParagraphOrNull`](local.onenote_paragraph.parentparagraphornull.md) |  | `OneNote.Paragraph` | Gets the parent paragraph object. Returns null if a parent paragraph does not exist. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentTableCell`](local.onenote_paragraph.parenttablecell.md) |  | `OneNote.TableCell` | Gets the TableCell object that contains the Paragraph if one exists. If parent is not a TableCell, throws ItemNotFound. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentTableCellOrNull`](local.onenote_paragraph.parenttablecellornull.md) |  | `OneNote.TableCell` | Gets the TableCell object that contains the Paragraph if one exists. If parent is not a TableCell, returns null. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`richText`](local.onenote_paragraph.richtext.md) |  | `OneNote.RichText` | Gets the RichText object in the Paragraph. Throws an exception if ParagraphType is not RichText. Read-only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`table`](local.onenote_paragraph.table.md) |  | `OneNote.Table` | Gets the Table object in the Paragraph. Throws an exception if ParagraphType is not Table. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`type`](local.onenote_paragraph.type.md) |  | `string` | Gets the type of the Paragraph object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.onenote_paragraph.delete.md) |  | `void` | Deletes the paragraph <p/> \[Api set: OneNoteApi 1.1\] |
|  [`insertHtmlAsSibling(insertLocation, html)`](local.onenote_paragraph.inserthtmlassibling.md) |  | `void` | Inserts the specified HTML content |
|  [`insertImageAsSibling(insertLocation, base64EncodedImage, width, height)`](local.onenote_paragraph.insertimageassibling.md) |  | `OneNote.Image` | Inserts the image at the specified insert location.. |
|  [`insertRichTextAsSibling(insertLocation, paragraphText)`](local.onenote_paragraph.insertrichtextassibling.md) |  | `OneNote.RichText` | Inserts the paragraph text at the specifiec insert location. |
|  [`insertTableAsSibling(insertLocation, rowCount, columnCount, values)`](local.onenote_paragraph.inserttableassibling.md) |  | `OneNote.Table` | Adds a table with the specified number of rows and columns before or after the current paragraph. |
|  [`load(option)`](local.onenote_paragraph.load.md) |  | `OneNote.Paragraph` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

