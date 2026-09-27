# CLAUDE.md — 給任何在此 repo 對話的 Claude session

本檔案適用於使用者（Sam）在 Claude 對話中直接要求修改本 repo 內容的情境（例如「把某間店的地區改成 X」「幫我加一間店」）。若你是每週自動執行的排程，請改讀 `ROUTINE.md`，該檔案的規則優先於本檔案。

## 修改資料時的規則

- 開始編輯前，先執行 `git fetch origin main && git checkout -B main origin/main`，確保工作副本就是最新的遠端 `main`（工作階段可能一開始停在 `claude/...` 等其他分支；這也避免跟每週排程或其他 session 的變更衝突）。
- 使用者要求修改餐廳 / 攻略資料時，**只修改 `data/restaurants.json`**（必要時可一併新增 / 調整 `images/` 底下的圖片檔案；不要在 `data/` 底下新增其他檔案，網站只會發布 `data/restaurants.json`）。除非使用者明確要求改網站外觀或程式，不要動 `index.html`、`assets/`、`scripts/`、`ROUTINE.md` 等其他檔案。
- 保持既有 schema：欄位定義見 `scripts/lib/schema.mjs`；不要新增 schema 未定義的欄位，也不要拿掉必要欄位。任何 URL 欄位都只能是 `https://`，且不得指向 Discord（`discord.com`、`discordapp.com`、`discordapp.net`、`discord.gg` 及其子網域）。
- 修改完成後，依序執行：
  1. `node scripts/validate.mjs data/restaurants.json`
  2. `npm test`
  - 兩者都必須通過才可以繼續；若有錯誤，先修正資料再重試。
- 通過檢查後，直接 commit 並 `git push origin HEAD:main`（不另開分支、不開 PR，直接發布到正式網站；永遠不要 force push）。
- push 後執行 `node scripts/verify-pushed.mjs`，exit 0（本地 `HEAD` 與遠端 `main` 相同）才算發布成功；「Everything up-to-date」不代表已發布。
- 確認發布後，告知使用者網站會在幾分鐘內更新（GitHub Pages 部署需要一點時間）。

## UI / 網站程式異動

- 只有在使用者**明確要求**修改網站外觀或前端程式（`index.html`、`assets/`）時才可以動這些檔案；一般的資料異動請求不要順手改版面或文案。

## 給管理者的提醒

- `main` 分支必須維持**不保護**（或至少明確允許 Claude GitHub App 直接 push），否則每週排程的直接 push 會失敗。
