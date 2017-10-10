[Home](./index) &gt; [local](local.md) &gt; [Office\_UI](local.office_ui.md) &gt; [closeContainer](local.office_ui.closecontainer.md)

# Office\_UI.closeContainer method

Closes the UI container where the JavaScript is executing. The behavior of this method is specified by the following table. When called from Behavior A UI-less command button No effect. Any dialogs opened by displayDialogAsync will remain open. A taskpane The taskpane will close. Any dialogs opened by displayDialogAsync will also close. If the taskpane supports pinning and was pinned by the user, it will be un-pinned. A module extension No effect.

**Signature:**
```javascript
closeContainer(): void;
```
**Returns:** `void`

