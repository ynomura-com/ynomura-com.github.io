import { 
  parseCSV, 
  extractMetadataFromText,
  normalizeMetadata,
  convertGMTToJST, 
  formatDateJST, 
  formatTimeJST, 
  formatDuration, 
  convertSpeedMSToKmh, 
  fetchAddressFromCoordinates 
} from "./utils.js";

// アプリのローカル状態（パースされた飛行ログ配列）
let currentLogs = [];

// DOM要素の参照を取得
const btnFileSelect = document.getElementById('btn-file-select');
const csvFileInput = document.getElementById('csv-file-input');
const btnCopyTsv = document.getElementById('btn-copy-tsv');
const btnClearContent = document.getElementById('btn-clear-content');
const loadingSpinner = document.getElementById('loading-spinner');
const logTableBody = document.getElementById('log-table-body');
const logTableFooter = document.getElementById('log-table-footer');
const logCountText = document.getElementById('log-count-text');
const statusBannerContainer = document.getElementById('status-banner-container');

// 統計（スタッツ）表示要素
const statFlightCount = document.getElementById('stat-flight-count');
const statTotalDuration = document.getElementById('stat-total-duration');
const statMaxAltitude = document.getElementById('stat-max-altitude');
const statMaxSpeed = document.getElementById('stat-max-speed');
const statPrimaryModel = document.getElementById('stat-primary-model');

// 状態バナーのレンダリング
function showStatusBanner(type, title, details) {
  statusBannerContainer.innerHTML = '';
  statusBannerContainer.className = 'w-full block';

  const isSuccess = type === 'success';
  const bgColor = isSuccess ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800';
  const iconColor = isSuccess ? 'text-emerald-600' : 'text-rose-600';
  const iconSvg = isSuccess 
    ? `<svg class="h-5 w-5 ${iconColor} mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
    : `<svg class="h-5 w-5 ${iconColor} mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;

  statusBannerContainer.innerHTML = `
    <div class="flex items-start space-x-3 p-4 ${bgColor} rounded-2xl border text-sm shadow-sm animate-fade-in animate-duration-150">
      ${iconSvg}
      <div class="flex-1">
        <p class="font-semibold">${title}</p>
        <p class="text-xs mt-0.5">${details}</p>
      </div>
      <button id="btn-close-banner" class="opacity-70 hover:opacity-100 font-bold text-xs px-2 py-1 bg-white rounded-lg border border-slate-100 cursor-pointer">
        閉じる
      </button>
    </div>
  `;

  // 閉じるボタンの挙動設定
  const btnCloseBanner = document.getElementById('btn-close-banner');
  if (btnCloseBanner) {
    btnCloseBanner.addEventListener('click', () => {
      statusBannerContainer.className = 'hidden';
    });
  }
}

// 読み込み中状態のトグル
function toggleLoading(isLoading) {
  if (isLoading) {
    loadingSpinner.classList.remove('hidden');
    btnSelectFileState(false);
  } else {
    loadingSpinner.classList.add('hidden');
    btnSelectFileState(true);
  }
}

function btnSelectFileState(active) {
  if (active) {
    btnFileSelect.disabled = false;
    btnFileSelect.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    btnFileSelect.disabled = true;
    btnFileSelect.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

// 統計（スタッツ）の計算と画面反映
function calculateAndShowStats() {
  if (currentLogs.length === 0) {
    statFlightCount.textContent = "0";
    statTotalDuration.textContent = "0秒";
    statMaxAltitude.textContent = "0.0";
    statMaxSpeed.textContent = "0.0";
    statPrimaryModel.textContent = "なし";
    return;
  }

  // 1. 飛行回数
  statFlightCount.textContent = currentLogs.length.toString();

  // 2. 総飛行時間、最大高度、最大速度の計算
  let totalSecs = 0;
  let maxAlt = 0;
  let maxSpd = 0;
  const droneModelsMap = {};

  currentLogs.forEach(log => {
    const match = log.flightTime.match(/(\d+)分(\d+)秒/);
    if (match) {
      totalSecs += (parseInt(match[1]) * 60) + parseInt(match[2]);
    } else {
      const sMatch = log.flightTime.match(/(\d+)秒/);
      if (sMatch) totalSecs += parseInt(sMatch[1]);
    }

    const altNum = parseFloat(log.maxAltitude.replace(/[^\d.]/g, ''));
    if (!isNaN(altNum) && altNum > maxAlt) {
      maxAlt = altNum;
    }

    const spdNum = parseFloat(log.maxSpeed);
    if (!isNaN(spdNum) && spdNum > maxSpd) {
      maxSpd = spdNum;
    }

    const model = log.droneName || "不明なドローン";
    droneModelsMap[model] = (droneModelsMap[model] || 0) + 1;
  });

  if (totalSecs >= 3600) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    statTotalDuration.textContent = `${h}時間${m}分${s}秒`;
  } else if (totalSecs >= 60) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    statTotalDuration.textContent = `${m}分${s}秒`;
  } else {
    statTotalDuration.textContent = `${totalSecs}秒`;
  }

  statMaxAltitude.textContent = maxAlt.toFixed(1);
  statMaxSpeed.textContent = maxSpd.toFixed(1);

  let bestModel = "不明";
  let maxCount = 0;
  for (const m in droneModelsMap) {
    if (droneModelsMap[m] > maxCount) {
      maxCount = droneModelsMap[m];
      bestModel = m;
    }
  }
  statPrimaryModel.textContent = bestModel;
}

// テーブル更新
function updateTableDOM() {
  logTableBody.innerHTML = '';

  if (currentLogs.length === 0) {
    logTableBody.innerHTML = `
      <tr id="empty-placeholder">
        <td colspan="7" class="py-16 text-center text-slate-400 font-normal">
          <div class="flex flex-col items-center justify-center space-y-3">
            <span class="text-4xl select-none">📂</span>
            <p class="text-sm text-slate-500">表示するデータがありません。上のエリアにCSVをアップロードしてください。</p>
          </div>
        </td>
      </tr>
    `;

    logTableFooter.classList.add('hidden');
    btnCopyTsv.disabled = true;
    btnCopyTsv.className = "flex items-center justify-center space-x-1 px-3 py-2 bg-slate-100 text-slate-400 cursor-not-allowed text-xs font-semibold rounded-xl transition duration-150 select-none border border-slate-100/70";
    btnClearContent.disabled = true;
    btnClearContent.className = "flex items-center justify-center space-x-1 px-3 py-2 bg-rose-50/55 text-rose-400 cursor-not-allowed text-xs font-semibold rounded-xl transition duration-150 select-none border border-rose-100/30";
    
    calculateAndShowStats();
    return;
  }

  currentLogs.forEach((log) => {
    const row = document.createElement('tr');
    row.className = "hover:bg-slate-50/70 transition duration-150 group border-b border-slate-100";
    row.innerHTML = `
      <td class="py-4 px-5 font-bold text-slate-900 whitespace-nowrap">
        ${log.date}
      </td>
      <td class="py-4 px-5 text-slate-700 whitespace-nowrap font-semibold">
        <span class="inline-flex items-center px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg text-xs font-extrabold border border-sky-100">
          ${log.droneName}
        </span>
      </td>
      <td class="py-4 px-5 text-slate-600 whitespace-nowrap font-mono text-xs">
        <div class="flex flex-col">
          <span class="font-medium text-slate-700">離陸: ${log.takeoffTime}</span>
          <span class="text-slate-400 text-[11px] mt-0.5">着陸: ${log.landingTime}</span>
        </div>
      </td>
      <td class="py-4 px-5 text-slate-900 whitespace-nowrap font-bold">${log.flightTime}</td>
      <td class="py-4 px-5 text-slate-700 whitespace-nowrap font-mono text-center font-bold">
        ${log.maxAltitude}
      </td>
      <td class="py-4 px-5 text-slate-700 whitespace-nowrap font-mono text-center font-bold">
        ${log.maxSpeed} <span class="text-[10px] font-normal text-slate-400">km/h</span>
      </td>
      <td class="py-4 px-5 text-slate-600 text-xs">
        <div class="flex flex-col space-y-0.5">
          <span class="font-bold text-slate-800 leading-tight">
            ${log.landingLocation}
          </span>
          <span class="text-[10px] text-slate-400 font-mono tracking-tight">
            LAT: ${log.latitude.toFixed(6)} / LON: ${log.longitude.toFixed(6)}
          </span>
        </div>
      </td>
    `;
    logTableBody.appendChild(row);
  });

  logTableFooter.classList.remove('hidden');
  logCountText.textContent = `合計ログ数: ${currentLogs.length} 件`;

  btnCopyTsv.disabled = false;
  btnCopyTsv.className = "flex items-center justify-center space-x-1 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-xl transition duration-150 select-none border border-sky-200/50 cursor-pointer";
  btnClearContent.disabled = false;
  btnClearContent.className = "flex items-center justify-center space-x-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-xl transition duration-150 select-none border border-rose-200/50 cursor-pointer";

  calculateAndShowStats();
}

// ログ解析処理
async function processCSVText(text, filename) {
  toggleLoading(true);
  statusBannerContainer.className = 'hidden';

  try {
    let metadataList = [];

    try {
      metadataList = extractMetadataFromText(text, filename);
    } catch (err) {
      console.warn("Advanced nested metadata parse failed:", err);
    }

    if (metadataList.length === 0) {
      const parsed = parseCSV(text);
      if (parsed.length >= 2) {
        const headers = parsed[0];
        const metadataIndex = headers.findIndex(
          (h) => h.toLowerCase().trim() === "metadata"
        );

        if (metadataIndex !== -1) {
          for (let i = 1; i < parsed.length; i++) {
            const row = parsed[i];
            const metadataStr = row[metadataIndex];
            if (metadataStr && metadataStr.trim() !== '') {
              try {
                const metadataObj = normalizeMetadata(JSON.parse(metadataStr));
                metadataList.push(metadataObj);
              } catch {
                // スキップ
              }
            }
          }
        }
      }
    }

    if (metadataList.length === 0) {
      throw new Error("CSVから有効なドローンログは検出されませんでした。ファイル（経度lat/緯度lng）が破損しているか、Open DroneLog 形式ではありません。");
    }

    const tempResults = [];

    for (let i = 0; i < metadataList.length; i++) {
      const metadataObj = metadataList[i];
      const droneName = metadataObj.aircraft_name || "不明なドローン";
      const startTimeStr = metadataObj.start_time;
      const durationSecs = metadataObj.duration_secs || 0;
      const maxSpeedMs = metadataObj.max_speed_ms || 0;
      const maxAltitudeM = metadataObj.max_altitude_m || 0;
      const homeLat = metadataObj.home_lat || 0;
      const homeLon = metadataObj.home_lon || 0;

      if (!startTimeStr) {
        continue;
      }

      const takeoffDate = convertGMTToJST(startTimeStr);
      if (!takeoffDate) continue;

      const dateStr = formatDateJST(takeoffDate);
      const takeoffTimeStr = formatTimeJST(takeoffDate);
      const landingDate = new Date(takeoffDate.getTime() + durationSecs * 1000);
      const landingTimeStr = formatTimeJST(landingDate);
      const flightTimeStr = formatDuration(durationSecs);
      const speedKmhStr = convertSpeedMSToKmh(maxSpeedMs);
      const maxAltitudeStr = `${maxAltitudeM.toFixed(1)} m`;
      const id = `log_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;

      let address = "位置情報から取得不可";
      if (homeLat !== 0 && homeLon !== 0) {
        address = await fetchAddressFromCoordinates(homeLat, homeLon);
      }

      tempResults.push({
        id,
        date: dateStr,
        droneName,
        takeoffTime: takeoffTimeStr,
        landingTime: landingTimeStr,
        flightTime: flightTimeStr,
        maxAltitude: maxAltitudeStr,
        maxSpeed: speedKmhStr,
        landingLocation: address,
        latitude: homeLat,
        longitude: homeLon,
      });
    }

    if (tempResults.length === 0) {
      throw new Error("有効な飛行開始時刻(start_time)を持つレコードが見つかりませんでした。");
    }

    currentLogs = [...currentLogs, ...tempResults];
    updateTableDOM();

    showStatusBanner(
      'success', 
      'ログの解析と可視化に成功しました！', 
      `新たに ${tempResults.length} 件の飛行記録を追加・統合しました。`
    );

  } catch (err) {
    console.error(err);
    showStatusBanner(
      'error', 
      '解析中にエラーが発生しました', 
      err.message || 'CSVのフォーマット、またはJSONメタデータ抽出中にエラーが発生しました。'
    );
  } finally {
    toggleLoading(false);
  }
}

// ファイル読み込みハンドラー
function handleFileLoading(file) {
  toggleLoading(true);
  statusBannerContainer.className = 'hidden';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    if (text) {
      const hasMetadata = text.includes('format') && text.includes('start_time');
      
      if (!hasMetadata) {
        const sjisReader = new FileReader();
        sjisReader.onload = async (sjisEvent) => {
          const sjisText = sjisEvent.target.result;
          await processCSVText(sjisText, file.name);
        };
        sjisReader.onerror = () => {
          toggleLoading(false);
          showStatusBanner('error', '読み込みエラー', 'ファイルの読み込み中にエラーが発生しました。');
        };
        sjisReader.readAsText(file, "Shift-JIS");
      } else {
        await processCSVText(text, file.name);
      }
    } else {
      toggleLoading(false);
    }
  };
  reader.onerror = () => {
    toggleLoading(false);
    showStatusBanner('error', '読み込み失敗', 'ファイルの読み出しに失敗しました。');
  };
  reader.readAsText(file, "UTF-8");
}

// イベントリスニング
btnFileSelect.addEventListener('click', () => {
  csvFileInput.click();
});

csvFileInput.addEventListener('change', (e) => {
  const target = e.target;
  if (target.files && target.files.length > 0) {
    handleFileLoading(target.files[0]);
    target.value = '';
  }
});

btnClearContent.addEventListener('click', () => {
  currentLogs = [];
  updateTableDOM();
  statusBannerContainer.className = 'hidden';
});

btnCopyTsv.addEventListener('click', async () => {
  if (currentLogs.length === 0) return;

  const headers = [
    "日付",
    "ドローン名",
    "離陸時刻",
    "着陸時刻",
    "飛行時間",
    "最大高度 (m)",
    "最大速度 (Km/h)",
    "離着陸場所"
  ];

  const rows = currentLogs.map(log => [
    log.date,
    log.droneName,
    log.takeoffTime,
    log.landingTime,
    log.flightTime,
    log.maxAltitude,
    log.maxSpeed,
    log.landingLocation
  ]);

  const tsvText = [
    headers.join('\t'),
    ...rows.map(row => row.join('\t'))
  ].join('\n');

  try {
    await navigator.clipboard.writeText(tsvText);
    
    const origClass = btnCopyTsv.className;
    const origHtml = btnCopyTsv.innerHTML;
    
    btnCopyTsv.className = "flex items-center justify-center space-x-1 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl transition duration-150 select-none border border-emerald-500";
    btnCopyTsv.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>コピー完了しました！</span>
    `;

    setTimeout(() => {
      btnCopyTsv.className = origClass;
      btnCopyTsv.innerHTML = origHtml;
    }, 2000);

  } catch (err) {
    console.error(err);
    showStatusBanner('error', 'コピー失敗', 'クリップボードへのコピーに失敗しました。');
  }
});
