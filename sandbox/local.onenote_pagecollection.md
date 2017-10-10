[Home](./index) &gt; [local](local.md) &gt; [OneNote\_PageCollection](local.onenote_pagecollection.md)

# OneNote\_PageCollection class

Represents a collection of pages. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_pagecollection.count.md) |  | `number` | Returns the number of pages in the collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_pagecollection.items.md) |  | `Array<OneNote.Page>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getByTitle(title)`](local.onenote_pagecollection.getbytitle.md) |  | `OneNote.PageCollection` | Gets the collection of pages with the specified title. |
|  [`getItem(index)`](local.onenote_pagecollection.getitem.md) |  | `OneNote.Page` | Gets a page by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_pagecollection.getitemat.md) |  | `OneNote.Page` | Gets a page on its position in the collection. |
|  [`load(option)`](local.onenote_pagecollection.load.md) |  | `OneNote.PageCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

