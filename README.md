# Azure DevOps State Monitoring

C4143 DV-Scale Rack Test Status Dashboard 是一個 Tampermonkey userscript。它會在 Azure DevOps 的同源專用頁面中執行 Query、讀取 Work Items，並建立 Overview、Rack 1～5、State、Pass／Fail、Priority、Bug、Sample Size、Test Duration 與 `Number_of_cycles` 統計。

## 目前版本

- Dashboard：[C4143-DVScale-Dashboard.user_v1.6.2-number-of-cycles.js](./C4143-DVScale-Dashboard.user_v1.6.2-number-of-cycles.js)
- 開發與維護文件：[C4143-DVScale-Dashboard-HANDOFF.md](./C4143-DVScale-Dashboard-HANDOFF.md)
- Azure DevOps organization：`https://azurecsi.visualstudio.com`
- Azure DevOps project：`Dev`

## 使用 Tampermonkey 安裝

### 1. 安裝 Tampermonkey

在 Chrome 安裝 [Tampermonkey](https://www.tampermonkey.net/)，安裝後確認擴充功能已啟用。

### 2. 下載目前的 JS

1. 開啟目前版本的 [Dashboard JS](./C4143-DVScale-Dashboard.user_v1.6.2-number-of-cycles.js)。
2. 在 GitHub 檔案頁面按 **Download raw file**，把 `.js` 檔下載到電腦。

### 3. 匯入 Tampermonkey

1. 點 Chrome 工具列上的 Tampermonkey 圖示。
2. 開啟 **Dashboard**。
3. 切換到 **Utilities**。
4. 在 **Import from file** 選擇剛下載的 JS。
5. 按 **Install**。
6. 回到 Tampermonkey Dashboard，確認腳本狀態是 Enabled。

也可以在 Tampermonkey 選擇 **Create a new script**，將 JS 全部內容貼入編輯器後按 `Ctrl+S` 儲存。

> 更新版本時，請先停用或刪除舊版，只保留一個 C4143 Dashboard userscript，避免兩個版本同時執行。

## 每次開啟 Azure DevOps 時自動抓取更新

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
3. README 中的目前版本檔名與安裝連結。
4. Tampermonkey `@version` 與檔頭說明。

詳細架構、欄位 mapping、版本歷程與驗證紀錄請參考 [HANDOFF](./C4143-DVScale-Dashboard-HANDOFF.md)。
