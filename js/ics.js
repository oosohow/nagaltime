// 캘린더 파일 생성을 담당하는 파일입니다.

// 요일 키를 iCalendar 반복 규칙(BYDAY)의 요일 코드로 바꾸는 표
const ICS_BY_DAY = {
    mon: 'MO',
    tue: 'TU',
    wed: 'WE',
    thu: 'TH',
    fri: 'FR',
    sat: 'SA',
    sun: 'SU'
};

// iCalendar 규칙에 맞게 역슬래시·쉼표·세미콜론·줄바꿈을 이스케이프합니다.
function escapeIcsText(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

// 날짜를 서울 시간 기준 연·월·일·요일 조각으로 나눕니다.
function getSeoulDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
    }).formatToParts(date);
    return Object.fromEntries(parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
}

// 오늘(서울 기준)부터 가장 가까운 해당 요일의 날짜를 구합니다.
function getNextWeekday(dayKey, now) {
    const today = getSeoulDateParts(now);
    const weekdayNumbers = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const target = DAY_KEYS.indexOf(dayKey) + 1;
    const current = weekdayNumbers[today.weekday];
    const date = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)));
    date.setUTCDate(date.getUTCDate() + ((target - current + 7) % 7));
    return date;
}

// 날짜와 분을 iCalendar 날짜·시각 형식(YYYYMMDDTHHMMSS)으로 만듭니다.
function formatIcsDateTime(date, minute) {
    const hours = String(Math.floor(minute / 60)).padStart(2, '0');
    const minutes = String(minute % 60).padStart(2, '0');
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${hours}${minutes}00`;
}

// 분이 하루를 넘거나 모자라면 그만큼 날짜를 옮깁니다.
function addMinutesToDate(date, minute) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + Math.floor(minute / 1440));
    return result;
}

// 파일을 만든 시각(DTSTAMP)을 UTC 형식으로 만듭니다.
function formatUtcStamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// 매주 반복되고 시작 시각에 알림이 울리는 일정 하나를 lines에 추가합니다.
function addEvent(lines, dayKey, recurrenceDayKey, plan, date, minute, title, suffix) {
    const start = formatIcsDateTime(date, minute);
    const endMinute = minute + 10;
    const end = formatIcsDateTime(
        addMinutesToDate(date, endMinute),
        endMinute % 1440
    );
    const escapedTitle = escapeIcsText(title);
    lines.push(
        'BEGIN:VEVENT',
        `UID:nagalsigan-${dayKey}-${suffix}-${plan.train}@nagalsigan`,
        `DTSTAMP:${formatUtcStamp(new Date())}`,
        `DTSTART;TZID=Asia/Seoul:${start}`,
        `DTEND;TZID=Asia/Seoul:${end}`,
        `SUMMARY:${escapedTitle}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${ICS_BY_DAY[recurrenceDayKey]}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER:PT0M',
        `DESCRIPTION:${escapedTitle}`,
        'END:VALARM',
        'END:VEVENT'
    );
}

// 요일별 계산 결과와 경로 목록을 받아 반복 출발 알림용 iCalendar 문자열을 반환합니다.
function buildIcs(weekPlans, routes) {
    const now = new Date();
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nagalsigan//Calendar//KO',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    DAY_KEYS.forEach((dayKey) => {
        const plan = weekPlans && weekPlans[dayKey];
        if (!plan || !plan.ok) return;

        const trainText = toHHMM(plan.train);
        const departureDate = getNextWeekday(dayKey, now);
        const wakeDate = plan.prevDay
            ? addMinutesToDate(departureDate, -1440)
            : departureDate;
        const wakeDayKey = plan.prevDay
            ? DAY_KEYS[(DAY_KEYS.indexOf(dayKey) + 6) % 7]
            : dayKey;
        addEvent(
            lines,
            dayKey,
            wakeDayKey,
            plan,
            wakeDate,
            plan.wake,
            `기상 · ${trainText} 열차`,
            'wake'
        );
        addEvent(
            lines,
            dayKey,
            dayKey,
            plan,
            departureDate,
            plan.alert,
            `출발 알림 · ${trainText} 열차`,
            'alert'
        );
    });

    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
}

// iCalendar 문자열을 Blob으로 만들어 nagalsigan.ics 파일로 다운로드합니다.
function downloadIcs(text) {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'nagalsigan.ics';
    link.click();
    URL.revokeObjectURL(link.href);
}
