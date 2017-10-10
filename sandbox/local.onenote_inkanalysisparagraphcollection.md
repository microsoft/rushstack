[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisParagraphCollection](local.onenote_inkanalysisparagraphcollection.md)

# OneNote\_InkAnalysisParagraphCollection class

Represents a collection of InkAnalysisParagraph objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_inkanalysisparagraphcollection.count.md) |  | `number` | Returns the number of InkAnalysisParagraphs in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_inkanalysisparagraphcollection.items.md) |  | `Array<OneNote.InkAnalysisParagraph>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_inkanalysisparagraphcollection.getitem.md) |  | `OneNote.InkAnalysisParagraph` | Gets a InkAnalysisParagraph object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_inkanalysisparagraphcollection.getitemat.md) |  | `OneNote.InkAnalysisParagraph` | Gets a InkAnalysisParagraph on its position in the collection. |
|  [`load(option)`](local.onenote_inkanalysisparagraphcollection.load.md) |  | `OneNote.InkAnalysisParagraphCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

