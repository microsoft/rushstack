[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalFormat](local.excel_conditionalformat.md) &gt; [priority](local.excel_conditionalformat.priority.md)

# Excel\_ConditionalFormat.priority property

The priority (or index) within the conditional format collection that this conditional format currently exists in. Changing this also changes other conditional formats' priorities, to allow for a contiguous priority order. Use a negative priority to begin from the back. Priorities greater than than bounds will get and set to the maximum (or minimum if negative) priority. Also note that if you change the priority, you have to re-fetch a new copy of the object at that new priority location if you want to make further changes to it. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

**Signature:**
```javascript
priority: number
```
