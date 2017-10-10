[Home](./index) &gt; [local](local.md) &gt; [Word\_InlinePicture](local.word_inlinepicture.md) &gt; [untrack](local.word_inlinepicture.untrack.md)

# Word\_InlinePicture.untrack method

Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect.

**Signature:**
```javascript
untrack(): Word.InlinePicture;
```
**Returns:** `Word.InlinePicture`

