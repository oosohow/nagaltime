const testResults = [];

function isEqual(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function displayValue(value) {
    return JSON.stringify(value, null, 2);
}

function test(name, actual, expected) {
    const passed = isEqual(actual, expected);
    const result = { name, actual, expected, passed };
    testResults.push(result);
    console.assert(passed, name, { expected, actual });
    return passed;
}

const testRoute = {
    id: 'test-route',
    line: '테스트 노선',
    station: '테스트 역',
    direction: '테스트 방향',
    walkMin: 7,
    rideMin: 50,
    prepMin: 80,
    slackMin: 10,
    customTimes: ['07:47', '07:57', '08:07']
};

test(
    '1. 시간 변환',
    { toMin: toMin('07:57'), toHHMM: toHHMM(477) },
    { toMin: 477, toHHMM: '07:57' }
);

test(
    '2. 기본 계획 계산',
    calcPlan(testRoute, '09:00', 'weekday'),
    {
        ok: true,
        train: 477,
        depart: 470,
        wake: 390,
        alert: 460,
        arriveEst: 527,
        slack: 13,
        prevDay: false
    }
);

test(
    '3. 여유가 부족한 열차 제외',
    calcPlan(testRoute, '09:00', 'weekday').train !== toMin('08:07'),
    true
);

test(
    '4. 맞는 열차 없음',
    calcPlan(testRoute, '05:00', 'weekday').ok,
    false
);

test(
    '5. 전날 기상 시간',
    (() => {
        const route = { ...testRoute, customTimes: ['00:30'], walkMin: 20, prepMin: 80 };
        const plan = calcPlan(route, '02:00', 'weekday');
        return { wake: plan.wake, prevDay: plan.prevDay };
    })(),
    { wake: 1370, prevDay: true }
);

test(
    '6. 잘못된 입력',
    { arrive: calcPlan(testRoute, '9시', 'weekday').ok, list: parseTimeList('07:5x').ok },
    { arrive: false, list: false }
);

test(
    '7. 요일 유형',
    { saturday: getDayType('sat', false), holiday: getDayType('mon', true) },
    { saturday: 'sat', holiday: 'sun' }
);

const passedCount = testResults.filter((result) => result.passed).length;
document.getElementById('summary').textContent =
    `${testResults.length}개 중 ${passedCount}개 통과`;

const resultBody = document.getElementById('results');
testResults.forEach((result, index) => {
    const row = document.createElement('tr');
    row.className = result.passed ? 'passed' : 'failed';
    row.innerHTML = `
        <td>${index + 1}</td>
        <td>${result.name}</td>
        <td><pre>${displayValue(result.expected)}</pre></td>
        <td><pre>${displayValue(result.actual)}</pre></td>
        <td>${result.passed ? '통과' : '실패'}</td>
    `;
    resultBody.appendChild(row);
});
