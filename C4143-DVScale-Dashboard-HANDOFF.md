# C4143 DV-Scale Rack Test Status Dashboard — 開發紀錄與交接文件

| 項目 | 內容 |
| --- | --- |
| 文件版本 | 2.0 |
| 初版日期 | 2026-07-28 |
| 最後更新 | 2026-08-14 |
| 最新腳本 | `C4143-DVScale-Dashboard.user.js`（v1.8.2） |
| 最新腳本大小 | 95281 bytes（約 93.0 KB） |
| 執行環境 | Chrome + Tampermonkey，需已登入 Azure DevOps（azurecsi） |

> 第 1～12 節保留 v1.2 建置時的原始設計與調查紀錄；第 13 節為 v1.3～v1.6.2 的後續開發補充，第 14 節為 Test Suites 分頁，第 15 節為 v1.7.1 自動更新入口，第 16 節為 v1.7.2 左側直式分頁，第 17 節為 v1.7.3 提示淡出修正，第 18 節為 v1.8.0 sticky 與 Excel 匯出，第 19 節為 v1.8.1 固定範圍與 Rack 1 Test Features 平鋪頁，第 20 節為 v1.8.2 Test Features 列表復原與數量同步。

---

## 1. 需求原文（請勿改寫，交接時以此為準）

初始需求：

> 把這頁面中的 query 依照 5 台 Rack 在狀態列上的訊息用一個 html dashboard，類似於 powerBI 與這網站上的狀態連結，可以有近 1 天 3 天、1 週、1 個月、60 天的圓餅圖或長條圖，用一個下拉 menu 來選擇，每個台 rack 的 feature 下的 case 狀態都用一個分頁來呈現，每個 feature 下的 case 都用下拉式來展開，每個分頁也都有 state 的統計表

後續追加需求（依時間順序）：

1. 「我想要的是在這 html 中每次的重開或 refresh 頁面時可以跑一次 run query 再把結果呈現在 html 中」→ 不可以是靜態快照，每次開啟／F5 都要重跑 query。
2. 「預設先以目前的作法為主，但把這二個備案做進可選擇的下拉選單中切換」→ 預設 Live query，另外把「離線快照」與「本機代理」做成下拉可切換。
3. 「html 請都改為英文」→ 介面文字、訊息、檔頭註解全部英文化（v1.2 完成）。

需求對應實作檢核表：

| 需求 | 實作位置 | 狀態 |
| --- | --- | --- |
| 單一 HTML dashboard、PowerBI 風格 | `D.CSS` + `D.buildShell()` | 完成 |
| 依 5 台 Rack 的 State | `D.collect()` 依 tag Rack01~Rack05 分組 | 完成 |
| 與網站狀態連結 | `D.wiUrl()` → `/Dev/_workitems/edit/{id}` | 完成 |
| 1/3/7/30/60 天 + 全部，圓餅或長條 | `D.RANGES`、`D.pie()`、`D.bar()`、下拉選單 | 完成 |
| 每台 Rack 一個分頁 | `D.buildPanels()` / `D.showTab()` | 完成 |
| Feature 下 case 可展開 | `D.tree()` 巢狀 accordion | 完成 |
| 每分頁 state 統計表 | `D.statsTable()`、`D.rackTable()` | 完成 |
| 每次開啟／refresh 重跑 query | `D.boot()` → `D.load()` → `D.runQuery()` | 完成 |
| 三種資料來源下拉切換 | `D.MODES`、`D.baseFor()`、`D.apiFetch()` | 完成 |
| 全英文介面 | 全檔字串 | 完成 |

---

## 2. 交付物與儲存位置

| 檔案 / Key | 說明 |
| --- | --- |
| `C4143-DVScale-Dashboard.user.js` | 最新主交付物與固定安裝入口，Tampermonkey userscript v1.8.2 |
| `C4143-DVScale-Dashboard.user_v1.6.1-bug-priority-severity.js` | 上一個穩定版本，保留供回退與比對 |
| `C4143-DVScale-Dashboard-snapshot.html` | 由頁面上 **Export offline snapshot .html** 按鈕產生的離線單檔（含資料 + 程式碼） |
| `HANDOFF.md` | 本文件 |

localStorage（origin `https://azurecsi.visualstudio.com`）使用到的 key：

| Key | 用途 |
| --- | --- |
| `dvdashMode` | 目前資料來源模式（`live` / `snapshot` / `proxy`），預設 `live` |
| `dvdashRange` | 時間範圍選擇（`all` / `1` / `3` / `7` / `30` / `60`） |
| `dvdashType` | 圖表類型（`pie` / `bar`） |
| `dvdashProxy` | 代理網址，預設 `http://localhost:8080` |
| `dvdashSnapshot` | 上次成功載入的資料快照 JSON（目前約 107 KB） |
| `dvdashUserscript` / `dvdashUserscript2` / `dvdashUserscript3` | 開發期間存放 v1.0 / v1.1 / v1.2 腳本原始碼，正式交接後可刪除 |
| `adoDashPat` | 代理模式選用的 PAT（**建議留空，由 proxy 端自己帶**） |

---

## 3. 資料來源

| 項目 | 值 |
| --- | --- |
| Organization | `azurecsi`（`https://azurecsi.visualstudio.com`） |
| Project | `Dev` |
| Query 名稱 | `C4143_DV-Scale` |
| Query ID | `9254024e-6a97-44ed-953b-1aa07d38fb48` |
| Query 頁面 | `https://azurecsi.visualstudio.com/Dev/_queries/query/9254024e-6a97-44ed-953b-1aa07d38fb48/` |

API 呼叫（皆為讀取）：

```
GET  /Dev/_apis/wit/wiql/9254024e-6a97-44ed-953b-1aa07d38fb48?api-version=6.0&$top=5000
     → 回傳 workItemRelations（tree query），共 467 筆關聯
POST /Dev/_apis/wit/workitemsbatch?api-version=6.0
     → body: { ids: [...最多200筆...], fields: [...] }
```

抓取欄位：`System.Id`、`System.WorkItemType`、`System.Title`、`System.State`、`System.Tags`、`System.ChangedDate`、`System.CreatedDate`、`System.AssignedTo`。

> 注意：`workitemsbatch` 單次上限 200 筆，程式會自動分批（目前 467 筆 → 3 批）。

---

## 4. 實際資料結構（2026-07-28 觀察值）

總計 467 個 work item：

| 型別 | 數量 |
| --- | --- |
| Epic | 2 |
| Feature | 80 |
| System Requirement | 115 |
| Test Case | 270 |

層級（5 層）：

```
Epic 3682950
 └─ Epic 3682952
     └─ Rack Feature x5   [C4143][DV][Scale] Rack #N - 11.X HH Config
         ids: 3682954 / 3687982 / 3688012 / 3688022 / 3688031
         └─ Category Feature x8  Firmware Update / Enumeration / Cycles /
                                 System Stress / Cycle+Stress / Virtualization /
                                 MPF / Performance
             └─ Item Feature      IFWI / BMC + TiP / Service Configs / Manticore /
                                  OVL2 Subsystem / E1.S / M.2 ...
                 └─ System Requirement
                     └─ Test Case
```

每台 Rack：16 Feature、23 System Requirement、54 Test Case（5 x 54 = 270）。

Tag 只有這幾種：`C4143_DVT`、`EF_DV_Scale`、`EF_Master_Candidate`、`Rack01`~`Rack05`。**Rack 分組完全依賴 `Rack01`~`Rack05` 這個 tag**，若未來新增 Rack 必須沿用同樣命名，否則不會出現在分頁裡。

狀態現況：Test Case 幾乎全為 `Not Started`（2026-07-28 18:47 出現第 1 筆變動），Feature 為 `New`，System Requirement 為 `Proposed`。ChangedDate 集中在 2026-06-02 / 06-03。

> 因此 Last 1 day / 3 days / 7 days / 30 days 幾乎為空，Last 60 days 與 All time 才會有全部 270 筆。**這是真實資料狀況，程式選擇誠實顯示黃色警告並標出最後更新時間，不要為了畫面好看而造假或改成隨機資料。**

---

## 5. 系統架構

### 5.1 為什麼是 Tampermonkey userscript

Azure DevOps REST API **不開放 CORS**。任何非 `azurecsi.visualstudio.com` 來源的文件（含本機 `file://` 的 .html）都無法呼叫，即使帶 PAT 也會直接 `Failed to fetch`。要達成「每次開啟就即時重跑 query」，dashboard 本身必須跑在 azurecsi 這個 origin 上 → 所以用 userscript 注入到一個輕量同源頁面。

載體頁面選用：`https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash`（回傳很小的 JSON，載入快、沒有 ADO SPA 的干擾）。腳本只在 `location.hash` 含 `dvdash` 時啟動，因此不會影響正常瀏覽 ADO。

### 5.2 執行流程

```
document-idle → hash 含 dvdash？ → D.boot()
  ├─ 讀 localStorage 偏好（mode / range / chartType / proxy）
  ├─ D.buildShell()   建立 header、控制列、banner、tab bar、容器
  ├─ D.persistWire()  綁定控制項並持久化選擇
  └─ D.load()
       ├─ mode=live/proxy → D.runQuery()（wiql + workitemsbatch 分批）
       ├─ mode=snapshot   → D.readSnapshot()
       ├─ D.collect()     建樹、依 Rack tag 分組、統計
       ├─ D.saveSnapshot()（成功時自動存快照）
       ├─ D.buildPanels() 建 Overview + Rack 1~5 分頁
       └─ D.refresh()     套用時間範圍、重畫圖表與表格、更新 banner
```

### 5.3 `window.D` 命名空間（共 49 個成員）

| 分區 | 成員 |
| --- | --- |
| 設定/常數 | `CFG`、`STATE_COLORS`、`STATE_ORDER`(17)、`RANGES`(6)、`MODES`(3)、`CSS`、`S`(執行期狀態) |
| 工具 | `el`、`svg`、`colorFor`、`orderStates`、`chip`、`wiUrl`、`fmt`、`setStatus`、`sum`、`latest` |
| 資料 | `apiFetch`、`runQuery`、`collect`、`inRange`、`countStates`、`baseFor`、`getProxy` |
| 圖表（純 SVG） | `arcPath`、`pie`、`bar`、`stacked`、`legend` |
| UI | `card`、`box`、`statsTable`、`caseRow`、`tree`、`applyFilter`、`rackTable`、`buildShell`、`buildPanels`、`showTab`、`drawInto` |
| 流程 | `refresh`、`load`、`boot`、`persistWire`、`_timer`(自動更新計時器) |
| 快照/匯出 | `saveSnapshot`、`readSnapshot`、`serialize`、`exportHtml` |

### 5.4 三種資料來源模式

| 模式 | 值 | 行為 |
| --- | --- | --- |
| Live query (same-origin REST API) | `live` | 預設。`fetch` 同源 API，`credentials: include`，用瀏覽器登入身分。 |
| Offline snapshot (no network) | `snapshot` | 不連網，讀 `dvdashSnapshot` 或匯出 HTML 內嵌的 `D.EMBEDDED`。 |
| Local proxy (custom URL) | `proxy` | 把路徑改送到自訂 base URL，`credentials: omit`，可選擇性帶 Basic auth（PAT）。 |

### 5.5 圖表

**完全沒有外部 library**（Chart.js 等會被 CSP 擋掉）。所有圖表以手寫 SVG 產生：`arcPath()` 算圓弧路徑做 donut，`bar()` 畫垂直長條（含格線與數值標籤），`stacked()` 畫各 Rack 堆疊比較，tooltip 用原生 `<title>`。想換圖表樣式只要改這幾個函式。

---

## 6. 使用方式

1. Chrome 安裝 Tampermonkey。
2. 把 `C4143-DVScale-Dashboard.user.js` 拖進 Chrome 視窗（或 Tampermonkey → Utilities → Import from file），按 Install。
3. 加入書籤：`https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash`
4. 確認同一個瀏覽器已登入 Azure DevOps，點書籤即可。每次開啟或 F5 都會重跑 query。

介面控制項：Data source（三模式）、Time range (by Changed Date)、Chart type（Pie / Bar）、Auto refresh every 5 min、Re-run query、Export offline snapshot .html、Expand all / Collapse all、搜尋框（比對 case 標題 / ID / state）。

本機代理範例（Node.js 18+，存成 proxy.js，設好 `ADO_PAT` 後 `node proxy.js`）已寫在 userscript 檔頭註解裡，PAT 以環境變數提供，**不要寫進檔案**。PAT scope 只需 `Work Items → Read`。

---

## 7. 遇過的坑（最重要的一節，請務必先讀）

1. **ADO REST API 沒有 CORS。** 本機 .html 或任何其他 origin 一律 `Failed to fetch`，帶 PAT 也一樣。→ 只能讓頁面本身位於 azurecsi origin（userscript），或自建代理。
2. **ADO 頁面 CSP 沒有 `unsafe-eval`。** 在頁面 context 用 `eval` / `new Function` 會被擋。開發期間用 DevTools/CDP 執行可以繞過 CSP，但**註冊給頁面稍後執行的程式碼（event handler 內的 eval）不行**，不要被這點誤導。
3. **`window.open` + `document.write` 寫出來的頁面，script 不會執行**（parser-inserted script 與 CDN script 都被擋）。→ 放棄 document.write，改用程式化建立 DOM。
4. **Chart.js（CDN）載不進來** → 全部圖表改為手寫 SVG。這反而讓成品變成零依賴、可離線。
5. **自動化工具的輸出約 2000 字元就截斷**，大型 JSON / 程式碼無法搬進對話。→ 程式碼在瀏覽器內用 `function.toString()` 組裝、透過 `BroadcastChannel` 在同源分頁間傳遞、存進 `localStorage`。
6. **頁面 reload 後 `window.D` 會消失。** 原本 IIFE 內是 `var D = {}`，外部無法再取用。→ 改成 `window.D = window.D || {}; var D = window.D;` 才能在 console 裡繼續 patch。
7. **短時間範圍圖表為空**：不是 bug，是資料真的沒更新。已用黃色 banner + 「No data in range」明確說明並顯示最後更新時間。切勿改成假資料。
8. **時間範圍語意**：目前是用 `System.ChangedDate` 過濾「這段期間內被更新的項目」，**不是**每日狀態歷史。要真正的趨勢線必須改用 Analytics / OData（見第 10 節）。
9. **英文化時別忘了全形標點**：翻譯字串時 `：（）「」、。，；　※` 這些字元散落在訊息串接處，只翻中文字會留下半殘的標點。v1.2 已一併轉成 ASCII。
10. **讀取程式碼片段時，自動化工具可能因為內容看起來像 cookie/query string 而擋住輸出**。改成只抓字串 literal 或只回傳長度/布林值即可繞開。
11. **`workitemsbatch` 上限 200 筆**，超過會直接失敗，必須分批。

---

## 8. 開發 / 修改工作流

**建議做法（最簡單）**：在 Tampermonkey 的編輯器直接改 `.user.js`，存檔後在 dashboard 頁面按 F5 即可看到結果。

除錯技巧：

- 頁面上所有東西都掛在 `window.D`，可在 DevTools console 直接呼叫，例如 `D.refresh()`、`D.load()`、`D.S`（看目前資料）、`D.RANGES`。
- 想快速測空資料情境：把 Time range 選 Last 1 day。
- 想測錯誤處理：把 Data source 切到 Local proxy 且不啟動 proxy。
- 想離線 demo：先用 Live 成功載入一次（會自動存快照），再切 Offline snapshot；或按 Export offline snapshot .html 拿單檔。

---

## 9. 修改指引（要改什麼 → 動哪裡）

| 想做的事 | 修改位置 |
| --- | --- |
| 換另一個 query / 專案 | `D.CFG`（org / project / queryId） |
| 增減時間範圍選項 | `D.RANGES` |
| 調整狀態顏色或排序 | `D.STATE_COLORS`、`D.STATE_ORDER` |
| 多抓一個欄位 | `D.runQuery()` 的 fields 陣列 + `D.caseRow()` 顯示 |
| 改圖表外觀 | `D.pie()` / `D.bar()` / `D.stacked()` / `D.arcPath()` / `D.legend()` |
| 改分頁結構 | `D.buildPanels()` / `D.showTab()` |
| 改樹狀展開層級 | `D.tree()` |
| 改統計表欄位 | `D.statsTable()` / `D.rackTable()` |
| 改版面 / 配色 | `D.CSS` |
| 改 banner 訊息 | `D.refresh()` / `D.setStatus()` |
| 改匯出格式 | `D.serialize()` / `D.exportHtml()` |
| 改自動更新間隔 | `D.persistWire()` 中的 `D._timer` 設定（目前 5 分鐘） |

---

## 10. 交接狀態

### 已完成並實測通過

- [x] 資料抽取與層級分析（467 筆，5 層）
- [x] Overview + Rack 1~5 共 6 個分頁
- [x] Donut / Bar / Stacked bar（純 SVG）
- [x] 每個分頁的 State 統計表（含 Count / Share / 條狀比例）
- [x] Feature → System Requirement → Test Case 巢狀展開、狀態 chip、case 數
- [x] 每個節點與 case 都可點回 ADO work item
- [x] Expand all / Collapse all / 搜尋
- [x] 時間範圍下拉（All time / 1 / 3 / 7 / 30 / 60 天）+ 空資料警告
- [x] 每次開啟或 F5 自動重跑 query（Live 為預設）
- [x] 三種資料來源模式下拉切換，選擇持久化，錯誤訊息依模式給不同建議
- [x] 自動存快照 + 匯出離線單檔 HTML
- [x] 全英文介面（v1.2）
- [x] userscript 檔頭含使用說明、書籤網址、三模式說明、Node 代理範例

### 未完成 / 已知限制

- 時間範圍是「期間內被更新的項目」，**沒有真正的每日狀態歷史**（需 Analytics / OData `WorkItemSnapshot`）。
- 只讀 work item 的 State，**沒有** Test Run / Test Result 的 outcome（Passed / Failed 實際執行結果）。狀態色已預留 Passed / Failed / Blocked。
- 快照存在 localStorage（目前約 107 KB），localStorage 上限約 5 MB，資料量若成長數十倍需改 IndexedDB。
- Rack 分組硬性依賴 `Rack01`~`Rack05` tag，新增 Rack 需確認命名或改 `D.collect()`。
- 沒有自動化測試，全部靠人工目視驗證。
- 需要 Tampermonkey；若組織禁裝擴充功能，正解是改做成 Azure DevOps Extension / Dashboard Widget（見下）。
- 代理模式需使用者自行啟動 proxy 並自備 PAT。

### 建議下一步（依優先序）

1. **真實趨勢線**：接 Analytics OData（`https://analytics.dev.azure.com/azurecsi/Dev/_odata/v3.0-preview/WorkItemSnapshot`），做「每日各 state 數量」折線圖，這是目前最大的功能缺口。
2. **納入 Test Run / Result**：`_apis/test/runs`、`_apis/testplan`，才能顯示真正的 Pass/Fail 率。
3. **匯出 CSV / Excel**，方便做週報。
4. **改做 ADO Extension 或 Dashboard Widget**：可免 Tampermonkey、可分享給團隊、天然同源。
5. 加上「與上次快照的差異」檢視（哪些 case 這週變了）。

---

## 11. 版本歷史

| 版本 | 內容 |
| --- | --- |
| v1.0 | 中文介面，Live 模式，完成所有原始需求 |
| v1.1 | 加入三種資料來源下拉、匯出離線快照、偏好持久化、依模式的錯誤提示 |
| v1.2 | 介面與註解全面英文化，版本號與檔頭同步更新 |
| v1.3 | Work Item 與 State 採不同顏色；卡片在可用空間內平均延展且不超出邊界 |
| v1.4 | Test Case Links 自動辨識連結的 Bug，於 Case 列顯示 Bug ID 與可點擊連結；Overview 加入 Bug 保留區 |
| v1.4.1 | 修正不帶 `#dvdash` 時誤停在 Azure DevOps Projects JSON 的啟動問題；`/_apis/projects` 路徑可直接啟動 |
| v1.4.2 | Live query／載入狀態訊息改為右下角暫時提示並自動淡出；重新調整分頁尺寸 |
| v1.4.3 | 定義 Closed = Pass、Blocked = Fail、In Progress = 進行中；Overview 新增 Pass／Fail 數量與比例 |
| v1.6.1 | 加入 Case Priority、Sample Size、Test Duration、Bug Priority／Severity 橫向長條統計與可展開 ID；移除 Test Cycle 卡片；Bug 改以 Priority 為主、Severity 為次 |
| v1.6.2 | 在 Sample Size 下新增 `Number_of_cycles` 統計卡，顯示已填／空白／總數、數值分布及 Case ID 下拉連結 |
| v1.7.0 | 新增 `Test Suites` 分頁，以 Suite → Rack → Case table 顯示 54 個基準測項與 8 個欄位 |
| v1.7.1 | userscript 改用固定檔名，加入 GitHub `@updateURL`／`@downloadURL`，支援 Tampermonkey 定時自動更新 |
| v1.7.2 | Overview、Rack 1～5、Test Suites 改為左側直式分頁；縮小導覽寬度與字體並加入窄螢幕調整 |
| v1.7.3 | re-query 的資訊與黃色警告提示改為 4.5 秒後淡出、5.2 秒後隱藏；紅色載入錯誤維持顯示 |
| v1.8.0 | 左側分頁與摘要／圖表區支援 sticky；Test Suites 同步 Case 欄位並新增 Excel `.xls` 匯出 |
| v1.8.1 | Sticky 僅保留摘要卡以上，圖表開始正常捲動；卡片維持單列；最後一頁依 Rack 1 即時 Feature 階層平鋪全部 Case |
| v1.8.2 | Test Features 恢復 Feature 下拉與 Case 表格列表；資料仍由 Rack 1 階層動態產生，並顯示列表數／Rack 1 Case 數同步檢查 |

---

## 12. 安全與注意事項

- 腳本**只做讀取**（wiql GET、workitemsbatch POST 查詢），不會修改任何 work item。
- PAT 絕不寫入腳本或匯出檔；代理模式請由 proxy 端以環境變數持有。
- 匯出的 snapshot HTML **內含實際 work item 資料**（標題、負責人），外流前請確認可分享。
- 書籤網址帶 `#dvdash`，hash 不會送到伺服器，安全。

---

## 13. 2026-07-28～2026-07-29 後續開發補充（v1.3～v1.6.2）

### 13.1 最新交付物

| 項目 | 目前狀態 |
| --- | --- |
| 最新版本 | v1.6.2 |
| 最新檔名 | `C4143-DVScale-Dashboard.user_v1.6.2-number-of-cycles.js` |
| 上一個穩定版 | `C4143-DVScale-Dashboard.user_v1.6.1-bug-priority-severity.js` |
| Azure DevOps Query | `C4143_DV-Scale` / `9254024e-6a97-44ed-953b-1aa07d38fb48` |
| 啟動網址 | `https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash` |
| 目前資料量 | 5 Racks / 270 Test Cases |

最新版與歷史版本目前存放於：

`C:\Users\dicky\Documents\Codex\2026-07-28\uba\outputs\`

安裝新版時，應把 v1.6.2 匯入 Tampermonkey 並停用或取代舊版，以免兩個版本同時在相同網址執行。

### 13.2 後續需求與實作過程

| 順序 | 需求／問題 | 實作結果 |
| --- | --- | --- |
| 1 | 不同 Work Item 與 State 需要不同顏色 | 建立 `D.TYPE_COLORS` 與擴充 `D.STATE_COLORS`；Feature、System Requirement、Test Case、Bug 與各 State 都有獨立視覺標示 |
| 2 | Dashboard 卡片應在有空間時平均擴展，但不可超出邊界 | Cards 改用 responsive grid 與 `auto-fit/minmax`；窄螢幕自動換列 |
| 3 | 放大 Overview／Rack 分頁，縮小 Expand／Collapse 並將 Search 向前移 | 調整分頁字體與 padding；Rack 工具列改為受控 grid，按鈕與搜尋框依可用寬度排列 |
| 4 | Overview 卡片需要不同顏色，並保留 Bug 追蹤區 | 每張 KPI 卡片加入對應色調；建立 Linked Bug tracking 區塊 |
| 5 | Test Case Links 中加入的 Bug 要自動帶到各 Rack Case | 追加 Test Case relation 查詢，辨識 Bug Work Item，Case 列顯示 `BUG #ID` 與 Azure DevOps hyperlink |
| 6 | Dashboard 無法正常開啟，只顯示 Projects API JSON | 修正啟動條件：除了 hash 含 `dvdash`，`/_apis/projects` 路徑也會直接啟動 Dashboard |
| 7 | Live query 訊息不應占據版面 | Banner 改成右下角 toast，數秒後淡出；錯誤訊息仍可停留供判讀 |
| 8 | 分頁太大 | 重新縮小分頁 padding 與字體，維持比 Work Item badge 稍大的視覺層級 |
| 9 | Closed 應算 Pass；Blocked 應算 Fail；In Progress 為進行中 | `Closed = Pass`、`Blocked = Fail`、`In Progress = In Progress`；Pass/Fail rate 的分母為目前時間範圍內的 Test Cases |
| 10 | Overview 需同時顯示 Pass Cases／Rate、Fail Cases (Blocked)／Rate，兩張 Bug 卡整合 | Overview KPI 卡重整完成 |
| 11 | 加入 Bug Severity／Priority、Case Priority、Sample Size、Test Duration | 欄位探索與 fallback 機制加入；各統計以橫向長條呈現 |
| 12 | 不要 Test Cycle 卡；每個統計項目需能展開 Case／Bug ID | 移除所有 Test Cycle 卡片與單筆 Cycle badge；長條列加入 `<details>` 下拉 ID 清單 |
| 13 | Bug Overview 應以 Priority 為主，每個 Priority 下再分 Severity 1～4 | P1～P4 各有一組 Severity 1～4 橫向長條與 Bug ID 下拉 |
| 14 | 統計 270 個 Case 中 `Number_of_cycles` 非空白數量 | Live REST 驗證為 55 筆有值、215 筆空白 |
| 15 | 將上述結果放在 Sample Size 下方 | v1.6.2 新增 `Number_of_cycles` 卡片；Overview 與所有 Rack 分頁都會動態重算 |

### 13.3 目前的 State 與 Rate 定義

| Dashboard 指標 | Azure DevOps Test Case State | 計算方式 |
| --- | --- | --- |
| Pass Cases / Rate | `Closed` | `Closed 數量 / 所選時間範圍內 Test Case 總數` |
| Fail Cases (Blocked) / Rate | `Blocked` | `Blocked 數量 / 所選時間範圍內 Test Case 總數` |
| In Progress Cases | `In Progress` | 顯示目前進行中的 Case 數量，不另計 rate |

這些是本 Dashboard 的專案定義，不是 Azure Test Run 的原生 Outcome。若未來需要真正的 Passed／Failed 測試執行結果，仍須串接 Test Run／Test Result API。

### 13.4 目前讀取的額外欄位

`D.FIELD_SPECS` 會先從 Azure DevOps Fields API 尋找顯示名稱或 reference name；找到後才加入 `workitemsbatch` 欄位清單。

| 用途 | Reference name／探索方式 | 顯示位置 |
| --- | --- | --- |
| Case Priority / Bug Priority | fallback：`Microsoft.VSTS.Common.Priority` | Case badge、Priority completion、Bug Priority 分組 |
| Bug Severity | fallback：`Microsoft.VSTS.Common.Severity` | Bug 明細與每個 Priority 下的 Severity 統計 |
| Sample Size | aliases：`Sample Size`、`Test Sample Size`、`Sample Count`、`Samples` | Case badge與 Sample Size 統計卡 |
| Test Duration | aliases：`Test Duration`、`Estimated Test Duration`、`Duration`、`Test Time` | Case badge與 Test Duration 統計卡 |
| Number of cycles | fallback：`Custom.Number_of_cycles`；aliases：`Number_of_cycles`、`Number of cycles`、`Number of Cycles` | v1.6.2 `Number_of_cycles` 統計卡 |

`Number_of_cycles` 不再顯示為每個 Case 的 Cycle badge，只保留統計卡。原本的 Test Cycle 卡片也已移除。

### 13.5 Bug Links 自動帶入流程

1. WIQL tree query 取得原始 Feature／Requirement／Test Case 層級。
2. 找出全部 Test Case ID。
3. 以每批最多 200 筆呼叫 `workitemsbatch`，並使用 `"$expand": "relations"` 取得 Test Case Links。
4. 從 relation URL 解析被連結的 Work Item ID。
5. 再批次讀取連結 Work Item 欄位。
6. 只保留 `System.WorkItemType === "Bug"` 的項目並去除重複 ID。
7. 每個 Test Case 列顯示 `BUG #ID` hyperlink；Overview 的 Bug tracking 同時彙總：
   - Unique Bug count
   - Affected Test Case count
   - Bug title／state／priority／severity
   - 每個 Bug 連結到哪些 Test Cases
   - P1～P4 下的 Severity 1～4 數量與比例

Severity 顯示規則：

| Severity | 名稱 |
| --- | --- |
| 1 | Critical |
| 2 | High |
| 3 | Medium |
| 4 | Low |

目前查詢資料中尚未找到已連結的 Bug 時，Bug 區塊會顯示 0，但區塊與資料抓取流程已保留；開始驗證 Case 並在 Links 加入 Bug 後，重新執行 Live query 即會帶入。

### 13.6 Priority、Sample Size、Duration 與 Number_of_cycles 顯示方式

- Case Priority：P1～P4 各自顯示 `Closed / Total` 與完成率，另有 All priorities 總計。
- Sample Size：依數值由大到小顯示；比例分母為有填 Sample Size 的 Cases。
- Test Duration：先把 day／hour／minute／second 轉成可排序秒數，再由長到短顯示原始欄位文字。
- Number_of_cycles：依數字由大到小顯示；卡片標題同時呈現 `set / empty / total`。
- 每一個長條項目都有 Case IDs 或 Bug IDs 下拉，可展開後直接開啟 Azure DevOps Work Item。

目前 Live 資料（2026-07-29 驗證）：

| Number_of_cycles | Case 數 |
| ---: | ---: |
| 100 | 15 |
| 72 | 5 |
| 50 | 15 |
| 25 | 5 |
| 5 | 10 |
| 2 | 5 |
| **有值合計** | **55** |
| **空白** | **215** |
| **總 Test Cases** | **270** |

因此 All time 且資料未變動時，卡片標題應顯示：

`Number_of_cycles (55 set / 215 empty · 270 total)`

若切換 Changed Date 時間範圍，這三個數字會以範圍內的 Test Cases 重新計算。

### 13.7 目前 UI 版面規則

- Overview 與 Rack tabs 比 Work Item type badge 稍大，但不再使用最初要求的一倍放大尺寸。
- KPI cards 使用 responsive grid，在可用空間平均延展；每張卡有自己的色調。
- Work Item type 與 State 使用不同色系；Case 列也套用相同視覺邏輯。
- Live query／snapshot 成功訊息使用右下角 toast，數秒後淡出，不占用 Dashboard 版面。
- Rack 內的 Expand all、Collapse all、Search 共用工具列；窄螢幕時 Search 會自動換到下一列。
- 指標區桌面版為兩欄：
  - 左欄：Sample Size，上方；`Number_of_cycles`，固定在 Sample Size 下方。
  - 右欄：Test Duration。
- 小於 980 px 時改成單欄，順序為 Sample Size → Number_of_cycles → Test Duration。
- Bug detail table 可水平捲動，避免窄螢幕擠壓欄位。

### 13.8 v1.6.2 驗證紀錄

v1.6.2 完成後執行以下檢查：

- JavaScript 由 Node `vm.Script` 進行語法解析：通過。
- 以 270 筆 Test Case 測試資料實際渲染 Dashboard：通過。
- `Number_of_cycles` 標題驗證：`55 set / 215 empty · 270 total`。
- 數值排序驗證：`100 → 72 → 50 → 25 → 5 → 2`。
- 每個數值的 Case IDs 下拉數量及 Azure DevOps hyperlink：通過。
- Overview 與 Rack 分頁均能顯示相同統計：通過。
- 確認沒有重新加入每個 Case 的 Cycle badge：通過。
- 手機寬度測試：無水平 overflow，三張卡依正確順序排列。
- Export offline snapshot HTML：成功，匯出檔包含 270 Test Cases、`numberOfCycles` 資料與統計 renderer。
- 匯出 HTML 再次載入：統計卡正常，Console 無 JavaScript error。

測試所用的暫存 HTML、local test server 與測試匯出檔均已刪除；正式交付只保留 userscript。

### 13.9 目前限制與維護注意事項

1. 舊版本檔名必須最後一次手動改裝 `C4143-DVScale-Dashboard.user.js`；之後 Tampermonkey 可依 GitHub 固定網址與 `@version` 自動更新。
2. Live query 必須在 `https://azurecsi.visualstudio.com` 同源頁面執行；在本機直接開啟 `.html` 仍無法跨網域呼叫 Azure DevOps API。
3. 如果 Fields API 或自訂欄位權限失敗，Dashboard 會保留核心 State 資料，但自訂指標可能顯示空白並在 toast 提示。
4. Bug Links 只辨識實際連結到 Test Case relations 的 Work Item，且只保留型別為 Bug 的項目。
5. Changed Date 時間範圍是更新時間篩選，不是歷史快照趨勢。
6. Pass／Fail 是依目前 Case State 推導，並非 Test Run Outcome。
7. 目前測試是針對交付版本進行的驗證流程，尚未在專案中長期保留可重複執行的自動化測試套件。
8. 若 Azure DevOps 自訂欄位名稱或 reference name 改變，優先更新 `D.FIELD_SPECS`，不要只修改畫面文字。

---

## 14. 2026-08-04 Test Suites 分頁（v1.7.x）

### 14.1 交付檔案

- 最新 userscript：`C4143-DVScale-Dashboard.user.js`（目前 `@version` 1.8.2）
- 基準來源：v1.6.2，原有 Overview、Rack 1～5、Bug、Priority、Sample Size、Number_of_cycles 與 Test Duration 功能均保留。
- 新增第 7 個分頁：`Test Suites`。

### 14.2 Suite 階層與欄位

新分頁使用 `Suite → Rack → Case table` 兩層下拉結構。先依測試清單分為 12 個 Suites，再在每個 Suite 下面分 Rack 1～5，避免 5 櫃同名 Test Case 混在同一張表中。

每個 Case 顯示以下欄位：

| 欄位 | 來源／行為 |
| --- | --- |
| ID | Azure DevOps Work Item ID，可直接開啟 Case |
| Title | Test Case Title |
| Suite | 依提供的 54 個基準測項 Title 對應 |
| Priority | `Microsoft.VSTS.Common.Priority` 或欄位別名 |
| Script type | Fields API 動態尋找 `Script type`／`Script Type` |
| CRC SDK | Fields API 動態尋找 `CRC SDK`／`CRC SDK Version` |
| IGS Owner | Fields API 動態尋找 `IGS Owner`，Identity 類型顯示 display name |
| Comments | Fields API 動態尋找 `Comments`／`Comment` |

Suite 清單與每櫃基準測項數：Enumeration 26、IFWI 2、BMC 2、Manticore 1、GP 1、E.1s 1、M.2 1、Stability 9、Stress 2、Virtualization 3、MPF 4、Performance 2；合計 54 個唯一測項。5 櫃完整資料應顯示 270 個 Rack Cases。

未符合基準 Title 的 Case 不會消失，而會放入 `Unmapped`，並在上方 `UNMAPPED CASES` 卡片顯示數量，方便日後補 mapping。

### 14.3 操作與顯示規則

- `Expand all`／`Collapse all` 同時控制 Suite 與 Rack 兩層。
- Search 可搜尋 Suite、Rack、Case ID、Title、State、Priority、Script type、CRC SDK、IGS Owner 與 Comments。
- 搜尋時只保留符合的 Case row，並自動展開有結果的 Suite／Rack。
- Case ID 保留 Azure DevOps hyperlink。
- 案例列左側顏色依目前 Case State 顯示；滑鼠移到列上可看到 Rack 與 State。
- 表格在窄螢幕內部水平捲動，Dashboard 本身不產生整頁水平 overflow。
- 若從舊的 v1.6.2 Offline snapshot 開啟，Suite 仍可由 Title 分類，但新增的 Script type、CRC SDK、IGS Owner、Comments 會顯示 `-`；執行一次 Live query 後即會寫入新版 snapshot。

### 14.4 v1.7.0 驗證紀錄

- JavaScript 語法解析：通過。
- Suite 定義：12 個；基準 Title：54 個；正規化後重複：0。
- 5 櫃測試資料：270 Case rows；Unmapped：0。
- 分頁總數：7（Overview、Rack 1～5、Test Suites）。
- 欄位順序：ID、Title、Suite、Priority、Script type、CRC SDK、IGS Owner、Comments。
- Collapse all：開啟節點由 72 降為 0；Expand all：恢復 72。
- 搜尋 `MPF`：只保留 MPF Suite、5 個 Rack、20 個 Case rows。
- Desktop 1265 × 720：無整頁水平 overflow。
- Mobile 375 px：無整頁水平 overflow，Case table 可在區塊內水平捲動。
- Clean load：頁面非空白、無 framework overlay、Console 無 error／warning。

---

## 15. 2026-08-04 Tampermonkey 自動更新（v1.7.1）

### 15.1 固定安裝入口

正式安裝檔不再把版本號放在檔名中，固定使用：

`C4143-DVScale-Dashboard.user.js`

固定 Raw URL：

`https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js`

### 15.2 Userscript metadata

```text
@version      1.7.1
@updateURL    https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
@downloadURL  https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
```

Tampermonkey 會按設定的更新間隔讀取固定 URL，比較 `@version`，發現較新版本後下載並更新。更新完成後，下一次開啟或重新整理 Azure DevOps 即執行新版。

### 15.3 後續發布規則

1. 所有正式修改都直接更新固定檔名 `C4143-DVScale-Dashboard.user.js`。
2. 每次發布必須提高 `@version`，否則 Tampermonkey 不會判定為新版。
3. 更新 README 與本 HANDOFF 的目前版本及變更紀錄。
4. 合併到 `main` 後，確認 Raw URL 可讀到新版本 metadata。
5. 不要重新改成含版本號的正式安裝檔名；Git commit／tag 已可保留歷史版本。

### 15.4 使用限制

- 首次從舊版切換到固定入口仍需手動安裝一次。
- Tampermonkey 是依更新間隔檢查，不保證每次 `F5` 都立即連線 GitHub。
- 剛發布若要立即套用，可在 Tampermonkey 執行 **Check for userscript updates**，之後重新整理 Azure DevOps。
- PR 分支上的變更必須先合併進 `main`，固定 Raw URL 才會提供該版本。

---

## 16. 2026-08-04 左側直式分頁（v1.7.2）

### 16.1 版面結構

- Header 與控制列維持滿版寬度。
- 控制列下方改為兩欄：左側 `.tabs` 導覽，右側 `#panels` Dashboard 內容。
- Desktop：導覽欄 64px、按鈕 50px、字體 11px。
- 720px 以下：導覽欄 54px、按鈕 44px、字體 10px。
- 每個分頁文字使用 `writing-mode: vertical-rl`，維持完整字串的直向排列，不拆成逐字堆疊。
- Active 分頁以較亮背景、白色半粗體與左側青色線條顯示。

### 16.2 功能與相容性

- `D.buildShell()` 新增 `.dashboard-main` 容器，既有 Header、Controls、Toast 與資料載入流程不變。
- `D.buildPanels()` 與 `D.showTab()` 保留原有切頁邏輯，補上 `tablist`／`tab`／`tabpanel` 與 `aria-selected`。
- 桌面 1672×943 與窄螢幕 390×844 均確認 7 個分頁、單一 active panel、無整頁水平溢出。
- Rack 3 → Test Suites 互動切換已驗證；兩個頁面的工具列與內容皆正常顯示。

---

## 17. 2026-08-04 re-query 提示淡出修正（v1.7.3）

- 原因：`D.setStatus()` 只有在 `kind === 'info'` 時啟動淡出計時器；查詢成功但自訂欄位不完整時會使用 `warn`，因此黃色提示永久停留。
- 修正：除 `err` 外，`info` 與 `warn` 都在 4.5 秒加入 `fading`，並在 5.2 秒加入 `hide`。
- 保留：真正的載入或驗證錯誤仍使用 `err` 並持續顯示，避免重要錯誤在讀完前消失。

---

## 18. 2026-08-14 sticky 區域、Test Suites 同步與 Excel 匯出（v1.8.0）

### 18.1 捲動時固定區域

- `.controls` 保持頁面頂端；使用 `ResizeObserver` 動態計算控制列高度並寫入 `--dvdash-controls-height`。
- 左側 `.tabs` 依控制列高度 sticky，內容過高時可在分頁列內獨立捲動。
- Overview 與 Rack 分頁將摘要卡及 State distribution／比較圖包在 `.panel-sticky`；頁面下方表格、Priority、Sample／Cycles／Duration 與 Bug 區繼續正常捲動。
- Test Suites 將摘要卡、說明與工具列包在 `.suite-sticky`，瀏覽大量 Case 時仍可搜尋、展開／收合或下載 Excel。
- 980px 以下或高度 700px 以下停用大型內容 sticky，避免遮住窄螢幕；左側分頁仍保持 sticky。

### 18.2 Test Suites Case 同步

- 表格直接使用與 Rack 分頁相同的 `testCase` 物件，不建立第二份狀態資料。
- 顯示 Rack、ID、Title、Suite、State、Changed、Priority、Sample Size、Cycles、Duration、Script type、CRC SDK、IGS Owner、Linked Bugs、Comments。
- State 使用相同色票，Bug 使用相同 Azure DevOps hyperlink；Search 也涵蓋新同步欄位。

### 18.3 Excel 匯出

- **Download Excel (.xls)** 會輸出 Excel 2003 XML，不依賴外部 CDN 或第三方 runtime。
- 工作表共 16 欄：畫面同步欄位加上 Azure DevOps URL；Case ID 與 URL 都可直接開啟 Work Item。
- 標題列凍結並啟用 AutoFilter，純數字 Sample Size／Number of Cycles 以數值儲存，識別碼維持文字。
- 270 筆測試資料驗證輸出為 271 列（含 Header）、16 欄，XML 可解析，AutoFilter 範圍為 `R1C1:R271C16`。

---

## 19. 2026-08-14 卡片固定範圍與 Rack 1 Test Features 平鋪頁（v1.8.1）

### 19.1 捲動與卡片排列

- Overview 與 Rack 分頁的 `.panel-sticky` 現在只包含摘要卡；State 圓餅圖／長條圖、比較圖及以下區塊都會跟隨主頁面捲動。
- 左側直式 `.tabs` 與頂部 `.controls` 仍保持 sticky。
- `.cards` 改為不可換行的單列 Flex 版面；桌面空間足夠時卡片平均伸展，空間不足時只在卡片列內水平捲動。
- Test Features 頁也只有摘要卡列保持 sticky，說明、搜尋、Excel 按鈕與 Case 內容正常捲動。

### 19.2 Rack 1 Test Features 動態資料

- 最後一頁改名為 `Test Features`，不再使用固定 `D.SUITE_DEFINITIONS` 與 Case Title 比對。
- `D.featureInventory()` 每次 Query 後直接遍歷 `D.S.racks[0]`，把 Rack 1 的每個 Test Case 歸到階層中最近的上層 Feature；沒有 Feature 祖先的項目保留在 `Unmapped`。
- Feature 區塊不使用多層下拉，全部直接平鋪；每個 Case 卡片顯示 ID、Title、State、Changed、Priority、Sample Size、Cycles、Duration、Script type、CRC SDK、IGS Owner、Comments 與 Linked Bugs。
- Search 同時涵蓋 Feature、Case ID／Title、State、各 Metrics、Owner、Comments 與 Bug。

### 19.3 Excel 行為

- Excel 資料來源同步改為 `D.featureInventory()`，因此輸出的是 Rack 1 當次 Query 的完整 Case 清單。
- 工作表名稱為 `Rack 1 Features`，第 4 欄為 `Test Feature`，檔名格式為 `C4143-Rack1-Test-Features-YYYYMMDD-HHMM.xls`。
- 仍保留 16 欄、凍結 Header、AutoFilter、Case ID hyperlink 與 Azure DevOps URL。

### 19.4 驗證結果

- 1280 × 720 桌面預覽中，Overview 9 張卡片與 Rack 1 的 5 張卡片都只有一個 Top 座標，確認沒有換行。
- 捲動 1100px 時 `.panel-sticky` Top 為 84px、左側 Tabs Top 為 92px；Overview 圖表 Bottom 已為負值，確認圖表會捲離畫面而摘要卡維持固定。
- Test Features 由 Rack 1 階層產生 12 個 Feature、54 張 Case 卡片、0 個舊式 `details` 下拉；搜尋 `Performance` 後只保留 1 個 Feature／2 個 Case。
- Excel 實際下載為 55 列（含 Header）× 16 欄，工作表 `Rack 1 Features`，AutoFilter `R1C1:R55C16`；Browser Console 無 Error／Warning。

---

## 20. 2026-08-14 Test Features 列表復原與 Rack 1 數量同步（v1.8.2）

- 保留 `D.featureInventory()` 的動態 Rack 1 資料來源，不恢復固定 Case Title 清單。
- Test Features 顯示方式由平鋪 Case 卡片改回 Feature `details` 展開／收合與橫向可捲動 Case table。
- 每個 Feature 表格共 13 欄：ID、Title、State、Changed、Priority、Sample Size、Cycles、Duration、Script type、CRC SDK、IGS Owner、Linked Bugs、Comments。
- 工具列恢復 **Expand all**、**Collapse all**，並保留 Excel 下載與 Search；搜尋命中時自動展開對應 Feature。
- 新增 `LISTED / RACK 1 CASES` 摘要卡，左值來自列表實際 entries，右值直接來自 `D.collect(D.S.racks[0], 'Test Case')`；兩者相同時使用綠色標示，不一致時改為紅色。
- Browser fixture 驗證 Rack 1 卡片為 54、列表為 54 rows，對照卡顯示 `54 / 54`；12 個 Feature 執行 Expand all 後全部開啟、Collapse all 後全部關閉。
- 搜尋 `Performance` 後只保留 Performance Feature 與 2 筆 Case；表格 13 欄完整，Browser Console 無 Error／Warning。
