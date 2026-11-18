// 나갈시간 테스트: 각 테스트는 실제 함수의 결과(실제값)와 기대값을 비교하고, 결과를 표와 console.assert로 남깁니다.

const testResults = [];
// 저장소를 쓰는 테스트가 사용자의 실제 경로·요일 계획을 지우지 않도록 처음 값을 보관했다가 마지막에 되돌립니다.
const savedRoutesStorage = localStorage.getItem('nagalsigan.routes');
const savedWeekStorage = localStorage.getItem('nagalsigan.week');

// 두 값을 JSON 문자열로 바꿔 같은지 비교합니다.
function isEqual(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

// 결과 표에 보여 줄 수 있게 값을 들여쓴 JSON으로 바꿉니다.
function displayValue(value) {
    return JSON.stringify(value, null, 2);
}

// 테스트 하나를 기록합니다.
function test(name, actual, expected) {
    const passed = isEqual(actual, expected);
    const result = { name, actual, expected, passed };
    testResults.push(result);
    console.assert(passed, name, { expected, actual });
    return passed;
}

// 열차 추천 테스트용: 마감 안에 도착하는 경로 중 늦게 출발하는 순서로 최대 3개를 돌려줍니다.
function findTrips(trips, fromStation, toStation, deadlineMin, transferMin) {
    return collectTrips(trips, fromStation, toStation, transferMin)
        .filter((trip) => trip.arr <= deadlineMin)
        .sort((first, second) => second.dep - first.dep || first.arr - second.arr)
        .slice(0, 3);
}

// 중간고사 계획서 F3의 예시 경로 (열차 07:47·07:57·08:07, 탑승 후 50분, 도보 7분, 준비 80분, 최소 여유 10분)
const testRoute = {
    id: 'test-route',
    type: 'custom',
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
    }, '08:48', 'weekday', 'K2207').train,
    457
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

test(
    '30. 경로 수정은 id와 변경 값을 저장함',
    (() => {
        saveRoutes([{ id: 'edit-route', name: '기존', walkMin: 5 }]);
        const updated = updateRoute('edit-route', { name: '변경', walkMin: 12 });
        return {
            id: updated.id,
            name: loadRoutes()[0].name,
            walkMin: loadRoutes()[0].walkMin
        };
    })(),
    { id: 'edit-route', name: '변경', walkMin: 12 }
);

test(
    '31. 경로 수정 시 요일 도착 시간은 유지하고 choice만 삭제함',
    (() => {
        saveRoutes([{ id: 'edit-route', name: '기존' }]);
        saveWeek({
            mon: { routeId: 'edit-route', arrive: '09:00', choice: 'K1' },
            tue: null
        });
        updateRoute('edit-route', { name: '변경' });
        return loadWeek().mon;
    })(),
    { routeId: 'edit-route', arrive: '09:00' }
);

test(
    '32. 없는 id의 경로 수정은 null이고 기존 경로를 유지함',
    (() => {
        saveRoutes([{ id: 'keep-route', name: '기존', walkMin: 5 }]);
        const updated = updateRoute('missing-route', { name: '변경', walkMin: 12 });
        return { updated, routes: loadRoutes() };
    })(),
    {
        updated: null,
        routes: [{ id: 'keep-route', name: '기존', walkMin: 5 }]
    }
);

test(
    '33. 같은 첫 열차로 도착이 같으면 더 늦게 갈아타는 경로를 고름',
    (() => {
        const viaYongsan = {
            arr: 516,
            legs: [{ to: '용산', dep: 460 }, { from: '용산', dep: 477 }]
        };
        const viaHoegi = {
            arr: 516,
            legs: [{ to: '회기', dep: 460 }, { from: '회기', dep: 505 }]
        };
        return {
            hoegiFirst: isBetterTrip(viaHoegi, viaYongsan),
            yongsanFirst: isBetterTrip(viaYongsan, viaHoegi)
        };
    })(),
    { hoegiFirst: true, yongsanFirst: false }
);

test(
    '34. 환승역을 회기로 지정하면 회기 환승 후보만 나옴',
    (() => {
        const options = findTripOptions(TRIPS.weekday, '가좌', '월계', toMin('09:00'), 2, 10, 5, '회기');
        return {
            hasOptions: options.length > 0,
            allHoegi: options.every((item) => item.legs.length === 1 || item.legs[0].to === '회기')
        };
    })(),
    { hasOptions: true, allHoegi: true }
);

test(
    '35. 지나지 않는 환승역을 지정하면 후보가 없음',
    findTripOptions(TRIPS.weekday, '가좌', '월계', toMin('09:00'), 2, 10, 5, '없는 역'),
    []
);

test(
    '36. 5호선: 가좌 → 공덕 → 광화문 환승 추천',
    (() => {
        const options = findTripOptions(TRIPS.weekday, '가좌', '광화문', toMin('09:00'), 4, 5, 5);
        const best = options.find((item) => item.kind === 'best');
        return best ? best.legs.map((leg) => `${leg.line} ${leg.to}`) : null;
    })(),
    ['경의중앙선 공덕', '5호선 광화문']
);

test(
    '37. 6호선: 응암순환 구간을 지나 공덕까지 직행',
    (() => {
        const options = findTripOptions(TRIPS.weekday, '응암', '공덕', toMin('09:00'), 4, 5, 5);
        const best = options.find((item) => item.kind === 'best');
        return best ? best.legs.map((leg) => leg.line) : null;
    })(),
    ['6호선']
);

test(
    '38. 시간 막대 구간을 모두 더하면 기상부터 도착 시간까지와 같음',
    (() => {
        const route = {
            type: 'trip', fromStation: '가좌', toStation: '온수',
            walkMin: 12, lastWalkMin: 12, prepMin: 75, slackMin: 5, transferMin: 4
        };
        const plan = calcPlan(route, '09:00', 'weekday');
        const segments = getTimeSegments(plan);
        return {
            sum: segments.reduce((total, segment) => total + segment.minutes, 0),
            total: toMin('09:00') - plan.wake,
            types: segments.map((segment) => segment.type)
        };
    })(),
    {
        sum: 150,
        total: 150,
        types: ['prep', 'walk', 'train', 'wait', 'train', 'walk', 'slack']
    }
);

test(
    '39. 3호선: 일산선 대화에서 종로3가까지 갈아타지 않고 직행',
    (() => {
        const options = findTripOptions(TRIPS.weekday, '대화', '종로3가', toMin('09:00'), 4, 5, 5);
        const best = options.find((item) => item.kind === 'best');
        return best ? best.legs.map((leg) => leg.line) : null;
    })(),
    ['3호선']
);

test(
    '40. 9호선: 11/16 개편 시간표(05:40~07:00 급행 2대·일반 1대) 반영',
    (() => {
        const trains = TRIPS.weekday
            .filter((trip) => trip.line === '9호선' && trip.stops.some(([station]) => station === '중앙보훈병원'))
            .filter((trip) => ['개화', '김포공항'].includes(trip.stops[0][0]))
            .filter((trip) => trip.stops[0][1] >= toMin('05:40') && trip.stops[0][1] < toMin('07:00'));
        const express = trains.filter((trip) => !trip.stops.some(([station]) => station === '공항시장')).length;
        return { express, local: trains.length - express };
    })(),
    { express: 13, local: 6 }
);

test(
    '41. 역 이름에 \'역\'이 붙거나 빠져도 찾고, 없는 역은 null',
    (() => {
        const names = ['신촌', '서울역', '신촌(경의중앙선)'];
        return ['신촌역', '신촌', '서울', '서울역', ' 신촌 역 ', '없는역', ''].map((text) => resolveStationName(text, names));
    })(),
    ['신촌', '신촌', '서울역', '서울역', '신촌', null, null]
);

test(
    '42. 떨어져 있는 2호선 신촌과 경의중앙선 신촌은 갈아타는 역으로 쓰지 않음',
    (() => {
        const routes = collectTrips(TRIPS.weekday, '가좌', '이대', 4);
        return {
            hasRoute: routes.length > 0,
            transferAtSinchon: routes.some((route) => route.legs.length > 1 && route.legs[0].to.startsWith('신촌'))
        };
    })(),
    { hasRoute: true, transferAtSinchon: false }
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

if (savedRoutesStorage === null) localStorage.removeItem('nagalsigan.routes');
else localStorage.setItem('nagalsigan.routes', savedRoutesStorage);
if (savedWeekStorage === null) localStorage.removeItem('nagalsigan.week');
else localStorage.setItem('nagalsigan.week', savedWeekStorage);
