# Azure DevOps State Monitoring

C4143 DV-Scale Rack Test Status Dashboard 是一個 Tampermonkey userscript。它會在 Azure DevOps 的同源專用頁面中執行 Query、讀取 Work Items，並建立 Overview、Rack 1～5、Rack 1 Test Features、State、Pass／Fail、Priority、Bug、Sample Size、Test Duration 與 `Number_of_cycles` 統計。

## 目前版本

- Dashboard：[C4143-DVScale-Dashboard.user.js](./C4143-DVScale-Dashboard.user.js)（固定安裝網址，腳本內版本 v1.8.3）
- 開發與維護文件：[C4143-DVScale-Dashboard-HANDOFF.md](./C4143-DVScale-Dashboard-HANDOFF.md)
- Azure DevOps organization：`https://azurecsi.visualstudio.com`
- Azure DevOps project：`Dev`

## Test Features 分頁

v1.8.2 的 `Test Features` 每次 Query 後直接遍歷 Rack 1 的最新 Work Item 階層，把全部 Rack 1 Test Case 依最近的上層 Feature 動態分組，不再依賴預先寫死的 Case Title 清單。畫面恢復為原本的 Feature 展開／收合與 Case 表格列表，顯示 ID、Title、State、Changed Date、Priority、Sample Size、Number of Cycles、Test Duration、Script type、CRC SDK、IGS Owner、Linked Bugs 與 Comments；Search 可同時篩選上述資料。

頁面上的 `LISTED / RACK 1 CASES` 卡片會直接比較最後一頁列出的 Case 數與 Rack 1 分頁的 Case 數，正常情況應顯示 `58 / 58`。

目前正式基準為 **5 Racks × 58 Cases = 290 Cases**。v1.8.3 起，Overview 的 `TOTAL TEST CASES / EXPECTED` 應顯示 `290 / 290`，每個 Rack 的 `TEST CASES / EXPECTED` 應顯示 `58 / 58`。如果 Query 回傳數量不同，卡片會變成紅色，右下提示會列出總數及各 Rack 的差異；Dashboard 不會自行補造缺少的 Case。

v1.7.2 將 Overview、Rack 1～5 與最後一頁改為左側直式導覽。分頁上下排列，文字整段旋轉顯示；桌面版導覽寬 64px、按鈕寬 50px、字體 11px，窄螢幕自動縮為 54px／44px／10px，不占用右側 Dashboard 的資料空間。

v1.7.3 修正 re-query 完成提示的顯示時間：藍色資訊與黃色警告會在 4.5 秒開始淡出、5.2 秒完全隱藏；只有紅色載入錯誤會保留，方便使用者閱讀與排除問題。

v1.8.1 將固定範圍縮小為控制列、左側分頁與摘要卡；圓餅圖、比較圖及以下內容會正常跟隨頁面捲動。所有摘要卡強制維持單列，空間不足時只在卡片列內水平捲動，不會換到下一列。**Download Excel (.xls)** 改為輸出 Rack 1 Test Features 的 16 欄 Excel 2003 XML 工作表，包含凍結標題列、AutoFilter 與 Azure DevOps hyperlink，無需外部 CDN。

## 使用 Tampermonkey 安裝

### 1. 安裝 Tampermonkey

在 Chrome 安裝 [Tampermonkey](https://www.tampermonkey.net/)，安裝後確認擴充功能已啟用。

### 2. 下載目前的 JS

1. 開啟固定入口的 [Dashboard JS](./C4143-DVScale-Dashboard.user.js)。
2. 在 GitHub 檔案頁面按 **Download raw file**，把 `.js` 檔下載到電腦。

### 3. 匯入 Tampermonkey

1. 點 Chrome 工具列上的 Tampermonkey 圖示。
2. 開啟 **Dashboard**。
3. 切換到 **Utilities**。
4. 在 **Import from file** 選擇剛下載的 JS。
5. 按 **Install**。
6. 回到 Tampermonkey Dashboard，確認腳本狀態是 Enabled。

也可以在 Tampermonkey 選擇 **Create a new script**，將 JS 全部內容貼入編輯器後按 `Ctrl+S` 儲存。

> 從舊的版本檔名切換到固定入口時，需要最後一次手動安裝，並停用或刪除舊版。之後只保留一個 C4143 Dashboard userscript，避免兩個版本同時執行。

## Dashboard 腳本自動更新

固定入口的 userscript 已包含：

```text
@updateURL   https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
@downloadURL https://raw.githubusercontent.com/alan512627/azure-devops-state-monitoring/main/C4143-DVScale-Dashboard.user.js
```

第一次由固定入口安裝後，Tampermonkey 會依自己的更新檢查間隔讀取 GitHub 上的 `@version`；當 repository 的版本號提高時，它會下載並取代已安裝版本。更新完成後，重新整理 Azure DevOps 頁面就會執行新版，不需要再次 Import。

建議在 Tampermonkey Dashboard 的 **Settings → Script Update** 中，把更新檢查間隔調成你可接受的最短間隔，並確認該腳本的更新檢查沒有被關閉。如果剛 push 完希望立刻取得新版，可從 Tampermonkey 選單手動執行一次 **Check for userscript updates**，完成後再重新整理 Azure DevOps。

> Tampermonkey 的標準更新是定時檢查，並不保證每一次按 `F5` 都立即連到 GitHub。因此一般情況只要重新整理即可；剛發布、但尚未到下一次檢查時間時，需要等候更新間隔或手動檢查一次。

## 每次開啟 Azure DevOps 時自動抓取資料更新

### 專用 Dashboard 網址

先確認同一個 Chrome 已登入 Azure DevOps，然後開啟：

```text
https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash
```

建議把這個網址加入書籤。每次開啟書籤或按 `F5` 時，userscript 都會重新啟動 Dashboard。

### 確認使用 Live query

Dashboard 上方的 **Data source** 必須選擇：

```text
Live query (same-origin REST API)
```

選擇會儲存在瀏覽器中。只要維持 Live query，每次開啟專用網址或重新整理頁面，就會重新執行 Azure DevOps Query 並抓取最新 Work Items。

如果 Data source 選成 **Offline snapshot**，頁面只會讀取上一次的快照，不會向 Azure DevOps 抓取更新。

### 設為 Chrome 啟動頁面（選用）

如果希望每次啟動 Chrome 都自動開啟 Dashboard：

1. 開啟 Chrome **Settings**。
2. 進入 **On startup**。
3. 選擇 **Open a specific page or set of pages**。
4. 加入專用 Dashboard 網址：

```text
https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash
```

Chrome 啟動並載入這個頁面後，Tampermonkey 會自動執行腳本；Live query 隨即重新抓取資料。

> 腳本不會覆蓋所有一般 Azure DevOps 頁面。自動 Dashboard 只會在 `#dvdash` 專用入口，或 `/_apis/projects` 路徑啟動，避免影響 Boards、Queries、Test Plans 等正常操作。

## Dashboard 更新方式

- 每次開啟專用網址或按 `F5`：重新執行 Query。
- 按 **Re-run query**：立即重新抓取。
- 勾選 **Auto refresh every 5 min**：頁面保持開啟時每 5 分鐘更新。
- **Time range (by Changed Date)**：只篩選指定期間內有更新的 Test Cases。
- 若短時間範圍沒有資料，可切回 **All time**。

## 常見問題

### 只看到 Azure DevOps Projects JSON，沒有 Dashboard

- 確認 Tampermonkey 已安裝且腳本是 Enabled。
- 確認網址是 `https://azurecsi.visualstudio.com/_apis/projects?api-version=6.0#dvdash`。
- 重新整理頁面。
- 確認沒有同時安裝多個舊版 Dashboard userscript。

### Live query 顯示載入失敗

- 確認目前 Chrome 已登入 `azurecsi.visualstudio.com`。
- 不要從本機 `file://` 直接開啟 Dashboard 並使用 Live query；Azure DevOps REST API 不允許跨網域請求。
- 重新開啟專用 Dashboard 網址後再按 **Re-run query**。

### Dashboard 顯示 0 筆

- 先把 Time range 切換成 **All time**。
- 確認 Azure DevOps Query 本身仍可存取。
- 如果只缺少自訂欄位統計，請查看右下角提示，可能是 Azure DevOps Fields API 或欄位名稱已變更。

## 安全性

- Userscript 只讀取 Azure DevOps 資料，不會修改 Work Item。
- Live query 使用目前瀏覽器的 Azure DevOps 登入狀態，不需要把 PAT 寫入 JS。
- Export offline snapshot 會包含實際 Work Item 資料，分享前請確認接收者與資料權限。

## 維護方式

後續 Dashboard 有更新時，請在本 repository 一併更新：

1. 最新版本的 userscript。
2. `C4143-DVScale-Dashboard-HANDOFF.md`。
3. README 中的目前版本號與固定安裝連結。
4. Tampermonkey `@version` 與檔頭說明。

詳細架構、欄位 mapping、版本歷程與驗證紀錄請參考 [HANDOFF](./C4143-DVScale-Dashboard-HANDOFF.md)。
