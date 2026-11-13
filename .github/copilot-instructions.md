# 나갈시간 프로젝트 지침

## 프로젝트
요일별로 "몇 시까지 도착"만 입력하면, 열차별 정차 시각 데이터로 탈 열차(환승 1번까지)를 골라 출발·기상 시간을 계산하고, 요일별 알림을 캘린더(.ics)로 보내 주는 웹 앱.
전체 맥락과 남은 작업은 `docs/인수인계.md` 참고.

## 반드시 지킬 것
- 순수 HTML, CSS, JavaScript만 사용. 프레임워크, 라이브러리, 빌드 도구, npm 사용 금지.
- index.html을 더블클릭(file://)으로 열어도 동작해야 함. 그래서 ES 모듈(import/export)과 fetch를 쓰지 않고, <script src> 순서로 파일을 불러옴.
- 실행 중 외부 API 호출 금지. 열차 데이터는 data/ 폴더에 미리 넣어 둔 것만 사용.
- 시간은 내부에서 "자정부터 몇 분"(정수)으로 다룸. 화면에 보여 줄 때만 "HH:MM" 문자열로 바꿈.
- 계산 함수(js/time.js, js/calc.js)는 화면(DOM)을 건드리지 않는 순수 함수로 작성.
- 함수는 짧게 나누고, 이름은 영어, 주석과 화면 문구는 한국어.
- 잘못된 입력은 throw 대신 { ok: false, message } 형태로 돌려주고, 화면에 이유를 보여 줌.
- data/trips.js는 직접 고치지 말 것. tools/ 스크립트로 다시 만듦.
- API 키를 코드, 문서, 커밋에 절대 넣지 말 것.

## 파일 구성
- index.html, css/style.css: 화면
- js/time.js: 시간 변환
- js/calc.js: 열차 고르기(pickTrain), 열차 추천(findTrips), 계획 계산(calcPlan, calcWeek)
- js/storage.js: localStorage 저장·불러오기
- js/ics.js: 캘린더(.ics) 파일 만들기
- js/ui.js: 화면 그리기와 이벤트
- data/trips.js: 열차별 정차 시각 (1호선·경의중앙선·경춘선·서해선은 코레일 엑셀, 2·7호선은 레일포털)
- tests.html, tests/tests.js: 브라우저 테스트
- tools/: 데이터 만드는 스크립트 (convert_korail.py, fetch_kric.py, merge_kric.js)
- docs/: 인수인계, 기말 안내서, API 문서, 원본 엑셀

## 데이터 모양
- 추천형 경로(기본): { id, name, type: "trip", fromStation, toStation, walkMin, lastWalkMin, prepMin, slackMin, transferMin }
- 직접 입력 경로: { id, name, type: "custom", walkMin, rideMin, prepMin, slackMin, customTimes: ["07:47", ...] }
- 요일 계획: { mon: { routeId, arrive: "09:00" } 또는 null, tue, wed, thu, fri, sat, sun }
- TRIPS.weekday / TRIPS.holiday = [{ no, line, stops: [[역 이름, 분], ...] }] (토·일·공휴일은 holiday)

## 계산 규칙
- 추천형: deadline = 도착 시간 - slackMin - lastWalkMin. 바로 가거나 한 번 갈아타서 deadline까지 도착하는 조합 중 가장 늦게 출발하는 것
- 갈아탈 때는 앞 열차 도착 + transferMin 이후에 출발하는 열차만
- 출발 = 첫 열차 출발 - walkMin, 기상 = 출발 - prepMin, 출발 알림 = 출발 - 10분
- 결과가 0분보다 작으면 1440을 더하고 "전날"로 표시