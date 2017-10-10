[Home](./index) &gt; [local](local.md) &gt; [Office\_UI](local.office_ui.md)

# Office\_UI interface

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`closeContainer()`](local.office_ui.closecontainer.md) | `void` | Closes the UI container where the JavaScript is executing. The behavior of this method is specified by the following table. When called from Behavior A UI-less command button No effect. Any dialogs opened by displayDialogAsync will remain open. A taskpane The taskpane will close. Any dialogs opened by displayDialogAsync will also close. If the taskpane supports pinning and was pinned by the user, it will be un-pinned. A module extension No effect. |
|  [`displayDialogAsync(startAddress, options, callback)`](local.office_ui.displaydialogasync.md) | `void` | Displays a dialog to show or collect information from the user or to facilitate Web navigation. |
|  [`messageParent(messageObject)`](local.office_ui.messageparent.md) | `void` | Synchronously delivers a message from the dialog to its parent add-in. |

