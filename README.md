# 食候 TABEMACHI

朋友們私下在 Discord 頻道推薦候選餐廳，本 repo 把這些推薦整理成一個公開、可以直接瀏覽的靜態網站。

- 線上網址：<https://samfeng0517.github.io/tabemachi/>
- 靜態網站，無 build 依賴：`index.html` + `assets/`（CSS、原生 ES modules）直接 fetch `data/restaurants.json` 渲染
- 由 GitHub Pages（GitHub Actions 發布來源）自動部署，push 到 `main` 就會更新

## 資料格式

所有內容都在 `data/restaurants.json`，schema 定義於 `scripts/lib/schema.mjs`：

```
{
  "processed_message_count": number,
  "restaurants": Restaurant[],
  "guides": Guide[]
}
```

- **Restaurant**（已辨識或高信心度的餐廳卡）：`id`、`name`、`country`、`area`、`cuisine`、`price`（台灣 / 越南 `$`～`$$$$`；日本 `¥`～`¥¥¥`）、`meal`（`午餐` / `晚餐` / `宵夜` / `全時段`）、`author`、`date`（`YYYY-MM-DD`）、`location`、`note`、`verified`、`source`、`map_url`、`image_url`、`image_credit_url`、`color`（`clay` / `indigo` / `matcha` / `ocean` / `plum` / `saffron`）、`discord_message_ids`。
- **Guide**（多店攻略或資訊不足、待確認的項目）：`id`、`title`、`area`、`tag`、`source`、`note`、`discord_message_ids`。
- 所有 URL 欄位必須是 `https://`（`image_url` 也可以是 repo 內相對路徑 `images/<id>.webp` 或空字串）。

任何修改都必須通過驗證才能發布：

```
node scripts/validate.mjs data/restaurants.json
```

## 每週自動整理是怎麼運作的

一個 Claude 雲端排程每週一上午 10:00（台北時間）會：

1. 讀取固定的 Discord 餐廳推薦頻道（透過「Discord Restaurant Collector」MCP）裡尚未處理的訊息
2. 上網查證，盡量把每則推薦整理成資料裡的餐廳卡；查不到可靠來源就整理成「攻略與待確認」並附上已知線索
3. 通過 scope 檢查與資料驗證後，commit 並 push 到 `main`（觸發 GitHub Pages 自動部署）
4. push 成功後，把已經寫進網站的 Discord 原訊息封存並刪除

完整規則見 [`ROUTINE.md`](./ROUTINE.md)。若要在對話中直接請 Claude 幫忙修改資料，規則見 [`CLAUDE.md`](./CLAUDE.md)。

## 本機開發

需要 Node.js 22+，沒有其他 dependencies。

```
npm test                                    # 執行所有測試
node scripts/validate.mjs data/restaurants.json   # 驗證資料檔
python3 -m http.server 8765                 # 本機預覽網站（於 repo 根目錄執行後開啟 http://localhost:8765/）
```
