[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableRowCollection](local.excel_tablerowcollection.md) &gt; [getItemAt](local.excel_tablerowcollection.getitemat.md)

# Excel\_TableRowCollection.getItemAt method

Gets a row based on its position in the collection. 

 Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. 

 \[Api set: ExcelApi 1.1\]

**Signature:**
```javascript
getItemAt(index: number): Excel.TableRow;
```
**Returns:** `Excel.TableRow`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `index` | `number` |  |

