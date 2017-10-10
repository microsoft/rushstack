[Home](./index) &gt; [local](local.md) &gt; [Office\_ItemCompose](local.office_itemcompose.md) &gt; [close](local.office_itemcompose.close.md)

# Office\_ItemCompose.close method

Closes the current item that is being composed 

 The behaviors of the close method depends on the current state of the item being composed. If the item has unsaved changes, the client prompts the user to save, discard, or close the action. 

 In the Outlook desktop client, if the message is an inline reply, the close method has no effect.

**Signature:**
```javascript
close(): void;
```
**Returns:** `void`

