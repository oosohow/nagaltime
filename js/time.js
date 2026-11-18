// 시간 변환 함수와 여러 파일이 같이 쓰는 요일 목록을 담당하는 파일입니다.

// 월요일부터 일요일까지의 요일 키 (저장·계산·화면·캘린더에서 같이 씀)
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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
        minutes -= 1440; // 1440 이상이면 하루를 빼줌
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
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