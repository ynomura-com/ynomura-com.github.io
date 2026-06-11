# プログラム仕様書
## DJI 飛行記録 for Open DroneLog CSV

---

## 1. 概要

Open DroneLog アプリからエクスポートした CSV ファイルを読み込み、フライトごとの飛行記録を一覧表示する PWA（Progressive Web App）アプリケーション。

---

## 2. 構成ファイル

| ファイル名 | 種別 | 役割 |
|---|---|---|
| `index.html` | HTML / CSS / JavaScript | メインアプリ（単一ファイル構成） |
| `manifest.json` | JSON | PWA マニフェスト |
| `sw.js` | JavaScript | Service Worker（オフライン対応） |
| `icon-192.png` | PNG | アプリアイコン 192×192px |
| `icon-512.png` | PNG | アプリアイコン 512×512px |

すべてのファイルを同一ディレクトリに配置し、HTTPS サーバーで提供する。

---

## 3. index.html

### 3-1. メタ情報

| 属性 | 値 |
|---|---|
| `charset` | UTF-8 |
| `viewport` | `width=device-width, initial-scale=1.0` |
| `theme-color` | `#f0f4f8` |
| `description` | Open DroneLog CSVファイルを解析して飛行記録を表示するPWAアプリ |
| `manifest` | `manifest.json` |
| `apple-touch-icon` | `icon-192.png` |
| `title` | DJI 飛行記録 for Open DroneLog CSV |

### 3-2. 使用フォント（Google Fonts）

| フォント名 | 用途 |
|---|---|
| Syne（400/600/700/800） | 見出し（h1） |
| IBM Plex Mono（400/500） | バッジ・数値・テーブルヘッダー等 |
| Noto Sans JP（300/400/500/700） | 本文・ボタン全般 |

### 3-3. カラーテーマ（CSS カスタムプロパティ）

ライトテーマ。`body::before` に 48px グリッドの背景パターンを重ねる。

| 変数名 | 値 | 用途 |
|---|---|---|
| `--bg` | `#f0f4f8` | ページ背景 |
| `--bg2` | `#ffffff` | カード・テーブル背景 |
| `--bg3` | `#e8edf2` | テーブルヘッダー背景 |
| `--surface` | `#f7f9fc` | チップ・ホバー背景 |
| `--surface2` | `#edf1f6` | トースト背景 |
| `--accent` | `#0055cc` | アクセント（テキスト・ボーダー） |
| `--accent2` | `#0066ff` | プライマリボタン背景 |
| `--accent-dim` | `rgba(0,85,204,0.08)` | バッジ背景 |
| `--accent-border` | `rgba(0,85,204,0.25)` | バッジボーダー |
| `--text` | `#1a2233` | メインテキスト |
| `--text-muted` | `#4a5a74` | サブテキスト |
| `--text-faint` | `#8a99b0` | 補足テキスト |
| `--danger` | `#d63050` | 危険ボタン・エラー |
| `--success` | `#0a7a50` | 飛行時間テキスト |
| `--border` | `rgba(60,80,120,0.12)` | 通常ボーダー |
| `--border-bright` | `rgba(60,80,120,0.22)` | 強調ボーダー |
| `--radius` | `8px` | 標準角丸 |
| `--radius-lg` | `14px` | 大きめ角丸（テーブルラッパー等） |

### 3-4. 画面レイアウト

```
┌─────────────────────────────────────────┐
│ [PWA · DRONE ANALYZER] バッジ           │ ← header
│ ドローンログ解析                         │
│ for Open DroneLog CSV                   │
│ Open DroneLog でエクスポートした…        │
├─────────────────────────────────────────┤
│ [インストール] バナー（条件付き表示）    │ ← install-banner
├─────────────────────────────────────────┤
│ [ファイルを選択] [TSVとしてコピー]       │ ← controls
│ [内容をクリア]                          │
├─────────────────────────────────────────┤
│ フライト数 | 総飛行時間 | 最大高度 |    │ ← stats-bar（データあり時のみ）
│ 最高速度                                │
├─────────────────────────────────────────┤
│ FLIGHT RECORDS              N 件        │ ← table-wrapper
│ 日付 ドローン名 離陸 着陸 …            │
│ …                                       │
│ （データなし時：空状態メッセージ）       │
└─────────────────────────────────────────┘
```

#### ヘッダー（header）

- バッジ：`PWA · DRONE ANALYZER`（IBM Plex Mono、パルスアニメーション付きドット）
- h1：`ドローンログ解析 for Open DroneLog CSV`（Syne、`clamp(24px, 4vw, 42px)`）
- サブタイトル：`Open DroneLog でエクスポートした CSV ファイルを選択してください`

#### インストールバナー（install-banner）

- `beforeinstallprompt` イベント発火時のみ表示
- 「インストール」ボタンで PWA インストールプロンプトを起動
- ✕ ボタンで非表示

#### 操作ボタン（controls）

| ボタン名 | スタイルクラス | 動作 |
|---|---|---|
| ファイルを選択 | `btn-primary`（青塗り） | ファイル選択ダイアログを開く |
| TSV としてコピー | `btn-secondary`（グレー枠） | 表データをクリップボードへ |
| 内容をクリア | `btn-danger`（赤枠・透明背景） | 表データを全消去 |

各ボタンには SVG アイコンを添える。ホバー時に `translateY(-1px)` で浮き上がるアニメーション。

#### サマリーバー（stats-bar）

フライトデータが 1 件以上存在する場合のみ表示。4 つのチップで構成。

| チップ | 表示値 |
|---|---|
| フライト数 | 読み込み済みレコード件数（整数） |
| 総飛行時間 | 全レコードの `duration_secs` 合計を分換算し、小数点以下 1 桁・四捨五入で表示（例：`19.0分`）。`(totalSecs / 60).toFixed(1)` で算出 |
| 最大高度 | 全レコード中の最大値（m） |
| 最高速度 | 全レコード中の最大値（km/h） |

#### フライトレコード表（table-wrapper）

| 列名 | CSSクラス | 表示内容 |
|---|---|---|
| 日付 | `col-date` | JST 日付（`ja-JP` ロケール） |
| ドローン名 | `col-drone` | `aircraft_name` |
| 離陸時刻 | `col-time` | JST 時刻（HH:MM:SS） |
| 着陸時刻 | `col-time` | 離陸時刻 ＋ 飛行時間 |
| 飛行時間 | `col-duration` | `N分M秒` 形式 |
| 最大高度 | `col-altitude` | 小数点以下 1 桁（m） |
| 最大速度 | `col-speed` | 小数点以下 1 桁（km/h） |
| 離着陸場所 | `col-location` | 逆ジオコーディング結果（取得中は「取得中...」） |

- データ 0 件時：ドローンアイコン＋説明テキストの空状態を表示
- 行ホバー：`var(--surface)` 背景

#### UI コンポーネント

**トースト通知**
- 画面右下に固定表示、3 秒後に自動消去
- `cubic-bezier(0.34, 1.56, 0.64, 1)` のバウンスアニメーションで出現
- 種別：`success`（緑アイコン）／`error`（赤アイコン）

**ローディングオーバーレイ**
- 処理中に全画面を半透明（`rgba(240,244,248,0.88)`）でマスク
- 中央にスピナー＋「解析中...」テキスト

---

## 4. JavaScript 処理仕様

### 4-1. アプリ状態

```javascript
let flightData = [];  // フライトレコードの配列（セッション中に累積）
```

フライトレコードのオブジェクト構造：

| プロパティ | 型 | 内容 |
|---|---|---|
| `date` | string | JST 日付文字列 |
| `droneName` | string | ドローン名 |
| `takeoffTime` | string | JST 離陸時刻文字列 |
| `landingTime` | string | JST 着陸時刻文字列 |
| `duration` | string | `N分M秒` 形式の飛行時間 |
| `_durationSecs` | number | 飛行時間（秒、計算用） |
| `maxAlt` | string\|null | 最大高度（小数点以下1桁の文字列） |
| `maxSpeed` | string\|null | 最大速度 km/h（小数点以下1桁の文字列） |
| `location` | string\|null | 住所文字列（取得前は `null`） |
| `_lat` | any | 緯度（ジオコーディング用） |
| `_lon` | any | 経度（ジオコーディング用） |

### 4-2. CSV パーサー（`parseCSV`）

RFC 4180 準拠の**1パース**実装。行分割と列分割を分離せず、1 文字ずつ走査する。

```
状態: inQ（クォート内フラグ）
文字ごとの処理:
  inQ = true のとき:
    " → 次文字も " ならエスケープ済みクォート（field += '"', i++）
          違うなら閉じクォート（inQ = false）
    null（EOF）→ row.push(field)
    その他 → field += c
  inQ = false のとき:
    " → 開きクォート（inQ = true）
    , → 列区切り（row.push(field), field = ''）
    \n または null → 行区切り（row.push(field), 空行除外して rows.push(row)）
    その他 → field += c
```

**重要：** セル内に `""` エスケープされたクォートを多数含む列（`messages` 列等）が存在しても、1パース構造により列カウントがずれない。

### 4-3. 日時処理

#### `parseGMTtoJST(str)`

Open DroneLog の `start_time` フィールドを `Date` オブジェクトに変換する。

- 入力例：`"2026-06-02 01:49:25.901+00"`
- 正規化処理：
  1. スペース → `T`
  2. 末尾 `+00` → `+00:00`
  3. `+00:00` → `Z`
- `new Date(s)` で UTC として解釈し、表示時に JST（`Asia/Tokyo`）へ変換

#### `formatDate(d)`

`d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })`

#### `formatTime(d)`

`d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' })`

#### `formatDuration(secs)`

- 分 = `Math.floor(secs / 60)`
- 秒 = `Math.round(secs % 60)`
- 出力：秒が 0 より大きければ `N分M秒`、そうでなければ `N分`

#### `addSeconds(d, secs)`

`new Date(d.getTime() + secs * 1000)` で着陸時刻を算出。

### 4-4. CSV 解析・レコード生成（`processCSV`）

1. `parseCSV` でテキストを 2 次元配列に変換
2. 1 行目をヘッダーとして `metadata` 列のインデックスを検出（見つからない場合はエラー）
3. 2 行目以降を走査し、`metadata` セルが空でない行を処理対象とする
4. `metadata` セルを `JSON.parse` で解析（失敗した行はスキップ）
5. 各フィールドを下表の優先順位で取得

**フィールドマッピング**

| 表示項目 | 参照フィールド（優先順） |
|---|---|
| ドローン名 | `aircraft_name` → `drone_name` → `aircraft` |
| 離陸時刻（UTC） | `start_time` |
| 飛行時間 | `duration_secs`（秒） |
| 最大高度 | `max_altitude_m` → `max_altitude` → `maxAltitude` → `altitude_max` |
| 最大速度 | `max_speed_ms`（m/s → × 3.6 で km/h 変換）→ `max_speed` → `maxSpeed` |
| 緯度 | `home_lat` → `takeoff_lat` → `start_lat` |
| 経度 | `home_lon` → `takeoff_lon` → `start_lon` |

6. 生成したレコードを `flightData` 配列に追加（累積。クリアするまで保持）
7. `renderTable()` を呼び出して即時表示
8. 逆ジオコーディングを非同期で実行し、完了ごとに `renderTable()` で更新

### 4-5. 逆ジオコーディング（`reverseGeocode`）

- API：OpenStreetMap Nominatim
- エンドポイント：`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}&accept-language=ja`
- リクエストヘッダー：`User-Agent: DroneLogAnalyzer/1.0`
- 結果の整形：`address` オブジェクトから `state/city/suburb/road` の順で取得し、スペース区切りで結合
- エラー時・取得失敗時：`"{lat}, {lon}"` を返す

### 4-6. TSV コピー（`btn-copy`）

ヘッダー行＋全レコードをタブ区切りテキストに変換して `navigator.clipboard.writeText()` でコピー。

```
列順：日付 / ドローン名 / 離陸時刻 / 着陸時刻 / 飛行時間 / 最大高度(m) / 最大速度(km/h) / 離着陸場所
```

### 4-7. PWA インストール

- `beforeinstallprompt` イベントを捕捉して `deferredPrompt` に保存
- インストールバナーを表示
- 「インストール」ボタン押下で `deferredPrompt.prompt()` を呼び出し
- 承認後はバナーを非表示にし `deferredPrompt` をクリア

### 4-8. Service Worker 登録

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
```

---

## 5. manifest.json

| フィールド | 値 |
|---|---|
| `name` | DJI 飛行記録 for Open DroneLog CSV |
| `short_name` | ドローンログ |
| `start_url` | `./index.html` |
| `display` | `standalone` |
| `background_color` | `#f0f4f8` |
| `theme_color` | `#f0f4f8` |
| `orientation` | `any` |
| `lang` | `ja` |
| `icons` | `icon-192.png`（192×192）、`icon-512.png`（512×512）、purpose: `any maskable` |
| `shortcuts` | ファイルを開く → `./index.html` |

---

## 6. sw.js（Service Worker）

### キャッシュ戦略

- キャッシュ名：`drone-log-v2`（バージョンアップ時は名前を変更）
- インストール時にキャッシュするアセット：
  - `./`
  - `./index.html`
  - `./manifest.json`
  - `./icon-192.png`
  - `./icon-512.png`
- アクティベート時：旧バージョンのキャッシュを削除し `clients.claim()` で即時制御
- フェッチ時：**キャッシュファースト**。未キャッシュのリソースはネットワーク取得後にキャッシュへ追加
- Nominatim（`nominatim.openstreetmap.org`）へのリクエストは**ネットワークのみ**（キャッシュ対象外）

---

## 7. アイコン仕様（icon-192.png / icon-512.png）

Pillow（Python）でプログラム生成。サイズに応じてすべての値をスケーリング。

### デザイン要素

| 要素 | 内容 |
|---|---|
| 背景 | 空をイメージした青グラデーション円（`rgb(15,120,230)` → `rgb(55,175,255)`） |
| アーム | 中央から 45° 方向に伸びる 4 本の白い線 |
| モーターポッド | アーム先端の白い円（プロペラ 2 枚を十字線で表現） |
| ボディ | 中央の白い角丸矩形 |
| カメラジンバル | ボディ下部に接続された青い円（レンズ＋ハイライト） |
| 電波アーク | 上部に 3 本の同心弧（不透明度を段階的に変化） |

---

## 8. 対応 CSV フォーマット（Open DroneLog v3）

### ファイル構成

- 1 行目：37 列のヘッダー行（最終列が `metadata`）
- 2 行目：`metadata` セルに JSON を持つ最初のテレメトリ行
- 3 行目以降：`metadata` セルが空のテレメトリサンプル行（11,000 行超）

### metadata JSON の主要フィールド

| フィールド | 型 | 内容 |
|---|---|---|
| `aircraft_name` | string | ドローン名（例：`DJI Mini 4 Pro`） |
| `start_time` | string | UTC 離陸時刻（例：`2026-06-02 01:49:25.901+00`） |
| `duration_secs` | number | 飛行時間（秒、小数あり） |
| `max_altitude_m` | number | 最大高度（メートル） |
| `max_speed_ms` | number | 最大速度（m/s） |
| `home_lat` | number | 離陸地点の緯度 |
| `home_lon` | number | 離陸地点の経度 |

### 注意事項

- `messages` 列には `""` エスケープされたダブルクォートを含む JSON 配列が入っており、単純な行分割＋列分割の 2 段階パーサーでは列カウントがずれる。必ず 1 パース実装を使用すること。
- `max_speed_ms` の単位は **m/s** であり、表示時に × 3.6 で km/h に変換する。

---

## 9. 動作環境・配置要件

- **HTTPS サーバー必須**（Service Worker の登録に必要）
- 推奨ホスティング：GitHub Pages、Netlify、Vercel 等
- ローカル確認：`npx serve .` または `python3 -m http.server 8080`
- ブラウザ：Chromium 系（PWA インストール対応）、Safari（iOS PWA 対応）、Firefox
