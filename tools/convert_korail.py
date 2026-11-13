#!/usr/bin/env python3
"""코레일 수도권 광역전철 열차시각표 엑셀(docs/data-source)을 data/trips.js로 바꾸는 스크립트.

실행: 프로젝트 폴더에서  python3 tools/convert_korail.py
필요: openpyxl  (없으면  python3 -m pip install openpyxl)

엑셀 시트 구조
- 1~4행: 조정안 / 시발역 / 종착역 / 열차번호
- 그 아래 역마다 2행: 역 이름이 있는 행 = 도착, 바로 다음 행 = 출발
- 열 하나 = 열차 하나
"""
import datetime
import json
import os

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "data-source")
OUT = os.path.join(ROOT, "data", "trips.js")

FILES = {
    "weekday": ["코레일_1호선_평일.xlsx", "코레일_경의중앙선_경춘선_서해선_평일.xlsx"],
    "holiday": ["코레일_1호선_휴일.xlsx", "코레일_경의중앙선_경춘선_서해선_휴일.xlsx"],
}

# 엑셀의 줄임말 역 이름 → 정식 이름 (환승역 이름이 노선끼리 같아야 환승이 연결됨)
RENAME = {
    "1동대": "동대문", "1양원": "양원", "1양정": "양정", "1종로": "종로3가", "1지청": "청량리",
    "가산디": "가산디지털단지", "금천구": "금천구청", "동두중": "동두천중앙", "디엠시": "디지털미디어시티",
    "부천종": "부천종합운동장", "서울": "서울역", "지하서": "서울역", "시흥능": "시흥능곡",
    "시흥대": "시흥대야", "시흥청": "시흥시청", "신소사": "소사", "신초지": "초지", "신김포": "김포공항",
    "신신천": "신천", "신신현": "신현", "쌍용나": "쌍용(나사렛대)", "온양온": "온양온천",
    "평지제": "평택지제", "평내호": "평내호평", "효창공": "효창공원앞", "홍대입": "홍대입구",
    "종로5": "종로5가", "성균관": "성균관대",
}


def to_minutes(value):
    """엑셀 칸의 시각을 자정 기준 분으로. 시각이 아니면 None"""
    if isinstance(value, (datetime.time, datetime.datetime)):
        return value.hour * 60 + value.minute
    if value is None:
        return None
    text = str(value).strip()
    if ":" in text:
        try:
            hour, minute = text.split(":")[:2]
            return int(hour) * 60 + int(minute)
        except ValueError:
            return None
    return None


def line_of(sheet_name):
    """시트 이름으로 노선 이름 정하기. ITX-청춘은 별도 요금이라 None(제외)"""
    if sheet_name.startswith("ITX청춘"):
        return None
    for prefix, line in [("경춘", "경춘선"), ("망우직결", "경춘선"), ("경의중앙", "경의중앙선"),
                         ("경의선", "경의중앙선"), ("서해", "서해선")]:
        if sheet_name.startswith(prefix):
            return line
    return "1호선"


def read_trips(sheet):
    rows = list(sheet.iter_rows(values_only=True))
    header = {str(r[0]).strip(): r for r in rows[:4] if r[0]}
    stations = [(i, str(r[0]).strip()) for i, r in enumerate(rows) if r[0] and i >= 4]
    columns = max(len(r) for r in rows)
    trips = []
    for c in range(1, columns):
        stops, prev = [], None
        for i, name in stations:
            arrive = to_minutes(rows[i][c]) if c < len(rows[i]) else None
            nxt = rows[i + 1] if i + 1 < len(rows) and not rows[i + 1][0] else None
            depart = to_minutes(nxt[c]) if nxt and c < len(nxt) else None
            minute = depart if depart is not None else arrive
            if minute is None:
                continue
            if prev is not None and minute < prev - 600:  # 자정을 넘김
                minute += 1440
            prev = minute
            stops.append([RENAME.get(name, name), minute])
        if len(stops) >= 2:
            numbers = header.get("열차번호", ())
            trips.append({"no": str(numbers[c]).strip() if c < len(numbers) else "", "stops": stops})
    return trips


def main():
    data = {}
    for day, names in FILES.items():
        data[day] = []
        for name in names:
            book = openpyxl.load_workbook(os.path.join(SRC, name), read_only=True)
            for sheet in book.worksheets:
                line = line_of(sheet.title)
                if line is None:
                    continue
                for trip in read_trips(sheet):
                    trip["line"] = line
                    data[day].append(trip)
    header = (
        "// 열차별 정차 시각 데이터 (열차 추천·환승 계산용)\n"
        "// 출처: 한국철도공사 수도권 광역전철 열차시각표 (2026-08-28 조정안, 엑셀 파일 4개)\n"
        "// 포함 노선: 1호선(경부·경인·의정부·광명셔틀·급행), 경의중앙선, 경춘선, 서해선\n"
        "// 모양: TRIPS[weekday|holiday] = [{ no: 열차번호, line: 노선, stops: [[역 이름, 분], ...] }, ...]\n"
        "// - 분은 자정부터의 분. 자정을 넘긴 열차는 1440 이상으로 이어서 적음\n"
        "// - 토요일·일요일·공휴일은 holiday 사용 (코레일 시간표는 평일/휴일 두 가지)\n"
        "// - ITX-청춘은 별도 요금 열차라 뺐음\n"
        "// - 이 파일은 tools/convert_korail.py로 만듦. 직접 고치지 말 것\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(header + "const TRIPS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("만듦:", OUT, {k: len(v) for k, v in data.items()})


if __name__ == "__main__":
    main()
