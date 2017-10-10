[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisWordCollection](local.onenote_inkanalysiswordcollection.md)

# OneNote\_InkAnalysisWordCollection class

Represents a collection of InkAnalysisWord objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_inkanalysiswordcollection.count.md) |  | `number` | Returns the number of InkAnalysisWords in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_inkanalysiswordcollection.items.md) |  | `Array<OneNote.InkAnalysisWord>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_inkanalysiswordcollection.getitem.md) |  | `OneNote.InkAnalysisWord` | Gets a InkAnalysisWord object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_inkanalysiswordcollection.getitemat.md) |  | `OneNote.InkAnalysisWord` | Gets a InkAnalysisWord on its position in the collection. |
|  [`load(option)`](local.onenote_inkanalysiswordcollection.load.md) |  | `OneNote.InkAnalysisWordCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

