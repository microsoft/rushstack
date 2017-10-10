[Home](./index) &gt; [local](local.md) &gt; [OneNote\_SectionGroupCollection](local.onenote_sectiongroupcollection.md)

# OneNote\_SectionGroupCollection class

Represents a collection of section groups. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_sectiongroupcollection.count.md) |  | `number` | Returns the number of section groups in the collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_sectiongroupcollection.items.md) |  | `Array<OneNote.SectionGroup>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getByName(name)`](local.onenote_sectiongroupcollection.getbyname.md) |  | `OneNote.SectionGroupCollection` | Gets the collection of section groups with the specified name. |
|  [`getItem(index)`](local.onenote_sectiongroupcollection.getitem.md) |  | `OneNote.SectionGroup` | Gets a section group by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_sectiongroupcollection.getitemat.md) |  | `OneNote.SectionGroup` | Gets a section group on its position in the collection. |
|  [`load(option)`](local.onenote_sectiongroupcollection.load.md) |  | `OneNote.SectionGroupCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

