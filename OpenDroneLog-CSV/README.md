# DJI 飛行記録 for Open DroneLog CSV

Open DroneLog でエクスポートした CSV ファイルを読み込み、飛行記録を一覧表示する PWA アプリです。

## ファイル構成

```
OpenDroneLog-CSV/PWA/
├── index.html      ← メインアプリ
├── manifest.json   ← PWA マニフェスト
├── sw.js           ← Service Worker（オフライン対応）
├── icon-192.png    ← アプリアイコン 192×192（別途用意）
├── icon-512.png    ← アプリアイコン 512×512（別途用意）
└── README.md
```

## 使い方

1. PWA以下のすべてのファイルをウェブサーバーに配置する（HTTPS 推奨）
2. ブラウザで `index.html` を開く（PWA なのでローカルにアプリとしてインストールできます）
3. 「ファイルを選択」ボタンから Open DroneLog の CSV を選択
4. 飛行記録が表形式で表示される
5. 3〜4を繰り返す
6. 「TSVとしてコピーボタンを押し、結果を表計算アプリなどに貼り付けて保存

## 以下は参考データ

### CSV フォーマット（Open DroneLog 形式）

- 1行目：列ヘッダー（`metadata` 列を含む）
- 2行目以降：フライト記録。`metadata` 列は JSON 形式で以下のフィールドを含む：
  - `aircraft_name`：ドローン名
  - `start_time`：離陸時刻（UTC、例: `"2026-06-02 01:21:11.294+00"`）
  - `duration_secs`：飛行時間（秒）
  - `max_altitude_m`：最大高度（m）
  - `max_speed_ms`：最大速度（m/s）
  - `home_lat`、`home_lon`：離陸地点の緯度・経度

## ローカルでの動作確認

```bash
npx serve .
# または
python3 -m http.server 8080
```

HTTPS が必要な場合：
```bash
npx local-ssl-proxy --source 8443 --target 8080
```

## 機能

- CSV ファイルの解析と飛行記録の表示
- JST への時刻変換（GMTから自動変換）
- 速度を m/s から km/h に変換
- OpenStreetMap Nominatim による逆ジオコーディング（日本語住所）
- TSV 形式でクリップボードへコピー（Excel 等へ貼り付け可能）
- PWA：ホーム画面への追加・オフライン動作対応
