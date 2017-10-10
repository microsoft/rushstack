[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Image](local.onenote_image.md)

# OneNote\_Image class

Represents an Image. An Image can be a direct child of a PageContent object or a Paragraph object. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`description`](local.onenote_image.description.md) |  | `string` | Gets or sets the description of the Image. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`height`](local.onenote_image.height.md) |  | `number` | Gets or sets the height of the Image layout. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`hyperlink`](local.onenote_image.hyperlink.md) |  | `string` | Gets or sets the hyperlink of the Image. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_image.id.md) |  | `string` | Gets the ID of the Image object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`ocrData`](local.onenote_image.ocrdata.md) |  | `OneNote.ImageOcrData` | Gets the data obtained by OCR (Optical Character Recognition) of this Image, such as OCR text and language. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`pageContent`](local.onenote_image.pagecontent.md) |  | `OneNote.PageContent` | Gets the PageContent object that contains the Image. Throws if the Image is not a direct child of a PageContent. This object defines the position of the Image on the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraph`](local.onenote_image.paragraph.md) |  | `OneNote.Paragraph` | Gets the Paragraph object that contains the Image. Throws if the Image is not a direct child of a Paragraph. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`width`](local.onenote_image.width.md) |  | `number` | Gets or sets the width of the Image layout. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getBase64Image()`](local.onenote_image.getbase64image.md) |  | `OfficeExtension.ClientResult<string>` | Gets the base64-encoded binary representation of the Image. Example: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIA... <p/> \[Api set: OneNoteApi 1.1\] |
|  [`load(option)`](local.onenote_image.load.md) |  | `OneNote.Image` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

