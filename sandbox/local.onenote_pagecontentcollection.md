[Home](./index) &gt; [local](local.md) &gt; [OneNote\_PageContentCollection](local.onenote_pagecontentcollection.md)

# OneNote\_PageContentCollection class

Represents the contents of a page, as a collection of PageContent objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_pagecontentcollection.count.md) |  | `number` | Returns the number of page contents in the collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_pagecontentcollection.items.md) |  | `Array<OneNote.PageContent>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_pagecontentcollection.getitem.md) |  | `OneNote.PageContent` | Gets a PageContent object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_pagecontentcollection.getitemat.md) |  | `OneNote.PageContent` | Gets a page content on its position in the collection. |
|  [`load(option)`](local.onenote_pagecontentcollection.load.md) |  | `OneNote.PageContentCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

