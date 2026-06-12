export function normalizeMetadata(raw) {
  if (!raw || typeof raw !== 'object') {
    return { aircraft_name: "不明なドローン" };
  }
  return {
    format: raw.format || "Open DroneLog CSV Export",
    app_version: raw.app_version || raw.appVersion || "unknown",
    exported_at: raw.exported_at || raw.exportedAt || null,
    display_name: raw.display_name || raw.displayName || null,
    drone_serial: raw.drone_serial || raw.droneSerial || raw.serial_number || raw.serialNumber || null,
    
    // ドローン機種名
    aircraft_name: raw.aircraft_name || raw.aircraftName || raw.drone_name || raw.droneName || raw.drone || raw.model || "不明なドローン",
    
    // 飛行開始時刻
    start_time: raw.start_time || raw.startTime || raw.takeoff_time || raw.takeoffTime || raw.date || raw.datetime || null,
    
    // 飛行時間 (秒)
    duration_secs: parseFloat(raw.duration_secs ?? raw.durationSecs ?? raw.duration ?? raw.flight_time ?? raw.flightTime ?? 0),
    
    max_altitude_m: parseFloat(raw.max_altitude_m ?? raw.maxAltitudeM ?? raw.max_altitude ?? raw.maxAltitude ?? raw.altitude ?? raw.max_height ?? raw.maxHeight ?? 0),
    max_speed_ms: parseFloat(raw.max_speed_ms ?? raw.maxSpeedMs ?? raw.max_speed ?? raw.maxSpeed ?? raw.speed ?? raw.max_velocity ?? 0),
    
    // 緯度経度
    home_lat: parseFloat(raw.home_lat ?? raw.homeLat ?? raw.home_latitude ?? raw.homeLatitude ?? raw.latitude ?? raw.lat ?? raw.gps_lat ?? 0),
    home_lon: parseFloat(raw.home_lon ?? raw.homeLon ?? raw.home_longitude ?? raw.homeLongitude ?? raw.longitude ?? raw.lon ?? raw.lng ?? raw.gps_lon ?? 0)
  };
}

/**
 * CSVに明示的なメタデータが含まれてない、または破損している場合、
 * 生のフライトデータ行(緯度・経度・高度・速度)からメタデータ情報を合成・算出する無敵フォールバック。
 */
export function tryParseFromDataRecords(text, filename) {
  try {
    const parsed = parseCSV(text);
    if (parsed.length < 2) return null;

    const headers = parsed[0].map(h => h.toLowerCase().trim());
    
    // 緯度・経度・高度・速度・時間に対応するカラム位置を強固に特定
    const latIndex = headers.findIndex(h => h === "lat" || h === "latitude" || h.includes("home_lat") || h === "g_lat" || h === "gps_lat");
    const lngIndex = headers.findIndex(h => h === "lng" || h === "lon" || h === "longitude" || h.includes("home_lon") || h === "g_lng" || h === "gps_lon" || h === "gps_lng");
    const altIndex = headers.findIndex(h => h === "alt" || h === "alt_m" || h === "altitude" || h === "height" || h === "height_m" || h.includes("altitude_m"));
    const speedIndex = headers.findIndex(h => h === "speed" || h === "speed_kmh" || h === "speed_ms" || h.includes("velocity") || h.includes("speed"));
    const timeIndex = headers.findIndex(h => h === "time" || h === "time_s" || h === "timestamp" || h === "seconds" || h === "offset_time");

    // 緯度・経度の列さえ見つかれば、一括可視化可能
    if (latIndex === -1 || lngIndex === -1) {
      return null;
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    let maxAlt = 0;
    let maxSpeed = 0;
    let homeLat = 0;
    let homeLon = 0;

    // データ行の探索
    for (let i = 1; i < parsed.length; i++) {
      const row = parsed[i];
      if (row.length <= Math.max(latIndex, lngIndex)) continue;

      // 最初の有効なGPS座標をホーム位置とする
      const lat = parseFloat(row[latIndex]);
      const lon = parseFloat(row[lngIndex]);
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        if (homeLat === 0 && homeLon === 0) {
          homeLat = lat;
          homeLon = lon;
        }
      }

      // 時間 (秒)
      if (timeIndex !== -1 && row[timeIndex]) {
        const t = parseFloat(row[timeIndex]);
        if (!isNaN(t)) {
          if (t < minTime) minTime = t;
          if (t > maxTime) maxTime = t;
        }
      }

      // 高度
      if (altIndex !== -1 && row[altIndex]) {
        const alt = parseFloat(row[altIndex]);
        if (!isNaN(alt) && alt > maxAlt) {
          maxAlt = alt;
        }
      }

      // 最高速度
      if (speedIndex !== -1 && row[speedIndex]) {
        let speed = parseFloat(row[speedIndex]);
        if (!isNaN(speed)) {
          // メタグリッドの max_speed_ms は m/s 単位にするため、
          // ヘッダーに kmh や km/h が含まれる場合は m/s に戻して合わせる
          const headerName = headers[speedIndex];
          if (headerName.includes("kmh") || headerName.includes("km/h") || headerName.includes("km")) {
            speed = speed / 3.6;
          }
          if (speed > maxSpeed) {
            maxSpeed = speed;
          }
        }
      }
    }

    // 飛行時間の決定
    let duration = 0;
    if (maxTime > -Infinity && minTime < Infinity) {
      duration = maxTime - minTime;
    } else {
      // ログの間隔を 0.1秒(=10Hz) と仮定して総飛行時間を概算
      duration = (parsed.length - 1) * 0.1;
    }

    if (duration <= 0 || isNaN(duration)) {
      duration = 60; // 最底1分
    }

    // ファイル名から日付 (YYYY-MM-DD や YYYYMMDD ) と時間 (HH-MM-SS や HHMMSS) を特定する
    let inferredStartTime = null;
    if (filename) {
      const dateMatch = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{1,2})/);
      const timeMatch = filename.match(/(?:\[|_|T)(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
      
      if (dateMatch) {
        const y = dateMatch[1];
        const m = dateMatch[2];
        const d = dateMatch[3];
        let tStr = "12:00:00";
        if (timeMatch) {
          tStr = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
        }
        inferredStartTime = `${y}-${m}-${d} ${tStr}+00`;
      }
    }

    // なければ現在時刻
    if (!inferredStartTime) {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const d = String(now.getUTCDate()).padStart(2, "0");
      const hh = String(now.getUTCHours()).padStart(2, "0");
      const mm = String(now.getUTCMinutes()).padStart(2, "0");
      const ss = String(now.getUTCSeconds()).padStart(2, "0");
      inferredStartTime = `${y}-${m}-${d} ${hh}:${mm}:${ss}+00`;
    }

    let inferredAircraft = "DJI ドローン";
    if (filename) {
      const lowerFile = filename.toLowerCase();
      if (lowerFile.includes("neo")) inferredAircraft = "DJI Neo";
      else if (lowerFile.includes("mini3") || lowerFile.includes("mini 3")) inferredAircraft = "DJI Mini 3";
      else if (lowerFile.includes("mini4") || lowerFile.includes("mini 4")) inferredAircraft = "DJI Mini 4 Pro";
      else if (lowerFile.includes("mavic3") || lowerFile.includes("mavic 3")) inferredAircraft = "DJI Mavic 3";
      else if (lowerFile.includes("air3") || lowerFile.includes("air 3")) inferredAircraft = "DJI Air 3";
      else if (lowerFile.includes("avata")) inferredAircraft = "DJI Avata";
    }

    return {
      format: "Open DroneLog CSV Export (軌跡フォールバック解析)",
      app_version: "1.0.0",
      aircraft_name: inferredAircraft,
      start_time: inferredStartTime,
      duration_secs: duration,
      max_altitude_m: maxAlt,
      max_speed_ms: maxSpeed,
      home_lat: homeLat,
      home_lon: homeLon
    };

  } catch (error) {
    console.error("tryParseFromDataRecords processing error:", error);
    return null;
  }
}

/**
 * CSVテキストから metadata の JSON 文字列を直接抽出する超高速関数。
 */
export function extractMetadataFromText(text, filename) {
  const results = [];
  
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '{') {
      let braceCount = 1;
      let startIdx = i;
      let j = i + 1;
      let inString = false;
      let escape = false;

      while (j < text.length && braceCount > 0) {
        const c = text[j];
        if (escape) {
          escape = false;
        } else if (c === '\\') {
          escape = true;
        } else if (c === '"') {
          inString = !inString;
        } else if (!inString) {
          if (c === '{') {
            braceCount++;
          } else if (c === '}') {
            braceCount--;
          }
        }
        j++;
      }

      if (braceCount === 0) {
        let jsonCandidate = text.substring(startIdx, j);
        i = j - 1; // スキャン位置を更新

        // CSVエスケープされた "" などを置換
        if (jsonCandidate.includes('""')) {
          jsonCandidate = jsonCandidate.replace(/""/g, '"');
        }

        try {
          const parsed = JSON.parse(jsonCandidate);
          if (parsed && typeof parsed === 'object') {
            const hasFormat = parsed.format || typeof parsed.app_version === 'string';
            const hasStartTime = parsed.start_time || parsed.startTime || parsed.takeoff_time;
            const hasDrone = parsed.aircraft_name || parsed.droneName || parsed.aircraft || parsed.model;
            
            if (hasFormat || hasStartTime || hasDrone) {
              const normalized = normalizeMetadata(parsed);
              results.push(normalized);
            }
          }
        } catch (e) {
          // パース失敗した候補はスキップ
        }
      }
    }
    i++;
  }

  if (results.length === 0) {
    const dataInferred = tryParseFromDataRecords(text, filename);
    if (dataInferred) {
      results.push(dataInferred);
    }
  }

  return results;
}

/**
 * 簡易的で堅牢な RFC4180 準拠の CSV パース関数。
 */
export function parseCSV(text) {
  const result = [];
  let row = [];
  let col = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          col += '"';
          i++;
        } else {
          insideQuote = false;
        }
      } else {
        col += char;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
      } else if (char === ',') {
        row.push(col);
        col = "";
      } else if (char === '\r' || char === '\n') {
        row.push(col);
        col = "";
        if (row.length > 0 && row.some(cell => cell !== "")) {
          result.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        col += char;
      }
    }
  }

  if (col !== "" || row.length > 0) {
    row.push(col);
    if (row.some(cell => cell !== "")) {
      result.push(row);
    }
  }

  return result;
}

/**
 * GMT時刻文字列を JST の Date オブジェクトに変換
 */
export function convertGMTToJST(timeStr) {
  try {
    let normalized = timeStr.trim().replace(/\s+/, 'T');
    if (/[+-]\d{2}$/.test(normalized)) {
      normalized += ':00';
    }
    const date = new Date(normalized);
    if (isNaN(date.getTime())) {
      const fallbackDate = new Date(timeStr);
      if (isNaN(fallbackDate.getTime())) {
        return null;
      }
      return fallbackDate;
    }
    return date;
  } catch (error) {
    console.error("Date parse error:", error);
    return null;
  }
}

/**
 * 日本の日付表記にフォーマット
 */
export function formatDateJST(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 日本の時刻表記にフォーマット
 */
export function formatTimeJST(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * 飛行時間（秒数）を「m分s秒」の形式にフォーマット
 */
export function formatDuration(seconds) {
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}分${s}秒`;
}

/**
 * m/s から km/h に変換
 */
export function convertSpeedMSToKmh(speedMs) {
  const kmh = speedMs * 3.6;
  return kmh.toFixed(1);
}

/**
 * 逆ジオコーディング住所取得
 */
export async function fetchAddressFromCoordinates(lat, lon) {
  const apiUrl = "/api/geocode";

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.address || "位置情報から取得不可";
  } catch (error) {
    console.warn("API Geocoding failed, falling back to direct Nominatim...", error);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ja`;
      const directResponse = await fetch(url, {
        headers: {
          "Accept-Language": "ja,en;q=0.9"
        }
      });
      if (!directResponse.ok) {
        throw new Error(`Direct Nominatim error: ${directResponse.status}`);
      }
      const data = await directResponse.json();
      if (data && data.address) {
        const addr = data.address;
        const state = addr.state || addr.province || addr.region || "";
        const city = addr.city || addr.town || addr.village || addr.county || addr.city_district || "";
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
        const road = addr.road || "";
        const houseNumber = addr.house_number || "";

        let formatted = "";
        if (state) formatted += state;
        if (city && !formatted.includes(city)) formatted += city;
        if (suburb && !formatted.includes(suburb)) formatted += suburb;
        if (road && !formatted.includes(road)) {
          formatted += road;
        }
        if (houseNumber) {
          formatted += houseNumber;
        }

        if (formatted.trim() !== "") {
          return formatted.trim();
        } else if (data.display_name) {
          return data.display_name;
        }
      }
    } catch (fallbackError) {
      console.error("Direct fallback geocoding failed:", fallbackError);
    }
    return "位置情報から取得不可";
  }
}
