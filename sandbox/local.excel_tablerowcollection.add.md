[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableRowCollection](local.excel_tablerowcollection.md) &gt; [add](local.excel_tablerowcollection.add.md)

# Excel\_TableRowCollection.add method

Adds one or more rows to the table. The return object will be the top of the newly added row(s). 

 Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. 

 \[Api set: ExcelApi 1.1 for adding a single row; 1.4 allows adding of multiple rows.\]

**Signature:**
```javascript
add(index?: number, values?: Array<Array<boolean | string | number>> | boolean | string | number): Excel.TableRow;
```
**Returns:** `Excel.TableRow`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `index` | `number` |  |
|  `values` | `Array<Array<boolean | string | number>> | boolean | string | number` |  |

