# 開発・公開手順

[READMEに戻る](../README.md) · [データと集計の仕様](data-format.md)

このページはコードを変更したり、自分で公開したりする方向けです。利用するだけなら[公開アプリ](https://myaisr.github.io/golf_score_record/)を開いてください。

## ローカル起動

リポジトリを取得し、作業フォルダへ移動します。

```bash
git clone https://github.com/myaisr/golf_score_record.git
cd golf_score_record
```

Node.jsで起動します。

```bash
node scripts/preview.mjs
```

またはPythonの静的サーバーを使います。

```bash
python -m http.server 8000 --bind 127.0.0.1
```

`http://localhost:8000/` を開いてください。PWAはlocalhostまたはHTTPSで動作します。

ローカル起動ではPC上のファイルを使い、公開URLではGitHub Pagesに反映されたファイルを使います。記録機能は同じですが、ブラウザの保存先が別になるため、記録の移動にはJSONの出力・復元を使います。ローカルのサーバーは確認が終わったら `Ctrl+C` で停止できます。

## UIプレビュー

`http://localhost:8000/?preview=1` は通常の記録とは別の保存領域を使います。「サンプル」で18H入力済みの終了ラウンドを表示し、目標比較やPNGを試せます。入力を試す場合は結果の「記録を再開」を押してください。サンプルはお試しの現在ラウンドを置き換えます。

公開版・ローカル版それぞれで、通常の記録と `?preview=1` の記録は分離しています。通常URLで開いた記録にサンプルを混ぜずに確認できます。

## テスト

アプリ・データモデル・オフラインのテスト：

```bash
node --test tests/core.test.cjs tests/app.test.cjs tests/offline.test.cjs
```

Excel取り込みのテスト：

```bash
python -m unittest discover -s tests -p test_excel_import.py -v
```

自動テストではティー方向とショートの選択、直接ONの分母除外、0と未入力、目標の良否反転、途中保存・再読み込み・終了、旧データ移行、同一ID更新、JSON検証、PNGの描画範囲、オフラインキャッシュ、Excelとの指標整合性を確認します。iPhone/Safariの表示・タッチ操作と、Excelアプリ固有の描画・再計算は、対象端末でも確認してください。

## GitHub Pagesへの公開

GitHub Pagesでは **Settings → Pages → Deploy from a branch → main / (root)** を指定します。`index.html`、`app.js`、`roundnote-core.js`、`app.css`、`sw.js`、マニフェスト、アイコンを同じ階層で公開してください。Excel用PythonスクリプトはPages上では実行せず、PCで使用します。

このリポジトリの公開URLは https://myaisr.github.io/golf_score_record/ です。`main` にマージするとPagesの公開処理が走ります。GitHubのActionsで「pages build and deployment」の成功を確認し、公開URLをオンラインで再読み込みしてください。

PWAの配信ファイルを更新した場合は `sw.js` のキャッシュ名も更新し、オフラインで使うファイルを追加した場合は `ASSETS` に含めてください。

## ファイル構成

- `index.html`：静的エントリーポイント
- `app.css`：既存のグリーン基調のレスポンシブUI
- `app.js`：入力、画面遷移、保存、履歴、目標設定、JSON、PNG
- `roundnote-core.js`：スキーマ移行・検証、集計、目標比較、JSONマージ。ブラウザとNode.jsで利用
- `sw.js`：アプリ本体のオフラインキャッシュ
- `manifest.webmanifest`・アイコン：ホーム画面追加
- `scripts/preview.mjs`：ローカルプレビュー
- `scripts/import_rounds.py`：JSONと既存Excelをマージして分析ブックを生成
- `requirements-excel.txt`：Excel用Pythonライブラリ
- `tests/`：Node.jsとPythonの回帰テスト
- `docs/`：利用・開発・Excel・データ仕様の詳細ドキュメント

## ローカルのデータファイル

JSONは `backups/`、Excelは `outputs/` に保存します。両フォルダ全体とJSON・Excelファイルは `.gitignore` の対象です。日付・ゴルフ場名・プレー記録を含むため、公開リポジトリには追加しないでください。

Excel取り込みのセットアップは[Excelへの取り込み・更新手順](excel.md)を参照してください。
