[Home](./index) &gt; [local](local.md) &gt; [OneNote\_NotebookCollection](local.onenote_notebookcollection.md)

# OneNote\_NotebookCollection class

Represents a collection of notebooks. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_notebookcollection.count.md) |  | `number` | Returns the number of notebooks in the collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_notebookcollection.items.md) |  | `Array<OneNote.Notebook>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getByName(name)`](local.onenote_notebookcollection.getbyname.md) |  | `OneNote.NotebookCollection` | Gets the collection of notebooks with the specified name that are open in the application instance. |
|  [`getItem(index)`](local.onenote_notebookcollection.getitem.md) |  | `OneNote.Notebook` | Gets a notebook by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_notebookcollection.getitemat.md) |  | `OneNote.Notebook` | Gets a notebook on its position in the collection. |
|  [`load(option)`](local.onenote_notebookcollection.load.md) |  | `OneNote.NotebookCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

