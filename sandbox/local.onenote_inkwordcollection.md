[Home](./index) &gt; [local](local.md) &gt; [OneNote\_InkWordCollection](local.onenote_inkwordcollection.md)

# OneNote\_InkWordCollection class

Represents a collection of InkWord objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_inkwordcollection.count.md) |  | `number` | Returns the number of InkWords in the page. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_inkwordcollection.items.md) |  | `Array<OneNote.InkWord>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_inkwordcollection.getitem.md) |  | `OneNote.InkWord` | Gets a InkWord object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_inkwordcollection.getitemat.md) |  | `OneNote.InkWord` | Gets a InkWord on its position in the collection. |
|  [`load(option)`](local.onenote_inkwordcollection.load.md) |  | `OneNote.InkWordCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

