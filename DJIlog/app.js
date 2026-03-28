document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        const csvFileName = Object.keys(zipContent.files).find(name => name.toLowerCase().endsWith('.csv'));
        
        if (!csvFileName) throw new Error("ZIPファイル内にCSVが見つかりません");

        const csvText = await zipContent.files[csvFileName].async("string");
        processCsv(csvText);

    } catch (err) {
        console.error(err);
        alert("エラー: " + err.message);
    }
    e.target.value = ''; 
});

/**
 * Safariでも動作する日付解析関数
 * @param {string} dateStr "m/d/y" 形式
 * @param {string} timeStr "h:m:s.s AM/PM" 形式
 * @returns {Date} UTCとしてのDateオブジェクト
 */
function parseGmtDateTime(dateStr, timeStr) {
    // 日付の分解 (m/d/y)
    const dParts = dateStr.split('/');
    if (dParts.length !== 3) return new Date(NaN);
    const month = parseInt(dParts[0], 10) - 1; // 0-11
    const day = parseInt(dParts[1], 10);
    const year = parseInt(dParts[2], 10);

    // 時刻の分解 (h:m:s.s AM/PM)
    // スペースやコロンで分割: ["h", "m", "s.s", "AM/PM"]
    const tParts = timeStr.trim().split(/[:\s]+/);
    if (tParts.length < 4) return new Date(NaN);

    let hour = parseInt(tParts[0], 10);
    const minute = parseInt(tParts[1], 10);
    const secParts = tParts[2].split('.'); // 秒とミリ秒を分ける
    const second = parseInt(secParts[0], 10);
    const ms = secParts[1] ? parseFloat("0." + secParts[1]) * 1000 : 0;
    const ampm = tParts[3].toUpperCase();

    // 12時間制を24時間制に変換
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    // Date.UTC を使うことでブラウザの時差設定に影響されずGMTとして生成
    return new Date(Date.UTC(year, month, day, hour, minute, second, ms));
}

function processCsv(text) {
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

    // --- 離陸時刻の解析 (Safari対応版) ---
    const takeoffGmt = parseGmtDateTime(firstDataLine[idxDate], firstDataLine[idxTime]);
    
    if (isNaN(takeoffGmt.getTime())) {
        throw new Error(`離陸時刻の解析に失敗しました。値をご確認ください:\n日付:${firstDataLine[idxDate]}\n時刻:${firstDataLine[idxTime]}`);
    }

    // 2. 飛行時間の解析と着陸時刻の計算
    const flyTimeStr = lastDataLine[idxFlyTime]; 
    const timeMatch = flyTimeStr.match(/(\d+)m\s*(\d+\.\d+)s/);
    let totalSeconds = 0;
    if (timeMatch) {
        totalSeconds = (parseInt(timeMatch[1], 10) * 60) + parseFloat(timeMatch[2]);
    }
    const landingGmt = new Date(takeoffGmt.getTime() + totalSeconds * 1000);

    // --- フォーマット関数 ---
    const formatDate = (date) => date.toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo", year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const formatTime = (date) => date.toLocaleTimeString("ja-JP", {
        timeZone: "Asia/Tokyo", hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // 3. 各種変換
    const heightFt = parseFloat(lastDataLine[idxHeight]) || 0;
    const heightM = (heightFt * 0.3048).toFixed(1);
    const speedMph = parseFloat(lastDataLine[idxHSpeed]) || 0;
    const speedKmh = (speedMph * 1.60934).toFixed(2);

    const rowData = {
        name: lastDataLine[idxName] || "Unknown",
        date: formatDate(takeoffGmt),
        takeoffTime: formatTime(takeoffGmt),
        landingTime: formatTime(landingGmt),
        flyTime: flyTimeStr,
        height: heightM,
        speed: speedKmh
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
    `;
    resultBody.appendChild(newRow);
}

function copyToTsv() {
    const table = document.getElementById('resultTable');
    if (document.querySelector('.no-data-row')) {
        alert("コピーするデータがありません");
        return;
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    const tsvContent = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => cell.innerText).join('\t');
    }).join('\n');

    navigator.clipboard.writeText(tsvContent).then(() => {
        alert("TSV形式でコピーしました。");
    }).catch(err => {
        alert("コピーに失敗しました: " + err);
    });
}

function clearTable() {
    if (!confirm("表示されているデータをすべて削除しますか？")) return;
    const resultBody = document.getElementById('resultBody');
    resultBody.innerHTML = '<tr class="no-data-row"><td colspan="7" class="no-data">データがありません。</td></tr>';
}

function parseCsvLine(line) {
    if (!line) return [];
    // カンマ区切り。引用符がある場合を考慮してトリム
    return line.split(',').map(item => item.replace(/^["']|["']$/g, '').trim());
}
