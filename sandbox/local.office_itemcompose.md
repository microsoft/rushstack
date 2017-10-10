[Home](./index) &gt; [local](local.md) &gt; [Office\_ItemCompose](local.office_itemcompose.md)

# Office\_ItemCompose interface

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`subject`](local.office_itemcompose.subject.md) | `Subject` |  |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`addFileAttachmentAsync(uri, attachmentName, options, callback)`](local.office_itemcompose.addfileattachmentasync.md) | `void` | Adds a file to a message as an attachment |
|  [`addItemAttachmentAsync(itemId, attachmentName, options, callback)`](local.office_itemcompose.additemattachmentasync.md) | `void` | Adds an Exchange item, such as a message, as an attachment to the message |
|  [`close()`](local.office_itemcompose.close.md) | `void` | Closes the current item that is being composed <p/> The behaviors of the close method depends on the current state of the item being composed. If the item has unsaved changes, the client prompts the user to save, discard, or close the action. <p/> In the Outlook desktop client, if the message is an inline reply, the close method has no effect. |
|  [`getSelectedDataAsync(coercionType, options, callback)`](local.office_itemcompose.getselecteddataasync.md) | `void` | Asynchronously returns selected data from the subject or body of a message. <p/> If there is no selection but the cursor is in the body or the subject, the method returns null for the selected data. If a field other than the body or subject is selected, the method returns the InvalidSelection error |
|  [`removeAttachmentAsync(attachmentIndex, options, callback)`](local.office_itemcompose.removeattachmentasync.md) | `void` | Removes an attachment from a message |
|  [`saveAsync(options, callback)`](local.office_itemcompose.saveasync.md) | `void` | Asynchronously saves an item. <p/> When invoked, this method saves the current message as a draft and returns the item id via the callback method. In Outlook Web App or Outlook in online mode, the item is saved to the server. In Outlook in cached mode, the item is saved to the local cache. |
|  [`setSelectedDataAsync(data, options, callback)`](local.office_itemcompose.setselecteddataasync.md) | `void` | Asynchronously inserts data into the body or subject of a message. |

