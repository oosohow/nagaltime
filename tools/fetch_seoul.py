#!/usr/bin/env python3
# 나갈시간: 2호선 토요일·휴일 시간표를 서울 열린데이터광장 API(getTrainSch)로 한 번만 받는 스크립트
# - 레일포털에는 2호선 주말·휴일 데이터가 없어서 이걸로 채움
# - getTrainSch는 열차 하나가 지나는 역마다 한 줄씩 줌 (열차번호, 역, 도착·출발 시각, 상하행, 요일)
#   주소: /getTrainSch/{시작}/{끝}/{열차번호(빈칸)}/{임시시간표 N}/{상하행}/{요일}/{노선}
#   설명: docs/api/서울열린데이터_열차시간표.md
# - 인증키는 열린데이터광장 "일반 인증키". 파일에 적지 않고 실행할 때 입력
# - 실행 (프로젝트 폴더에서):
#     SEOUL_KEY='일반인증키' python3 tools/fetch_seoul.py --check   (어떤 조합에 데이터가 있는지만 확인)
#     SEOUL_KEY='일반인증키' python3 tools/fetch_seoul.py           (평일이 아닌 조합을 모두 받기)
# - 결과: tools/kric_out/seoul_line2.json.gz (.gitignore에 들어 있음)
import gzip, json, os, subprocess, sys, time, getpass, urllib.parse

LINE = "2호선"
DIRECTIONS = ["상행", "하행", "내선", "외선"]
DAYS = ["평일", "토요일", "휴일", "공휴일", "일요일", "주말"]
PAGE = 1000
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kric_out")
os.makedirs(HERE, exist_ok=True)
OUT = os.path.join(HERE, "seoul_line2.json.gz")
KEEP = ["trainno", "stnNm", "trainArvlTm", "trainDptreTm", "upbdnbSe", "wkndSe", "brlnNm", "vldBgngDt", "vldEndDt"]


def call(key, start, end, direction, day):
    parts = [str(start), str(end), " ", "N", direction, day, LINE]
    path = "/".join(urllib.parse.quote(p, safe="") for p in parts)
    url = f"http://openapi.seoul.go.kr:8088/{key}/json/getTrainSch/{path}/"
    r = subprocess.run(["curl", "-sS", "--max-time", "30", url], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout)


def find_rows(data):
    """응답 모양이 달라도 trainno가 있는 항목 목록과 전체 개수를 찾음"""
    rows, total = [], None

    def walk(x):
        nonlocal total
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("totalCount", "list_total_count"):
                    try:
                        total = int(v)
                    except (TypeError, ValueError):
                        pass
                walk(v)
        elif isinstance(x, list):
            if x and isinstance(x[0], dict) and "trainno" in x[0]:
                rows.extend(x)
            else:
                for v in x:
                    walk(v)

    walk(data)
    return rows, total


def is_key_error(data):
    return "INFO-100" in json.dumps(data, ensure_ascii=False)


def main():
    key = os.environ.get("SEOUL_KEY") or getpass.getpass("열린데이터광장 일반 인증키를 붙여 넣고 Enter (화면에 안 보임): ")
    key = key.strip().strip("'\"")
    print(f"인증키 확인: 길이 {len(key)}, 앞 4글자 '{key[:4]}'")

    print(f"{LINE} 조합별 데이터 개수 확인 중...")
    found = {}
    for direction in DIRECTIONS:
        for day in DAYS:
            data = call(key, 1, 1, direction, day)
            if is_key_error(data):
                sys.exit("인증키 오류입니다. 일반 인증키인지 확인해 주세요.")
            rows, total = find_rows(data)
            if rows:
                found[(direction, day)] = total or 0
                sample = {k: rows[0].get(k) for k in KEEP}
                print(f"  {direction} / {day}: {total}줄  예: {json.dumps(sample, ensure_ascii=False)}")
            time.sleep(0.5)
    if not found:
        sys.exit("데이터가 있는 조합이 없습니다. 이 결과를 Claude에게 보내 주세요.")
    if "--check" in sys.argv:
        return

    result = {}
    for (direction, day), total in found.items():
        if day == "평일":
            continue  # 평일은 레일포털 데이터 사용
        got = []
        for start in range(1, total + 1, PAGE):
            end = min(start + PAGE - 1, total)
            rows, _ = find_rows(call(key, start, end, direction, day))
            got.extend({k: r.get(k) for k in KEEP} for r in rows)
            print(f"  {direction}/{day}: {len(got)}/{total}")
            time.sleep(1.0)
        result[f"{day}|{direction}"] = got
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    periods = sorted({(r.get("vldBgngDt"), r.get("vldEndDt")) for rows in result.values() for r in rows})
    print("끝!", OUT, {k: len(v) for k, v in result.items()})
    print("시간표 유효 기간:", periods[:5])


if __name__ == "__main__":
    main()