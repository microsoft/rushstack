[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Outline](local.onenote_outline.md)

# OneNote\_Outline class

Represents a container for Paragraph objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_outline.id.md) |  | `string` | Gets the ID of the Outline object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`pageContent`](local.onenote_outline.pagecontent.md) |  | `OneNote.PageContent` | Gets the PageContent object that contains the Outline. This object defines the position of the Outline on the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraphs`](local.onenote_outline.paragraphs.md) |  | `OneNote.ParagraphCollection` | Gets the collection of Paragraph objects in the Outline. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendHtml(html)`](local.onenote_outline.appendhtml.md) |  | `void` | Adds the specified HTML to the bottom of the Outline. |
|  [`appendImage(base64EncodedImage, width, height)`](local.onenote_outline.appendimage.md) |  | `OneNote.Image` | Adds the specified image to the bottom of the Outline. |
|  [`appendRichText(paragraphText)`](local.onenote_outline.appendrichtext.md) |  | `OneNote.RichText` | Adds the specified text to the bottom of the Outline. |
|  [`appendTable(rowCount, columnCount, values)`](local.onenote_outline.appendtable.md) |  | `OneNote.Table` | Adds a table with the specified number of rows and columns to the bottom of the outline. |
|  [`load(option)`](local.onenote_outline.load.md) |  | `OneNote.Outline` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

