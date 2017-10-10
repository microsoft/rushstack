[Home](./index) &gt; [local](local.md) &gt; [OneNote\_SectionGroup](local.onenote_sectiongroup.md)

# OneNote\_SectionGroup class

Represents a OneNote section group. Section groups can contain sections and other section groups. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`clientUrl`](local.onenote_sectiongroup.clienturl.md) |  | `string` | The client url of the section group. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_sectiongroup.id.md) |  | `string` | Gets the ID of the section group. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`name`](local.onenote_sectiongroup.name.md) |  | `string` | Gets the name of the section group. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`notebook`](local.onenote_sectiongroup.notebook.md) |  | `OneNote.Notebook` | Gets the notebook that contains the section group. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentSectionGroup`](local.onenote_sectiongroup.parentsectiongroup.md) |  | `OneNote.SectionGroup` | Gets the section group that contains the section group. Throws ItemNotFound if the section group is a direct child of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentSectionGroupOrNull`](local.onenote_sectiongroup.parentsectiongroupornull.md) |  | `OneNote.SectionGroup` | Gets the section group that contains the section group. Returns null if the section group is a direct child of the notebook. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`sectionGroups`](local.onenote_sectiongroup.sectiongroups.md) |  | `OneNote.SectionGroupCollection` | The collection of section groups in the section group. Read only <p/> \[Api set: OneNoteApi 1.1\] |
|  [`sections`](local.onenote_sectiongroup.sections.md) |  | `OneNote.SectionCollection` | The collection of sections in the section group. Read only <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addSection(title)`](local.onenote_sectiongroup.addsection.md) |  | `OneNote.Section` | Adds a new section to the end of the section group. |
|  [`addSectionGroup(name)`](local.onenote_sectiongroup.addsectiongroup.md) |  | `OneNote.SectionGroup` | Adds a new section group to the end of this sectionGroup. |
|  [`load(option)`](local.onenote_sectiongroup.load.md) |  | `OneNote.SectionGroup` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

