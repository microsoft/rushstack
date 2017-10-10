[Home](./index) &gt; [local](local.md) &gt; [OneNote\_ParagraphCollection](local.onenote_paragraphcollection.md)

# OneNote\_ParagraphCollection class

Represents a collection of Paragraph objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_paragraphcollection.count.md) |  | `number` | Returns the number of paragraphs in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_paragraphcollection.items.md) |  | `Array<OneNote.Paragraph>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_paragraphcollection.getitem.md) |  | `OneNote.Paragraph` | Gets a Paragraph object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_paragraphcollection.getitemat.md) |  | `OneNote.Paragraph` | Gets a paragraph on its position in the collection. |
|  [`load(option)`](local.onenote_paragraphcollection.load.md) |  | `OneNote.ParagraphCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

