[Home](./index) &gt; [local](local.md) &gt; [Office\_Item](local.office_item.md)

# Office\_Item interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`___BeSureToCastThisObject__`](local.office_item.___besuretocastthisobject__.md) | `void` | You can cast item with `(Item as Office.\[CAST\_TYPE\])` where CAST\_TYPE is one of the following: ItemRead, ItemCompose, Message, MessageRead, MessageCompose, Appointment, AppointmentRead, AppointmentCompose |
|  [`body`](local.office_item.body.md) | `Body` |  |
|  [`dateTimeCreated`](local.office_item.datetimecreated.md) | `Date` |  |
|  [`itemType`](local.office_item.itemtype.md) | `Office.MailboxEnums.ItemType` |  |
|  [`notificationMessages`](local.office_item.notificationmessages.md) | `NotificationMessages` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`loadCustomPropertiesAsync(callback, userContext)`](local.office_item.loadcustompropertiesasync.md) | `void` | Asynchronously loads custom properties that are specific to the item and a app for Office |

