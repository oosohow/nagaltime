// 시간 변환 함수를 담당하는 파일입니다. 

// 이 파일에 시간 변환 함수를 만들어 줘.
// 1. toMin("07:57") → 477. "HH:MM" 문자열을 자정부터 몇 분인지로 바꿈.
//    - "7:57"처럼 한 자리 시도 허용
//    - 형식이 틀리거나 시가 0~23, 분이 0~59를 벗어나면 null 반환
// 2. toHHMM(477) → "07:57". 분을 "HH:MM"으로 바꿈.
//    - 음수면 1440을 더하고, 1440 이상이면 1440을 뺀 값으로 표시
// 3. isPrevDay(min) → min이 0보다 작으면 true
// 4. parseTimeList("07:47, 07:57,08:07") → [467, 477, 487]
//    - 쉼표나 줄바꿈으로 나눔, 공백 무시, 잘못된 항목이 하나라도 있으면 { ok: false, message: "'7:6x'는 시간 형식이 아닙니다" }처럼 돌려줌
//    - 정상이면 { ok: true, value: [오름차순 정렬된 분 배열] }
// 함수마다 한 줄 주석을 달아 줘.



// "HH:MM" 문자열을 자정부터 몇 분인지로 변환하는 함수
function toMin(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
}

// 분을 "HH:MM" 문자열로 변환하는 함수
function toHHMM(minutes) {
    if (minutes < 0) {
        minutes += 1440; // 음수면 하루(1440분)를 더함
    } else if (minutes >= 1440) {
        minutes -= 1440; // 1440 이상이면 하루를 �빼줌
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// min이 0보다 작은지 확인하는 함수
function isPrevDay(min) {
    return min < 0;
}

// 쉼표나 줄바꿈으로 나눠진 시간 문자열을 분 배열로 변환하는 함수
function parseTimeList(timeListStr) {
    const times = timeListStr.split(/[\s,]+/).filter(Boolean); // 공백과 쉼표로 나누고 빈 문자열 제거
    const result = [];

    for (const time of times) {
        const min = toMin(time);
        if (min === null) {
            return { ok: false, message: `'${time}'는 시간 형식이 아닙니다` };
        }
        result.push(min);
    }

    result.sort((a, b) => a - b); // 오름차순 정렬
    return { ok: true, value: result };
}   