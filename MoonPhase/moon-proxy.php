<?php
/**
 * moon-proxy.php
 *
 * NASA Dial-A-Moon API へのサーバーサイド中継スクリプト。
 * ブラウザから直接 NASA のサーバーへ fetch するとCORS制限にかかるため、
 * 同一オリジン(ynomura.com)上のこのスクリプトを経由して取得する。
 *
 * このアプリでは「age」（月齢の数値）だけを使う。月の画像はNASAの画像を
 * 使わず、あらかじめ用意したローカル画像（30日分）から選んで表示するため、
 * 画像の中継は行わない。
 *
 * 使い方:
 *   /moon-proxy.php?stamp=2026-09-02T19:26
 *
 * "stamp" は "YYYY-MM-DDTHH:MM" 形式のUTC日時文字列。
 */

header('Content-Type: application/json; charset=utf-8');

// 誰でも呼び出せる公開エンドポイントとして悪用（任意のURLへの中継）されないよう、
// stamp の形式を厳密にチェックする。
$stamp = isset($_GET['stamp']) ? $_GET['stamp'] : '';

if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $stamp)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid stamp format. expected YYYY-MM-DDTHH:MM']);
    exit;
}

$nasaUrl = 'https://svs.gsfc.nasa.gov/api/dialamoon/' . $stamp;

$ch = curl_init($nasaUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_FOLLOWLOCATION => true,
    // 一部のサーバーはUser-Agentが無いリクエストを弾くことがあるため明示的に付与
    CURLOPT_HTTPHEADER     => [
        'User-Agent: MoonPhaseApp/1.0 (+https://ynomura.com)',
        'Accept: application/json',
    ],
]);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($body === false) {
    http_response_code(502);
    echo json_encode(['error' => 'upstream request failed', 'detail' => $curlErr]);
    exit;
}

if ($httpCode < 200 || $httpCode >= 300) {
    http_response_code(502);
    echo json_encode(['error' => 'upstream returned non-2xx', 'status' => $httpCode]);
    exit;
}

// NASA から取得した JSON をそのままブラウザへ返す
echo $body;


