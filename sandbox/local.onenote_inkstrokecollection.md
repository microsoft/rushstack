[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkStrokeCollection](local.onenote_inkstrokecollection.md)

# OneNote\_InkStrokeCollection class

Represents a collection of InkStroke objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_inkstrokecollection.count.md) |  | `number` | Returns the number of InkStrokes in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_inkstrokecollection.items.md) |  | `Array<OneNote.InkStroke>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_inkstrokecollection.getitem.md) |  | `OneNote.InkStroke` | Gets a InkStroke object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_inkstrokecollection.getitemat.md) |  | `OneNote.InkStroke` | Gets a InkStroke on its position in the collection. |
|  [`load(option)`](local.onenote_inkstrokecollection.load.md) |  | `OneNote.InkStrokeCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

