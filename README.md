# Devtools Performance Monitor

Plasmoで作成したChrome DevTools拡張です。  
DevTools内に`DEV`パネルを追加し、現在の検査対象タブのパフォーマンスメトリクスを可視化します。

## 主な機能

- `JS Heap` / `Nodes` / `CPU` を0.1秒ごとにサンプリングして表示
- 直近60サンプルのスパークライン表示
- スロットリング未適用時でも監視は常時継続
- CPUスロットリング設定（`1.0x`〜`20.0x`）
- Networkエミュレーション（Latency / Download / Upload / Offline）
- スロットリング適用・解除とエラーメッセージ表示

## 技術スタック

- [Plasmo](https://docs.plasmo.com/)
- TypeScript
- Chrome DevTools API / Chrome Debugger Protocol

## セットアップ

```bash
pnpm install
pnpm dev
```

`pnpm dev`実行後、Chromeの拡張機能画面で`build/chrome-mv3-dev`を「パッケージ化されていない拡張機能を読み込む」から読み込んでください。

## 使い方

1. 計測したいページを開く
2. そのページでDevToolsを開き、`DEV`タブを選択
3. 監視は自動開始される
4. 必要に応じてCPU/Network設定を入力し、`Apply Throttling`を押す
5. スロットリング解除時は`Reset Throttling`を押す

## スクリプト

- `pnpm dev`: 開発ビルド（`build/chrome-mv3-dev`）
- `pnpm build`: 本番ビルド（`build/chrome-mv3-prod`）
- `pnpm package`: 配布用パッケージ作成

## GitHub ActionsでZIPリリース

ボタン実行でZIP付きのGitHub Releaseを作成できます。

1. GitHubの`Actions`タブで`Release ZIP`ワークフローを開く
2. `Run workflow`を押し、`tag`（例: `v0.1.0`）を入力して実行
3. 完了後、`Releases`に`build/chrome-mv3-prod.zip`が添付されたリリースが作成される

補足:
- ワークフロー定義: `.github/workflows/release.yml`
- リポジトリ設定で`GITHUB_TOKEN`に`Contents: Read and write`権限が必要です。

## プロジェクト構成

```text
src/
  devtools.tsx
  devtools/
    entities/performance/model/metrics.ts
    features/performance-monitor/model/performance-monitor-client.ts
    pages/devtools-panel/model/devtools-panel-controller.ts
    widgets/performance-dashboard/ui/performance-dashboard-widget.ts
devtools/
  panel.html
```

## 注意点

- 計測とスロットリングは`chrome.debugger`権限を使って実行されます。
- サンプル開始直後はCPU値が`N/A`になることがあります（差分計算の初期化のため）。
- `Reset Throttling`押下時、CPU/Networkエミュレーションはベストエフォートで解除されます。
