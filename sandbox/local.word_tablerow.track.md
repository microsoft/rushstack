[Home](./index) &gt; [local](local.md) &gt; [Word\_TableRow](local.word_tablerow.md) &gt; [track](local.word_tablerow.track.md)

# Word\_TableRow.track method

Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created.

**Signature:**
```javascript
track(): Word.TableRow;
```
**Returns:** `Word.TableRow`

