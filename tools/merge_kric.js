#!/usr/bin/env node

// 레일포털·서울 열린데이터에서 받은 시간표로 data/trips.js를 만드는 스크립트입니다.
// 실행: node tools/merge_kric.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'tools', 'kric_out', 'kric_timetable.json.gz');
const SEOUL_LINE2_INPUT = path.join(ROOT, 'tools', 'kric_out', 'seoul_line2.json.gz');
const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'trips.js');
const INPUT = path.resolve(process.argv[2] || DEFAULT_INPUT);
const OUTPUT = path.resolve(process.argv[3] || DEFAULT_OUTPUT);

const DAY_TYPES = {
    '8': 'weekday',
    '9': 'holiday'
};

const STATION_NAMES = {
    '서울': '서울역',
    '서울역': '서울역',
    '홍대입': '홍대입구',
    '홍대입구': '홍대입구',
    '신도림': '신도림',
    '온수(성공회대입구)': '온수',
    '온수': '온수',
    '가산디': '가산디지털단지',
    '가산디지털단지': '가산디지털단지',
    '하남검단산역': '하남검단산',
    '암사역사공원': '암사역사공원'
};
const KRIC_LINES = {
    '1': '1호선',
    '2': '2호선',
    '3': '3호선',
    '4': '4호선',
    '5': '5호선',
    '6': '6호선',
    '7': '7호선',
    '8': '8호선',
    '9': '9호선',
    A1: '공항철도',
    K4: '경의중앙선',
    K1: '수인분당선'
};
// 운영 회사가 달라도 같은 열차번호로 이어 달리는 노선 (회사 구분 없이 열차 하나로 묶음)
const THROUGH_LINES = ['1호선', '3호선', '4호선', '7호선', '8호선'];
// 한 열차가 같은 역에 두 번 서는 순환 노선
const LOOP_LINES = ['2호선', '6호선'];
// 이름은 같지만 실제로는 떨어져 있어 갈아탈 수 없는 역 (노선 이름을 붙여 구분)
const SEPARATE_STATIONS = {
    경의중앙선: { 신촌: '신촌(경의중앙선)', 양평: '양평(경의중앙선)' }
};

// 같은 이름의 다른 역을 노선별 이름으로 바꿉니다.
function renameSeparateStations(trip) {
    const renames = SEPARATE_STATIONS[trip.line];
    if (!renames) return trip;
    return {
        ...trip,
        stops: trip.stops.map(([station, minute]) => [renames[station] || station, minute])
    };
}

function readInput(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`입력 파일이 없습니다: ${filePath}\n먼저 python3 tools/fetch_kric.py를 실행해 주세요.`);
    }

    const compressed = fs.readFileSync(filePath);
    const text = zlib.gunzipSync(compressed).toString('utf8');
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('kric_timetable.json.gz의 최상위 값은 객체여야 합니다.');
    }
    return data;
}

function readOptionalInput(filePath) {
    if (!fs.existsSync(filePath)) return null;

    const compressed = fs.readFileSync(filePath);
    const text = zlib.gunzipSync(compressed).toString('utf8');
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`${filePath}의 최상위 값은 객체여야 합니다.`);
    }
    return data;
}

function toMinutes(value) {
    const text = String(value || '').trim();
    if (!/^(?:\d{2}:){2}\d{2}$/.test(text) && !/^\d{6}$/.test(text)) return null;

    const compact = text.replaceAll(':', '');
    const hours = Number(compact.slice(0, 2));
    const minutes = Number(compact.slice(2, 4));
    const seconds = Number(compact.slice(4, 6));
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return hours * 60 + minutes;
}

function normalizeStationName(name) {
    const text = String(name || '').trim();
    return STATION_NAMES[text] || text.replace(/\([^)]*\)$/g, '').trim();
}

function addStop(group, stationName, row) {
    if (!Array.isArray(row) || row.length < 3) return;
    const minute = toMinutes(row[2]) ?? toMinutes(row[1]);
    if (minute === null) return;
    const station = normalizeStationName(stationName);
    // 같은 역이 두 번 나오면 첫 번째만 씀 (2호선 순환, 6호선 응암 순환은 같은 역에 다시 서므로 제외)
    if (!LOOP_LINES.includes(group.line) && group.stops.some((stop) => stop.station === station)) return;

    group.stops.push({
        station,
        minute
    });
}

function orderStops(stops) {
    const sorted = [...stops].sort((a, b) => a.minute - b.minute);
    if (sorted.length < 2) return sorted;

    let largestGap = -1;
    let splitIndex = 0;
    for (let i = 0; i < sorted.length; i += 1) {
        const next = sorted[(i + 1) % sorted.length];
        const gap = i === sorted.length - 1
            ? next.minute + 1440 - sorted[i].minute
            : next.minute - sorted[i].minute;
        if (gap > largestGap) {
            largestGap = gap;
            splitIndex = (i + 1) % sorted.length;
        }
    }

    const ordered = [];
    let previous = null;
    for (let i = 0; i < sorted.length; i += 1) {
        const stop = sorted[(splitIndex + i) % sorted.length];
        let minute = stop.minute;
        if (previous !== null && minute < previous) minute += 1440;
        ordered.push([stop.station, minute]);
        previous = minute;
    }
    return ordered;
}

function buildTrips(rawData) {
    const groups = new Map();

    for (const [key, stationData] of Object.entries(rawData)) {
        const [dayCode, operator, lineCode] = key.split('|');
        const dayType = DAY_TYPES[dayCode];
        if (!dayType || !stationData || !Object.prototype.hasOwnProperty.call(KRIC_LINES, lineCode)) continue;

        const line = KRIC_LINES[lineCode];
        if (stationData.line && stationData.line !== line && !(lineCode === 'K1' && stationData.line === '수인분당')) {
            continue;
        }

        for (const row of stationData.rows || []) {
            const trainNo = row && row[0];
            if (!trainNo) continue;

            const groupKey = THROUGH_LINES.includes(line)
                ? `${dayType}|${line}|${trainNo}`
                : `${dayType}|${operator}|${line}|${trainNo}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    dayType,
                    line,
                    no: String(trainNo),
                    stops: []
                });
            }
            addStop(groups.get(groupKey), stationData.name, row);
        }
    }

    const result = { weekday: [], holiday: [] };
    for (const group of groups.values()) {
        const stops = orderStops(group.stops);
        if (stops.length < 2) continue;
        result[group.dayType].push({
            no: group.no,
            line: group.line,
            stops
        });
    }

    for (const dayType of Object.keys(result)) {
        result[dayType].sort((a, b) => {
            if (a.line !== b.line) return a.line.localeCompare(b.line, 'ko');
            return a.stops[0][1] - b.stops[0][1];
        });
    }
    return result;
}

function buildSeoulLine2WeekendTrips(rawData) {
    const groups = new Map();
    for (const [key, rows] of Object.entries(rawData || {})) {
        const [dayName, direction] = key.split('|');
        if (dayName !== '주말' || !['내선', '외선'].includes(direction)) continue;

        for (const row of rows || []) {
            const trainNo = row && row.trainno;
            const minute = toMinutes(row && (row.trainDptreTm || row.trainArvlTm));
            if (!trainNo || minute === null || !row.stnNm) continue;

            const groupKey = `${direction}|${trainNo}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    no: String(trainNo),
                    line: '2호선',
                    stops: []
                });
            }
            groups.get(groupKey).stops.push({
                station: normalizeStationName(row.stnNm),
                minute
            });
        }
    }

    const trips = [];
    for (const group of groups.values()) {
        const stops = orderStops(group.stops);
        if (stops.length >= 2) trips.push({
            no: group.no,
            line: group.line,
            stops
        });
    }
    trips.sort((a, b) => a.stops[0][1] - b.stops[0][1] || a.no.localeCompare(b.no));
    return trips;
}

function writeTrips(kricTrips, seoulLine2Trips, filePath) {
    const merged = { weekday: [...kricTrips.weekday], holiday: [] };
    merged.holiday.push(
        ...kricTrips.holiday.filter((trip) => trip.line !== '2호선'),
        ...seoulLine2Trips,
    );
    merged.weekday = merged.weekday.map(renameSeparateStations);
    merged.holiday = merged.holiday.map(renameSeparateStations);

    const header = [
        '// 열차별 정차 시각 데이터 (열차 추천·환승 계산용)',
        '// 레일포털 열차 시각표와 서울 열린데이터(2호선 주말)를 합친 파일입니다.',
        '// 모양: TRIPS[weekday|holiday] = [{ no: 열차번호, line: 노선, stops: [[역 이름, 분], ...] }, ...]',
        '// - 분은 자정부터의 분. 자정을 넘긴 열차는 1440 이상으로 이어서 적습니다.',
        '// - 토요일·일요일·공휴일은 holiday 사용합니다.',
        '// - 이 파일은 tools/merge_kric.js로 만듭니다. 직접 고치지 마세요.',
        ''
    ].join('\n');
    fs.writeFileSync(
        filePath,
        `${header}const TRIPS = ${JSON.stringify(merged)};\n`,
        'utf8'
    );
    return merged;
}

function findDuplicateStations(trips) {
    return trips
        .map((trip) => {
            const counts = new Map();
            trip.stops.forEach(([station]) => counts.set(station, (counts.get(station) || 0) + 1));
            const duplicates = [...counts.entries()]
                .filter(([, count]) => count > 1)
                .map(([station, count]) => `${station}(${count})`);
            return duplicates.length > 0 ? `${trip.line} ${trip.no}: ${duplicates.join(', ')}` : null;
        })
        .filter(Boolean);
}

function printLineCounts(trips) {
    const counts = new Map();
    trips.forEach((trip) => counts.set(trip.line, (counts.get(trip.line) || 0) + 1));
    [...counts.entries()]
        .sort(([first], [second]) => first.localeCompare(second, 'ko'))
        .forEach(([line, count]) => console.log(`  ${line}: ${count}개`));
}

function main() {
    const rawData = readInput(INPUT);
    const seoulLine2Data = readOptionalInput(SEOUL_LINE2_INPUT);
    const kricTrips = buildTrips(rawData);
    const seoulLine2Trips = buildSeoulLine2WeekendTrips(seoulLine2Data);
    const merged = writeTrips(kricTrips, seoulLine2Trips, OUTPUT);

    console.log(`완료: ${OUTPUT}`);
    console.log(`추가한 열차: 평일 ${kricTrips.weekday.length}개, 휴일 ${kricTrips.holiday.length - kricTrips.holiday.filter((trip) => trip.line === '2호선').length + seoulLine2Trips.length}개`);
    console.log(`2호선 서울 열린데이터 휴일 열차: ${seoulLine2Trips.length}개`);
    console.log(`전체 열차: 평일 ${merged.weekday.length}개, 휴일 ${merged.holiday.length}개`);
    console.log('노선별 열차 수 (weekday):');
    printLineCounts(merged.weekday);
    console.log('노선별 열차 수 (holiday):');
    printLineCounts(merged.holiday);
    for (const dayType of ['weekday', 'holiday']) {
        const duplicates = findDuplicateStations(kricTrips[dayType]);
        console.log(`${dayType} 2·7호선 중복 역 열차: ${duplicates.length}개`);
        duplicates.slice(0, 10).forEach((item) => console.log(`  ${item}`));
        if (duplicates.length > 10) console.log(`  ... 외 ${duplicates.length - 10}개`);
    }
}

try {
    main();
} catch (error) {
    console.error(`병합 실패: ${error.message}`);
    process.exitCode = 1;
}
