document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        const csvFileName = Object.keys(zipContent.files).find(name => name.toLowerCase().endsWith('.csv'));
        
        if (!csvFileName) throw new Error("ZIPファイル内にCSVが見つかりません");

        const csvText = await zipContent.files[csvFileName].async("string");
        await processCsv(csvText);

    } catch (err) {
        console.error("Fatal Error:", err);
        alert("エラー: " + err.message);
    }
    e.target.value = ''; 
});

/**
 * 逆ジオコーディング (OpenStreetMap Nominatim API)
 * ユーザー様提供の最適化された住所抽出ロジックを採用
 */
async function getAddress(lat, lon) {
    if (!lat || !lon || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
        return "GPS未取得";
    }

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ja`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        
        if (data && data.address) {
            const a = data.address;
            // 日本の住所体系に合わせた並び（郡や丁目・街区を追加）
            const parts = [
                a.province || a.prefecture || "",
                a.county || "",
                a.city || a.town || a.village || a.suburb || "",
                a.quarter || a.neighbourhood || a.road || ""
            ];
            const joined = parts.join("").trim();
            return joined || data.display_name.split(',')[0];
        }
        return `座標(${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    } catch (err) {
        return `座標(${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    }
}

/**
 * Safari対応の日付解析
 */
function parseGmtDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return new Date(NaN);
    const dParts = dateStr.split('/');
    const tParts = timeStr.trim().split(/[:\s]+/);
    if (dParts.length !== 3 || tParts.length < 4) return new Date(NaN);

    const month = parseInt(dParts[0], 10) - 1;
    const day = parseInt(dParts[1], 10);
    const year = parseInt(dParts[2], 10);
    let hour = parseInt(tParts[0], 10);
    const minute = parseInt(tParts[1], 10);
    const secParts = tParts[2].split('.');
    const second = parseInt(secParts[0], 10);
    const ms = secParts[1] ? parseFloat("0." + secParts[1]) * 1000 : 0;
    const ampm = tParts[3].toUpperCase();

    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    return new Date(Date.UTC(year, month, day, hour, minute, second, ms));
}

async function processCsv(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 3) throw new Error("CSVのデータ行が足りません");

    const headers = parseCsvLine(lines[1]);
    const firstDataLine = parseCsvLine(lines[2]);           
    const lastDataLine = parseCsvLine(lines[lines.length - 1]); 

    const getIdx = (name) => headers.findIndex(h => h.trim() === name);

    const idxDate = getIdx('CUSTOM.date [local]');
    const idxTime = getIdx('CUSTOM.updateTime [local]');
    const idxFlyTime = getIdx('OSD.flyTime');
    const idxHeight = getIdx('OSD.heightMax [ft]');
    const idxHSpeed = getIdx('OSD.hSpeedMax [MPH]');
    const idxName = getIdx('RECOVER.aircraftName');
    const idxLat = getIdx('OSD.latitude');
    const idxLon = getIdx('OSD.longitude');

    // 1. 離陸時刻
    const takeoffGmt = parseGmtDateTime(firstDataLine[idxDate], firstDataLine[idxTime]);
    if (isNaN(takeoffGmt.getTime())) throw new Error("離陸時刻の解析に失敗しました");

    // 2. 離陸座標の決定 (0の場合は以降を検索)
    let tLat = parseFloat(firstDataLine[idxLat]);
    let tLon = parseFloat(firstDataLine[idxLon]);
    if (!tLat || !tLon || (tLat === 0 && tLon === 0)) {
        for (let i = 3; i < Math.min(lines.length, 100); i++) {
            const nextLine = parseCsvLine(lines[i]);
            const nextLat = parseFloat(nextLine[idxLat]);
            const nextLon = parseFloat(nextLine[idxLon]);
            if (nextLat && nextLon && nextLat !== 0) {
                tLat = nextLat; tLon = nextLon;
                break;
            }
        }
    }

    // 3. 着陸座標の決定
    let lLat = parseFloat(lastDataLine[idxLat]);
    let lLon = parseFloat(lastDataLine[idxLon]);

    // 4. 住所の取得 (並列実行)
    const [takeoffLocation, landingLocation] = await Promise.all([
        getAddress(tLat, tLon),
        getAddress(lLat, lLon)
    ]);

    // 5. 飛行時間の解析と着陸時刻の計算
    const flyTimeStr = lastDataLine[idxFlyTime] || "0m 0.0s"; 
    const timeMatch = flyTimeStr.match(/(\d+)m\s*(\d+\.\d+)s/);
    let totalSeconds = 0;
    if (timeMatch) {
        totalSeconds = (parseInt(timeMatch[1], 10) * 60) + parseFloat(timeMatch[2]);
    }
    const landingGmt = new Date(takeoffGmt.getTime() + totalSeconds * 1000);

    const formatDate = (date) => date.toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo", year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const formatTime = (date) => date.toLocaleTimeString("ja-JP", {
        timeZone: "Asia/Tokyo", hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const rowData = {
        date: formatDate(takeoffGmt),
        name: lastDataLine[idxName] || "Unknown",
        takeoffTime: formatTime(takeoffGmt),
        landingTime: formatTime(landingGmt),
        flyTime: flyTimeStr,
        height: (parseFloat(lastDataLine[idxHeight] || 0) * 0.3048).toFixed(1),
        speed: (parseFloat(lastDataLine[idxHSpeed] || 0) * 1.60934).toFixed(2),
        takeoffLocation: takeoffLocation,
        landingLocation: landingLocation
    };

    renderRow(rowData);
}

function renderRow(data) {
    const resultBody = document.getElementById('resultBody');
    const noDataRow = resultBody.querySelector('.no-data-row');
    if (noDataRow) noDataRow.remove();

    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td>${data.date}</td>
        <td>${data.name}</td>
        <td>${data.takeoffTime}</td>
        <td>${data.landingTime}</td>
        <td>${data.flyTime}</td>
        <td>${data.height}</td>
        <td>${data.speed}</td>
        <td>${data.takeoffLocation}</td>
        <td>${data.landingLocation}</td>
    `;
    resultBody.appendChild(newRow);
}

function copyToTsv() {
    const table = document.getElementById('resultTable');
    if (!table || document.querySelector('.no-data-row')) {
        alert("コピーするデータがありません");
        return;
    }
    const rows = Array.from(table.querySelectorAll('tr'));
    const tsvContent = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => cell.innerText).join('\t');
    }).join('\n');
    navigator.clipboard.writeText(tsvContent).then(() => alert("TSV形式でコピーしました。"));
}

function clearTable() {
    if (!confirm("表示されているデータをすべて削除しますか？")) return;
    const resultBody = document.getElementById('resultBody');
    resultBody.innerHTML = '<tr class="no-data-row"><td colspan="9" class="no-data">データがありません。</td></tr>';
}

function parseCsvLine(line) {
    if (!line) return [];
    return line.split(',').map(item => item.replace(/^["']|["']$/g, '').trim());
}
