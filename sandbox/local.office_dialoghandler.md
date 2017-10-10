[Home](./index) &gt; [local](local.md) &gt; [Office\_DialogHandler](local.office_dialoghandler.md)

# Office\_DialogHandler interface

Dialog object returned as part of the displayDialogAsync callback. The object exposes methods for registering event handlers and closing the dialog

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`addEventHandler(eventType, handler)`](local.office_dialoghandler.addeventhandler.md) | `void` | Adds an event handler for DialogMessageReceived or DialogEventReceived |
|  [`close()`](local.office_dialoghandler.close.md) | `void` | When called from an active add-in dialog, asynchronously closes the dialog. |

