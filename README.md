# nas-ai-bridge

讓線上 AI 智能體（claude.ai、Claude Code、Codex、ChatGPT）安全讀取家中 NAS 檔案的整合方案。
一個 repo、一條自動流程、產出兩個映像。

```
智能體 ─HTTPS─▶ mcp.nas.hisamori.app（Vultr：nginx → OAuth 閘門 → frps）
                    ◀─ frpc（NAS）─▶ filesystem-mcp ──▶ converter（只在內部網路）
                                          │
                                 /data/read（唯讀）、/data/write（只有 AI回寫）
```

## 目錄

| 路徑 | 內容 | 來源 |
|---|---|---|
| `mcp/` | filesystem-mcp 原始碼與我們的補丁（`read_pdf_pages`、`read_document`、`read_video_frames`、`locate`、`write_binary`、`read` 自動分流） | 上游 [j0hanz/filesystem-mcp](https://github.com/j0hanz/filesystem-mcp)（MIT），以 git subtree 保留完整歷史 |
| `converter/` | 只有一個 Dockerfile，以 digest 釘住 Xberg core | 上游 [xberg-io/xberg](https://github.com/xberg-io/xberg)（MIT），不複製原始碼 |
| `deploy/nas/` | NAS 上的 compose、frpc 範本 | 密鑰只在 NAS 的 `.env`，見 `.env.example` |
| `deploy/vultr/` | frps、限速、告警、品牌登入頁 | 密鑰只在 Vultr 主機 |
| `tests/` | 兩個映像一起跑的整合測試 | |
| `upstream/` | 目前合併到的上游版本 | 由自動流程更新 |

## 映像

| 映像 | 用途 |
|---|---|
| `ghcr.io/jacobzong/nas-ai-bridge-mcp:nas` | 檔案 MCP |
| `ghcr.io/jacobzong/nas-ai-bridge-converter:nas` | 文件轉換器 |

`:nas` 永遠指向最新一次測試全過的建置；每次發布另推 `:nas-<commit>`，出問題時把 compose 改成上一個 commit 即可回退。

## 自動流程（`.github/workflows/sync.yml`）

每天 03:00（東京）：

1. 上游 filesystem-mcp 有新版 → `git subtree pull` 合進 `mcp/`；有衝突就停下、不發布。
2. Xberg core 有新建置 → 更新 `converter/Dockerfile` 的 digest。
3. 跑 `mcp/` 的完整測試，建兩個映像，用 `tests/` 把兩者一起跑整合測試。
4. 全過且有變動才發布兩個映像並推回 `main`。

手動強制發布：

```bash
gh workflow run sync.yml -R JacobZong/nas-ai-bridge -f force_publish=true
```

PR 與 push 只跑測試，不發布。

## 部署

NAS Docker → 專案 `filesystem-mcp` → 重新部署並勾「拉取最新映像」。部署後跑
`nas_mcp_check.py --e2e`（在 `nas-mcp-remote-access` Skill 內）。

## frpc（刻意不做成映像）

frpc 是整條連線的入口：它一斷，WebDAV 與 MCP 同時斷，而且只能在家中區網修。所以它在 NAS 上是獨立專案 `docker/frpc/`
（alpine:3.20 ＋ 官方 frp **0.57.0** 執行檔），不跟 MCP 一起更新或重新部署；本 repo 只保存它的設定範本 `deploy/nas/frpc/frpc.toml`。
frpc 要和 Vultr 的 frps（同為 0.57.0）配對升級，兩邊在同一次維護裡一起換。

## 授權

本 repo 自己的檔案以 MIT 授權；`mcp/` 保留上游的 `LICENSE`。上游清單見 `NOTICE`。
