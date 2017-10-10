[Home](./index) &gt; [local](local.md) &gt; [OneNote\_SectionCollection](local.onenote_sectioncollection.md)

# OneNote\_SectionCollection class

Represents a collection of sections. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_sectioncollection.count.md) |  | `number` | Returns the number of sections in the collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_sectioncollection.items.md) |  | `Array<OneNote.Section>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getByName(name)`](local.onenote_sectioncollection.getbyname.md) |  | `OneNote.SectionCollection` | Gets the collection of sections with the specified name. |
|  [`getItem(index)`](local.onenote_sectioncollection.getitem.md) |  | `OneNote.Section` | Gets a section by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_sectioncollection.getitemat.md) |  | `OneNote.Section` | Gets a section on its position in the collection. |
|  [`load(option)`](local.onenote_sectioncollection.load.md) |  | `OneNote.SectionCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

