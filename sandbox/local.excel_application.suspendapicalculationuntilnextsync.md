[Home](./index) &gt; [local](local.md) &gt; [Excel\_Application](local.excel_application.md) &gt; [suspendApiCalculationUntilNextSync](local.excel_application.suspendapicalculationuntilnextsync.md)

# Excel\_Application.suspendApiCalculationUntilNextSync method

Suspends calculation until the next "context.sync()" is called. Once set, it is the developer's responsibility to re-calc the workbook, to ensure that any dependencies are propagated. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

**Signature:**
```javascript
suspendApiCalculationUntilNextSync(): void;
```
**Returns:** `void`

