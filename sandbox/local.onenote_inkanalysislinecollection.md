[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkAnalysisLineCollection](local.onenote_inkanalysislinecollection.md)

# OneNote\_InkAnalysisLineCollection class

Represents a collection of InkAnalysisLine objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_inkanalysislinecollection.count.md) |  | `number` | Returns the number of InkAnalysisLines in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_inkanalysislinecollection.items.md) |  | `Array<OneNote.InkAnalysisLine>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_inkanalysislinecollection.getitem.md) |  | `OneNote.InkAnalysisLine` | Gets a InkAnalysisLine object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_inkanalysislinecollection.getitemat.md) |  | `OneNote.InkAnalysisLine` | Gets a InkAnalysisLine on its position in the collection. |
|  [`load(option)`](local.onenote_inkanalysislinecollection.load.md) |  | `OneNote.InkAnalysisLineCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

