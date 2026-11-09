# 나갈시간 프로젝트 지침

## 프로젝트
요일별로 "몇 시까지 도착"만 입력하면, 저장된 열차 시간표에서 탈 열차를 고르고 출발·기상 시간을 계산해 주는 웹 앱.

## 반드시 지킬 것
- 순수 HTML, CSS, JavaScript만 사용. 프레임워크, 라이브러리, 빌드 도구, npm 사용 금지.
- index.html을 더블클릭(file://)으로 열어도 동작해야 함. 그래서 ES 모듈(import/export)과 fetch를 쓰지 않고, <script src> 순서로 파일을 불러옴.
- 실행 중 외부 API 호출 금지. 열차 시간표는 data/timetable.js에 미리 넣어 둔 데이터만 사용.
- 시간은 내부에서 "자정부터 몇 분"(정수)으로 다룸. 화면에 보여 줄 때만 "HH:MM" 문자열로 바꿈.
- 계산 함수(js/time.js, js/calc.js)는 화면(DOM)을 건드리지 않는 순수 함수로 작성.
- 함수는 짧게 나누고, 이름은 영어, 주석과 화면 문구는 한국어.
- 잘못된 입력은 throw 대신 { ok: false, message } 형태로 돌려주고, 화면에 이유를 보여 줌.

## 파일 구성
- index.html, css/style.css
- js/time.js: 시간 변환
- js/calc.js: 열차 고르기, 계획 계산
- js/storage.js: localStorage 저장·불러오기
- js/ics.js: 캘린더(.ics) 파일 만들기
- js/ui.js: 화면 그리기와 이벤트
- data/timetable.js: 열차 시간표 데이터
- tests.html, tests/tests.js: 테스트

## 데이터 모양
- 경로: { id, name, line, station, direction, walkMin, rideMin, prepMin, slackMin, customTimes }
  - walkMin: 집→역 걷는 시간, rideMin: 탑승 후 목적지 도착까지, prepMin: 기상 후 준비 시간, slackMin: 최소 여유
  - customTimes: 시간표가 없는 역일 때 사용자가 직접 넣은 "HH:MM" 배열 (없으면 null)
- 요일 계획: { mon: { routeId, arrive: "09:00" } 또는 null, tue, wed, thu, fri, sat, sun }
- 시간표: TIMETABLE[노선][역][방향] = { weekday: ["05:30", ...], sat: [...], sun: [...] }

## 계산 규칙
- 탈 열차: (열차 시각 + rideMin) <= (도착 시간 - slackMin) 인 열차 중 가장 늦은 것
- 출발 = 열차 시각 - walkMin, 기상 = 출발 - prepMin, 출발 알림 = 출발 - 10분
- 도착 예상 = 열차 시각 + rideMin, 여유 = 도착 시간 - 도착 예상
- 결과가 0분보다 작으면 1440을 더하고 "전날"로 표시
- 월~금은 weekday, 토는 sat, 일과 공휴일은 sun 시간표 사용