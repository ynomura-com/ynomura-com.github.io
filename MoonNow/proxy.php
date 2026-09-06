<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$apiUrl = 'https://svs.gsfc.nasa.gov/api/dialamoon/';

// NASAのAPIからデータを取得
$response = file_get_contents($apiUrl);

if ($response === FALSE) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch data from NASA API']);
    exit;
}

echo $response;
?>