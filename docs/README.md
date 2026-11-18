# docs

개발 참고 자료 모음입니다. 앱 실행에는 필요 없습니다.

| 파일 | 내용 |
|---|---|
| `기말고사_안내서.md` | 기말 과제 안내서 보완판(2026-11-14): 제출물, README 필수 항목, 평가 기준, 마감 |
| `api/레일포털_열차별운행시각표.md` | 2~9호선·수인분당선·공항철도 시간표 API 설명과 trips.js에 합치는 방법 |
| `api/서울열린데이터_열차시간표.md` | 2호선 토요일·휴일 시간표 API(getTrainSch) 설명 |
| `api/레일포털_역사코드정보_2026.07.11.xlsx` | 레일포털 역·노선 코드표 (받을 역 목록을 만들 때 사용) |
| `data-source/*.xlsx` | 코레일 수도권 광역전철 열차시각표 원본 (2026-08-28 시행, 1호선·경의중앙선) |
| `screenshots/*.png` | README에 넣은 실행 화면 |

데이터 만드는 도구는 `tools/`에 있습니다. 실행 방법은 저장소 README의 "실행 환경"을 보세요.

| 도구 | 하는 일 |
|---|---|
| `tools/convert_korail.py` | `data-source` 엑셀 → `data/trips.js` (1호선·경의중앙선) |
| `tools/fetch_kric.py` | 레일포털에서 노선별 시간표 받기 → `tools/kric_out/` (`--line 3호선,4호선`처럼 노선 지정) |
| `tools/fetch_seoul.py` | 서울 열린데이터광장에서 2호선 주말 시간표 받기 → `tools/kric_out/` |
| `tools/merge_kric.js` | 받은 시간표를 `data/trips.js`에 합치기 (같은 이름의 다른 역 구분, 안 쓰는 노선 제외 포함) |

`tools/kric_out/`은 내려받은 원본이라 GitHub에 올리지 않습니다(`.gitignore`).

**API 키는 어떤 파일에도 적지 않습니다.** 스크립트를 실행할 때 환경 변수(`KRIC_KEY`, `SEOUL_KEY`)로 넣습니다.
