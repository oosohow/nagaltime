#!/usr/bin/env python3
# 나갈시간: 2호선 토요일·휴일 시간표를 서울 열린데이터광장 API로 한 번만 받는 스크립트
# - 레일포털에는 2호선 주말·휴일 데이터가 없어서 이걸로 채움
# - API: 서울교통공사_역코드로 지하철 열차 시간표 검색 (SearchSTNTimeTableByIDService)
#   설명: docs/api/서울열린데이터_열차시간표.md
# - 2호선 본선 43개 역 x 상·하행(내선·외선) x 요일 = 기본 휴일만 약 86번 호출, 1초에 1번 (약 2분)
# - 인증키는 열린데이터광장 "일반 인증키"(실시간 지하철 키 아님). 파일에 적지 않고 실행할 때 입력
# - 실행: 프로젝트 폴더에서
#     SEOUL_KEY='일반인증키' python3 tools/fetch_seoul.py            (휴일)
#     SEOUL_KEY='일반인증키' python3 tools/fetch_seoul.py --day 2    (토요일도 받고 싶을 때)
# - 결과: tools/kric_out/seoul_line2.json.gz (.gitignore에 들어 있음)
import gzip, json, os, subprocess, sys, time, getpass

STATIONS = [["0201", "시청"], ["0202", "을지로입구"], ["0203", "을지로3가"], ["0204", "을지로4가"], ["0205", "동대문역사문화공원"], ["0206", "신당"], ["0207", "상왕십리"], ["0208", "왕십리"], ["0209", "한양대"], ["0210", "뚝섬"], ["0211", "성수"], ["0212", "건대입구"], ["0213", "구의(광진구청)"], ["0214", "강변(동서울터미널)"], ["0215", "잠실나루"], ["0216", "잠실(송파구청)"], ["0217", "잠실새내"], ["0218", "종합운동장"], ["0219", "삼성(무역센터)"], ["0220", "선릉"], ["0221", "역삼"], ["0222", "강남"], ["0223", "교대(법원.검찰청)"], ["0224", "서초"], ["0225", "방배"], ["0226", "사당"], ["0227", "낙성대"], ["0228", "서울대입구(관악구청)"], ["0229", "봉천"], ["0230", "신림"], ["0231", "신대방"], ["0232", "구로디지털단지"], ["0233", "대림(구로구청)"], ["0234", "신도림"], ["0235", "문래"], ["0236", "영등포구청"], ["0237", "당산"], ["0238", "합정"], ["0239", "홍대입구"], ["0240", "신촌"], ["0241", "이대"], ["0242", "아현"], ["0243", "충정로(경기대입구)"]]  # [역코드, 역 이름]  (2호선 본선, 지선 제외)
DAY_NAMES = {"1": "평일", "2": "토요일", "3": "휴일"}
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kric_out")
os.makedirs(HERE, exist_ok=True)
PART = os.path.join(HERE, "seoul_partial.json")
OUT = os.path.join(HERE, "seoul_line2.json.gz")

def fetch(key, day, inout, code):
    url = f"http://openapi.seoul.go.kr:8088/{key}/json/SearchSTNTimeTableByIDService/1/1000/{day}/{inout}/{code}/"
    r = subprocess.run(["curl", "-sS", "--max-time", "20", url], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    data = json.loads(r.stdout)
    body = data.get("SearchSTNTimeTableByIDService")
    if body is None:  # 오류일 때는 RESULT만 옴
        result = data.get("RESULT", {})
        code_ = result.get("CODE", "")
        if code_ == "INFO-200":  # 데이터 없음
            return []
        if code_ == "INFO-100":
            raise KeyError(result.get("MESSAGE", "인증키 오류"))
        raise RuntimeError(json.dumps(result, ensure_ascii=False))
    return body.get("row", [])

def main():
    key = os.environ.get("SEOUL_KEY") or getpass.getpass("열린데이터광장 일반 인증키를 붙여 넣고 Enter (화면에 안 보임): ")
    key = key.strip().strip("'\"")
    print(f"인증키 확인: 길이 {len(key)}, 앞 4글자 '{key[:4]}'")
    days = ["3"]
    if "--day" in sys.argv:
        days = [sys.argv[sys.argv.index("--day") + 1]]
    print(f"받을 것: 2호선 {len(STATIONS)}개 역 / {', '.join(DAY_NAMES.get(d, d) for d in days)} / 내선·외선")
    done = json.load(open(PART, encoding="utf-8")) if os.path.exists(PART) else {}
    jobs = [(d, io, s) for d in days for s in STATIONS for io in ("1", "2")]
    for i, (day, inout, (code, name)) in enumerate(jobs, 1):
        k = f"{day}|{inout}|{code}"
        if k in done:
            continue
        for attempt in range(3):
            try:
                done[k] = {"name": name, "rows": fetch(key, day, inout, code)}
                break
            except KeyError as e:
                sys.exit(f"열린데이터광장이 인증키를 거부했습니다: {e}\n일반 인증키(실시간 지하철 키 아님)인지 확인해 주세요.")
            except Exception as e:
                print(f"  다시 시도 {attempt + 1}/3: {name} - {e}")
                time.sleep(5)
        else:
            print(f"  건너뜀: {name}")
        if i % 20 == 0 or i == len(jobs):
            json.dump(done, open(PART, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"{i}/{len(jobs)} 완료 ({name})")
        time.sleep(1.0)
    json.dump(done, open(PART, "w", encoding="utf-8"), ensure_ascii=False)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(done, f, ensure_ascii=False, separators=(",", ":"))
    empty = [v["name"] for v in done.values() if not v["rows"]]
    rows = sum(len(v["rows"]) for v in done.values())
    print("끝!", OUT, f"(받은 시각 {rows}건)")
    if empty:
        print("데이터가 없던 경우", len(empty), "개:", ", ".join(empty[:20]))
    sample = next((v["rows"][0] for v in done.values() if v["rows"]), None)
    if sample:
        print("응답 예시 한 줄:", json.dumps(sample, ensure_ascii=False))

if __name__ == "__main__":
    main()
