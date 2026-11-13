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
    type: 'custom',
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

test(
    '8. 직접 입력 열차 시각',
    calcPlan({ ...testRoute, type: 'custom' }, '09:00', 'weekday').train,
    477
);

test(
    '9. 예전 경로 다시 등록 안내',
    calcPlan({
        id: 'old-route',
        line: '예전 노선',
        station: '예전 역',
        direction: '예전 방향',
        customTimes: ['07:57'],
        walkMin: 7,
        rideMin: 50,
        prepMin: 80,
        slackMin: 10
    }, '09:00', 'weekday'),
    { ok: false, message: '예전 경로 형식입니다. 경로를 다시 등록해 주세요.' }
);

test(
    '10. 직행·환승 열차 추천',
    (() => {
        const trips = findTrips(TRIPS.weekday, '가좌', '온수', 523, 4);
        return {
            dep: trips[0].dep,
            arr: trips[0].arr,
            legs: trips[0].legs.map((leg) => [leg.no, leg.dep, leg.arr])
        };
    })(),
    {
        dep: 477,
        arr: 522,
        legs: [['K5301', 477, 490], ['K47', 496, 522]]
    }
);

test(
    '11. 환승 시간이 부족한 조합 제외',
    findTrips([
        {
            no: 'A1',
            line: 'A',
            stops: [['출발', 100], ['환승', 110]]
        },
        {
            no: 'B1',
            line: 'B',
            stops: [['환승', 112], ['도착', 120]]
        }
    ], '출발', '도착', 130, 4).length,
    0
);

test(
    '12. 추천 열차 없음',
    findTrips(TRIPS.weekday, '없는 역', '온수', 523, 4),
    []
);

test(
    '13. 휴일 홍대입구 → 신도림 2호선 직행',
    findTrips(TRIPS.holiday, '홍대입구', '신도림', 1440, 4)
        .some((trip) => trip.legs.length === 1 && trip.legs[0].line === '2호선'),
    true
);

test(
    '14. 평일 선릉 → 가천대 수인분당선 직행',
    findTrips(TRIPS.weekday, '선릉', '가천대', 1440, 4)
        .some((trip) => trip.legs.length === 1 && trip.legs[0].line === '수인분당선'),
    true
);

test(
    '15. 홍대입구 → 신도림 → 온수 환승',
    (() => {
        const trips = findTrips([
            {
                no: 'M2',
                line: '2호선',
                stops: [['홍대입구', 470], ['신도림', 482]]
            },
            {
                no: 'K1',
                line: '1호선',
                stops: [['신도림', 487], ['온수', 510]]
            }
        ], '홍대입구', '온수', 520, 4);
        return trips[0].legs.map((leg) => [leg.line, leg.from, leg.to, leg.dep, leg.arr]);
    })(),
    [
        ['2호선', '홍대입구', '신도림', 470, 482],
        ['1호선', '신도림', '온수', 487, 510]
    ]
);

test(
    '16. 가산디지털단지 → 온수 직행',
    (() => {
        const trips = findTrips([
            {
                no: 'L7',
                line: '7호선',
                stops: [['가산디지털단지', 600], ['온수', 612]]
            }
        ], '가산디지털단지', '온수', 620, 4);
        return trips[0].legs.map((leg) => [leg.line, leg.dep, leg.arr]);
    })(),
    [['7호선', 600, 612]]
);

test(
    '17. 같은 노선 열차 환승 조합 제외',
    findTrips([
        {
            no: 'L7-1',
            line: '7호선',
            stops: [['출발', 600], ['환승', 612]]
        },
        {
            no: 'L7-2',
            line: '7호선',
            stops: [['환승', 616], ['도착', 628]]
        }
    ], '출발', '도착', 640, 4),
    []
);

test(
    '18. 순환 열차에서 출발역 다음 도착역 선택',
    (() => {
        const trips = findTrips([
            {
                no: 'LOOP',
                line: '2호선',
                stops: [['신도림', 600], ['홍대입구', 610], ['신도림', 620], ['잠실', 650]]
            }
        ], '홍대입구', '신도림', 630, 4);
        return trips[0].legs.map((leg) => [leg.dep, leg.arr]);
    })(),
    [[610, 620]]
);

test(
    '19. 열차 후보를 여유·추천·지각 위험 순서로 고름',
    findTripOptions([
        {
            no: 'EARLY',
            line: 'A',
            stops: [['출발', 90], ['도착', 170]]
        },
        {
            no: 'BEST',
            line: 'A',
            stops: [['출발', 100], ['도착', 190]]
        },
        {
            no: 'LATE',
            line: 'A',
            stops: [['출발', 110], ['도착', 210]]
        }
    ], '출발', '도착', 200, 4).map((option) => [
        option.kind,
        option.legs[0].no,
        option.lateMin
    ]),
    [
        ['early', 'EARLY', 0],
        ['best', 'BEST', 0],
        ['late', 'LATE', 10]
    ]
);

test(
    '20. 목적지 실제 도착 기준으로 빠듯한 후보를 표시',
    findTripOptions([
        { no: 'BEST', line: 'A', stops: [['출발', 780], ['도착', 790]] },
        { no: 'TIGHT', line: 'A', stops: [['출발', 785], ['도착', 796]] }
    ], '출발', '도착', 810, 4, 10, 5).map((option) => [
        option.kind,
        option.arriveDest,
        option.slack
    ]),
    [
        ['best', 800, 10],
        ['tight', 806, 4]
    ]
);

test(
    '21. 목적지 실제 도착 기준으로 지각 후보를 표시',
    findTripOptions([
        { no: 'BEST', line: 'A', stops: [['출발', 780], ['도착', 790]] },
        { no: 'LATE', line: 'A', stops: [['출발', 785], ['도착', 802]] }
    ], '출발', '도착', 810, 4, 10, 5).map((option) => [
        option.kind,
        option.arriveDest,
        option.lateMin
    ]),
    [
        ['best', 800, 0],
        ['late', 812, 2]
    ]
);

test(
    '22. 첫 열차가 같은 후보는 빠른 도착 하나만 남김',
    findTripOptions([
        {
            no: 'FIRST',
            line: 'A',
            stops: [['출발', 100], ['환승', 110]]
        },
        {
            no: 'NEXT-FAST',
            line: 'B',
            stops: [['환승', 114], ['도착', 180]]
        },
        {
            no: 'NEXT-SLOW',
            line: 'B',
            stops: [['환승', 115], ['도착', 190]]
        }
    ], '출발', '도착', 200, 4).map((option) => [
        option.legs[0].no,
        option.arr
    ]),
    [['FIRST', 180]]
);

test(
    '23. 저장한 첫 열차 번호로 후보를 선택함',
    calcPlan({
        type: 'trip',
        fromStation: '가좌',
        toStation: '온수',
        walkMin: 0,
        lastWalkMin: 0,
        prepMin: 0,
        slackMin: 5,
        transferMin: 4
    }, '08:48', 'weekday', 'K5025').train,
    460
);

test(
    '24. buildIcs 결과에 기상과 출발 알림이 둘 다 있다',
    (() => {
        const ics = buildIcs({
            mon: {
                ok: true,
                train: 477,
                wake: 390,
                alert: 460,
                prevDay: false
            }
        }, []);
        return {
            wake: ics.includes('SUMMARY:기상 · 07:57 열차'),
            alert: ics.includes('SUMMARY:출발 알림 · 07:57 열차'),
            alarms: (ics.match(/BEGIN:VALARM/g) || []).length
        };
    })(),
    { wake: true, alert: true, alarms: 2 }
);

test(
    '25. 가산디지털단지 → 온수 후보에 도봉산 환승이 없다',
    findTripOptions(TRIPS.weekday, '가산디지털단지', '온수', toMin('09:00'), 4)
        .some((option) => option.legs.some((leg) => leg.from === '도봉산' || leg.to === '도봉산')),
    false
);

test(
    '26. 같은 계산을 두 번 해도 결과가 같다',
    isEqual(
        findTripOptions(TRIPS.weekday, '가산디지털단지', '온수', toMin('09:00'), 4),
        findTripOptions(TRIPS.weekday, '가산디지털단지', '온수', toMin('09:00'), 4)
    ),
    true
);

test(
    '27. 추천 열차 안내 문장',
    buildPlanHint({
        depart: toMin('07:45'),
        train: toMin('07:57'),
        kind: 'best',
        legs: [{ from: '가좌', line: '경의중앙선' }]
    }, { type: 'trip' }),
    '07:45에 나가면 07:57 가좌 경의중앙선을 여유 있게 탈 수 있어요'
);

test(
    '28. 빠듯한 열차 안내 문장',
    buildPlanHint({
        depart: toMin('07:50'),
        train: toMin('08:02'),
        kind: 'tight',
        legs: [{ from: '가좌', line: '경의중앙선' }]
    }, { type: 'trip' }),
    '07:50에 나가면 08:02 가좌 경의중앙선을 탈 수 있지만 빠듯해요'
);

test(
    '29. 지각 열차와 직접 입력 안내 문장',
    {
        trip: buildPlanHint({
            depart: toMin('11:53'),
            train: toMin('12:05'),
            kind: 'late',
            lateMin: 4,
            legs: [{ from: '가좌', line: '경의중앙선' }]
        }, { type: 'trip' }),
        custom: buildPlanHint({
            depart: toMin('07:45'),
            train: toMin('07:57'),
            kind: 'best',
            legs: []
        }, { type: 'custom' })
    },
    {
        trip: '11:53에 나가면 12:05 가좌 경의중앙선을 타는데 4분 늦어요',
        custom: '07:45에 나가면 07:57 열차를 여유 있게 탈 수 있어요'
    }
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
