[Home](./index) &gt; [local](local.md) &gt; [OneNote\_RichText](local.onenote_richtext.md)

# OneNote\_RichText class

Represents a RichText object in a Paragraph. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.onenote_richtext.id.md) |  | `string` | Gets the ID of the RichText object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraph`](local.onenote_richtext.paragraph.md) |  | `OneNote.Paragraph` | Gets the Paragraph object that contains the RichText object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`text`](local.onenote_richtext.text.md) |  | `string` | Gets the text content of the RichText object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.onenote_richtext.load.md) |  | `OneNote.RichText` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

