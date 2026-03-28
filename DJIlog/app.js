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

    // 1. 離陸時刻 (3行目) を GMT として解析
    const takeoffGmt = new Date(`${firstDataLine[idxDate]} ${firstDataLine[idxTime]} GMT`);
    if (isNaN(takeoffGmt.getTime())) throw new Error("離陸時刻の解析に失敗しました");

    // 2. 飛行時間の解析と着陸時刻の計算
    const flyTimeStr = lastDataLine[idxFlyTime]; 
    const timeMatch = flyTimeStr.match(/(\d+)m\s*(\d+\.\d+)s/);
    let totalSeconds = 0;
    if (timeMatch) {
        totalSeconds = (parseInt(timeMatch[1]) * 60) + parseFloat(timeMatch[2]);
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
    // 列の順番を 日付 -> ドローン名 -> ... に修正
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
    return line.split(',').map(item => item.replace(/^["']|["']$/g, '').trim());
}
