# Local Pulse

Ollama、LM Studio、OpenAI互換APIで動くローカルLLMの応答速度を、ブラウザから計測するWebツールです。

## 主な機能

- 生成速度（tokens / second）の計測
- TTFT（リクエストから最初の出力まで）の計測
- 生成完了までの総時間と出力トークン数の表示
- ストリーミング中のモデル出力表示
- Ollama、LM Studio、OpenAI互換APIへの接続
- 接続設定と直近5件の結果をブラウザ内に保存

## 必要なもの

- [Node.js](https://nodejs.org/) 22.13.0以上
- npm（Node.jsに同梱）
- Ollama、LM Studioなど、計測対象となるローカルLLMサーバー

## Windowsで簡単に起動する

1. GitHubの「Code」→「Download ZIP」からダウンロードして展開します。
2. `start-local.cmd` をダブルクリックします。
3. 初回だけ必要なパッケージが自動でインストールされます。
4. 起動後、ブラウザで `http://localhost:3000` が開きます。

終了するには、起動時に開いた黒い画面で `Ctrl+C` を押してください。

## コマンドで起動する

Windows、macOS、Linuxで共通です。

```bash
npm install
npm run local
```

サーバーだけを起動してブラウザを自動で開かない場合は、次を使用します。

```bash
npm run dev -- --host localhost --port 3000 --strictPort
```

macOSまたはLinuxでは、補助スクリプトからも起動できます。

```bash
sh start-local.sh
```

## 使い方

1. OllamaまたはLM Studioのローカルサーバーを起動します。
2. Local Pulseを `http://localhost:3000` で開きます。
3. プロバイダーを選び、エンドポイントとモデル名を入力します。
4. 「計測を開始」を押します。

標準エンドポイントは次の通りです。

| サーバー | エンドポイント |
| --- | --- |
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |

## 接続できない場合

- ローカルLLMサーバーが起動しているか確認してください。
- 入力したモデルがインストール済みか確認してください。Ollamaでは `ollama list` で確認できます。
- LM StudioではLocal Serverを開始し、ブラウザからの接続を許可してください。
- CORSエラーが出る場合は、ローカルLLMサーバー側で `http://localhost:3000` を許可してください。

OllamaをWindowsで一時的に起動する例です。すでにOllamaが動いている場合は、先に完全終了してください。

```powershell
$env:OLLAMA_ORIGINS="http://localhost:3000"
ollama serve
```

## GitHubで公開する

`node_modules`、ビルド結果、ローカル設定は `.gitignore` の対象です。リポジトリへはソースコード、`package.json`、`package-lock.json`、README、ライセンスを登録してください。

```bash
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
```

`<YOUR_REPOSITORY_URL>` は、作成したGitHubリポジトリのURLに置き換えてください。

## 開発・検証

```bash
npm test
npm run lint
```

## データの保存先

入力したプロンプトとモデル出力は、ブラウザと指定したエンドポイントの間で処理されます。接続設定と直近5件の履歴は、利用中のブラウザのローカルストレージに保存されます。

## ライセンス

[MIT License](LICENSE)
