// 캘린더 파일 생성을 담당하는 파일입니다.

const ICS_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ICS_BY_DAY = {
    mon: 'MO',
    tue: 'TU',
    wed: 'WE',
    thu: 'TH',
    fri: 'FR',
    sat: 'SA',
    sun: 'SU'
};

function escapeIcsText(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

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

function getNextWeekday(dayKey, now) {
    const today = getSeoulDateParts(now);
    const weekdayNumbers = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const target = ICS_DAY_KEYS.indexOf(dayKey) + 1;
    const current = weekdayNumbers[today.weekday];
    const date = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)));
    date.setUTCDate(date.getUTCDate() + ((target - current + 7) % 7));
    return date;
}

function formatIcsDateTime(date, minute) {
    const hours = String(Math.floor(minute / 60)).padStart(2, '0');
    const minutes = String(minute % 60).padStart(2, '0');
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${hours}${minutes}00`;
}

function addMinutesToDate(date, minute) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + Math.floor(minute / 1440));
    return result;
}

function formatUtcStamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// 요일별 계산 결과와 경로 목록을 받아 반복 출발 알림용 iCalendar 문자열을 반환합니다.
function buildIcs(weekPlans, routes) {
    const now = new Date();
    const stamp = formatUtcStamp(now);
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Nagalsigan//Calendar//KO',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    ICS_DAY_KEYS.forEach((dayKey) => {
        const plan = weekPlans && weekPlans[dayKey];
        if (!plan || !plan.ok) return;

        const date = getNextWeekday(dayKey, now);
        const start = formatIcsDateTime(date, plan.alert);
        const end = formatIcsDateTime(addMinutesToDate(date, plan.alert + 10), (plan.alert + 10) % 1440);
        const trainText = toHHMM(plan.train);
        const title = `출발 알림 · ${trainText} 열차`;
        lines.push(
            'BEGIN:VEVENT',
            `UID:nagalsigan-${dayKey}-${plan.train}@nagalsigan`,
            `DTSTAMP:${stamp}`,
            `DTSTART;TZID=Asia/Seoul:${start}`,
            `DTEND;TZID=Asia/Seoul:${end}`,
            `SUMMARY:${escapeIcsText(title)}`,
            `RRULE:FREQ=WEEKLY;BYDAY=${ICS_BY_DAY[dayKey]}`,
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'TRIGGER:PT0M',
            `DESCRIPTION:${escapeIcsText(title)}`,
            'END:VALARM',
            'END:VEVENT'
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
