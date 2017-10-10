[Home](./index) &gt; [local](local.md) &gt; [Office\_ItemRead](local.office_itemread.md)

# Office\_ItemRead interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`attachments`](local.office_itemread.attachments.md) | `Array<AttachmentDetails>` |  |
|  [`itemClass`](local.office_itemread.itemclass.md) | `string` |  |
|  [`itemId`](local.office_itemread.itemid.md) | `string` |  |
|  [`normalizedSubject`](local.office_itemread.normalizedsubject.md) | `string` |  |
|  [`subject`](local.office_itemread.subject.md) | `string` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`displayReplyAllForm(formData)`](local.office_itemread.displayreplyallform.md) | `void` | Displays a reply form that includes the sender and all the recipients of the selected message |
|  [`displayReplyForm(formData)`](local.office_itemread.displayreplyform.md) | `void` | Displays a reply form that includes only the sender of the selected message |
|  [`getEntities()`](local.office_itemread.getentities.md) | `Entities` | Gets the entities found in the selected item |
|  [`getEntitiesByType(entityType)`](local.office_itemread.getentitiesbytype.md) | `Array<(string | Contact | MeetingSuggestion | PhoneNumber | TaskSuggestion)>` | Gets an array of entities of the specified entity type found in an message |
|  [`getFilteredEntitiesByName(name)`](local.office_itemread.getfilteredentitiesbyname.md) | `Array<(string | Contact | MeetingSuggestion | PhoneNumber | TaskSuggestion)>` | Returns well-known entities that pass the named filter defined in the manifest XML file |
|  [`getRegExMatches()`](local.office_itemread.getregexmatches.md) | `any` | Returns string values in the currently selected message object that match the regular expressions defined in the manifest XML file |
|  [`getRegExMatchesByName(name)`](local.office_itemread.getregexmatchesbyname.md) | `Array<string>` | Returns string values that match the named regular expression defined in the manifest XML file |

