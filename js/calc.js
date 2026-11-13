// 열차 선택과 계획 계산을 담당하는 파일입니다.

// 요일 키와 공휴일 여부를 받아 시간표 유형을 반환합니다.
function getDayType(dayKey, isHoliday) {
    if (isHoliday || dayKey === 'sun') return 'sun';
    if (dayKey === 'sat') return 'sat';
    return 'weekday';
}

// 직접 입력한 열차 시각을 정렬된 분 배열 또는 오류 객체로 반환합니다.
function getTrainTimes(route) {
    const timeTexts = route && route.customTimes;
    if (!Array.isArray(timeTexts) || timeTexts.length === 0) {
        return { ok: false, message: '열차 시각을 입력해 주세요.' };
    }

    const trainMins = [];
    for (const timeText of timeTexts) {
        if (typeof timeText !== 'string') {
            return { ok: false, message: '열차 시각은 HH:MM 형식이어야 합니다.' };
        }
        const minute = toMin(timeText);
        if (minute === null) {
            return { ok: false, message: '열차 시각은 HH:MM 형식이어야 합니다.' };
        }
        trainMins.push(minute);
    }

    trainMins.sort((a, b) => a - b);
    return trainMins;
}

// 열차 분 배열과 도착·소요·여유 시간을 받아 조건에 맞는 가장 늦은 열차 분 또는 null을 반환합니다.
function pickTrain(trainMins, arriveMin, rideMin, slackMin) {
    let picked = null;
    for (const trainMin of trainMins) {
        if (trainMin + rideMin <= arriveMin - slackMin) {
            picked = trainMin;
        }
    }
    return picked;
}

function normalizeMinute(minute) {
    return minute < 0 ? minute + 1440 : minute >= 1440 ? minute - 1440 : minute;
}

function calcTripPlan(route, arriveMin, dayType, choice) {
    const fields = ['walkMin', 'lastWalkMin', 'prepMin', 'slackMin', 'transferMin'];
    if (fields.some((field) => typeof route[field] !== 'number' || route[field] < 0)) {
        return { ok: false, message: '경로 시간 설정은 0 이상의 숫자여야 합니다.' };
    }

    const trips = dayType === 'weekday' ? TRIPS.weekday : TRIPS.holiday;
    const options = findTripOptions(
        trips,
        route.fromStation,
        route.toStation,
        arriveMin,
        route.transferMin,
        route.lastWalkMin,
        route.slackMin
    );
    if (options.length === 0) {
        return { ok: false, message: '도착 시간에 맞는 열차가 없습니다.' };
    }

    const selected = options.find((option) => option.legs[0].no === choice) || options.find(
        (option) => option.kind === 'best'
    ) || options[0];
    const departRaw = selected.dep - route.walkMin;
    const wakeRaw = departRaw - route.prepMin;
    const alertRaw = departRaw - 10;

    return {
        ok: true,
        train: selected.legs[0].dep,
        depart: normalizeMinute(departRaw),
        wake: normalizeMinute(wakeRaw),
        alert: normalizeMinute(alertRaw),
        arriveEst: normalizeMinute(selected.arriveDest),
        slack: arriveMin - selected.arriveDest,
        prevDay: wakeRaw < 0,
        legs: selected.legs,
        late: selected.kind === 'late',
        tight: selected.kind === 'tight',
        options,
        choice: selected.legs[0].no
    };
}

// 경로와 도착 시각, 요일 유형을 받아 하루 이동 계획 또는 오류 객체를 반환합니다.
function calcPlan(route, arriveText, dayType, choice) {
    if (typeof arriveText !== 'string' || toMin(arriveText) === null) {
        return { ok: false, message: '도착 시간을 HH:MM 형식으로 입력해 주세요.' };
    }

    if (!route || (route.type !== 'trip' && route.type !== 'custom')) {
        return { ok: false, message: '예전 경로 형식입니다. 경로를 다시 등록해 주세요.' };
    }

    if (route.type === 'trip') {
        return calcTripPlan(route, toMin(arriveText), dayType, choice);
    }

    const fields = ['walkMin', 'rideMin', 'prepMin', 'slackMin'];
    if (!route || fields.some((field) => typeof route[field] !== 'number' || route[field] < 0)) {
        return { ok: false, message: '경로 시간 설정은 0 이상의 숫자여야 합니다.' };
    }

    const trainTimes = getTrainTimes(route);
    if (!Array.isArray(trainTimes)) return trainTimes;

    const arriveMin = toMin(arriveText);
    const train = pickTrain(trainTimes, arriveMin, route.rideMin, route.slackMin);
    if (train === null) {
        return { ok: false, message: '도착 시간에 맞는 열차가 없습니다.' };
    }

    const departRaw = train - route.walkMin;
    const wakeRaw = departRaw - route.prepMin;
    const alertRaw = departRaw - 10;
    const arriveEstRaw = train + route.rideMin;
    return {
        ok: true,
        train,
        depart: normalizeMinute(departRaw),
        wake: normalizeMinute(wakeRaw),
        alert: normalizeMinute(alertRaw),
        arriveEst: normalizeMinute(arriveEstRaw),
        slack: arriveMin - arriveEstRaw,
        prevDay: wakeRaw < 0
    };
}

// 경로 목록과 요일별 입력, 공휴일 목록을 받아 요일별 계획 결과 객체를 반환합니다.
function calcWeek(routes, week, holidays) {
    const results = {};
    const routeList = Array.isArray(routes) ? routes : [];
    const weekPlan = week || {};
    const holidayList = Array.isArray(holidays) ? holidays : [];

    for (const dayKey of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
        const dayPlan = weekPlan[dayKey];
        if (!dayPlan) {
            results[dayKey] = null;
            continue;
        }
        const route = routeList.find((item) => item && item.id === dayPlan.routeId);
        if (!route) {
            results[dayKey] = { ok: false, message: '경로를 찾을 수 없습니다.' };
            continue;
        }
        results[dayKey] = calcPlan(
            route,
            dayPlan.arrive,
            getDayType(dayKey, holidayList.includes(dayKey)),
            dayPlan.choice
        );
    }

    return results;
}

const stationIndexCache = new WeakMap();

function getStationIndex(trips) {
    let stationIndex = stationIndexCache.get(trips);
    if (stationIndex) return stationIndex;

    stationIndex = new Map();
    trips.forEach((trip) => {
        trip.stops.forEach(([station], index) => {
            if (!stationIndex.has(station)) stationIndex.set(station, []);
            stationIndex.get(station).push({ trip, index });
        });
    });
    stationIndexCache.set(trips, stationIndex);
    return stationIndex;
}

// 열차 데이터와 출발·도착역, 도착 마감, 환승 시간을 받아 가능한 직행·1회 환승 경로를 반환합니다.
function collectTrips(trips, fromStation, toStation, transferMin) {
    const findStopIndexAfter = (stops, station, startIndex) => stops.findIndex(
        ([stopStation], index) => index > startIndex && stopStation === station
    );
    const tripList = Array.isArray(trips) ? trips : [];
    const stationIndex = getStationIndex(tripList);

    const fromTrips = stationIndex.get(fromStation) || [];
    const results = [];

    fromTrips.forEach(({ trip: firstTrip, index: fromIndex }) => {
        const fromStop = firstTrip.stops[fromIndex];
        const directToIndex = findStopIndexAfter(firstTrip.stops, toStation, fromIndex);
        if (directToIndex !== -1) {
            const toStop = firstTrip.stops[directToIndex];
            results.push({
                legs: [{
                    line: firstTrip.line,
                    no: firstTrip.no,
                    from: fromStation,
                    dep: fromStop[1],
                    to: toStation,
                    arr: toStop[1]
                }],
                dep: fromStop[1],
                arr: toStop[1]
            });
        }

        const transferStations = new Set(
            firstTrip.stops
                .slice(fromIndex + 1)
                .map(([station]) => station)
        );
        transferStations.forEach((transferStation) => {
            const transferIndex = findStopIndexAfter(firstTrip.stops, transferStation, fromIndex);
            const transferArrival = firstTrip.stops[transferIndex][1];
            const nextTrips = stationIndex.get(transferStation) || [];

            nextTrips.forEach(({ trip: secondTrip, index: transferDepartureIndex }) => {
                if (secondTrip === firstTrip) return;
                if (secondTrip.line === firstTrip.line) return;
                const transferDeparture = secondTrip.stops[transferDepartureIndex][1];
                if (transferDeparture < transferArrival + transferMin) return;

                const destinationIndex = findStopIndexAfter(
                    secondTrip.stops,
                    toStation,
                    transferDepartureIndex
                );
                if (destinationIndex === -1) return;

                const destination = secondTrip.stops[destinationIndex];
                results.push({
                    legs: [
                        {
                            line: firstTrip.line,
                            no: firstTrip.no,
                            from: fromStation,
                            dep: fromStop[1],
                            to: transferStation,
                            arr: transferArrival
                        },
                        {
                            line: secondTrip.line,
                            no: secondTrip.no,
                            from: transferStation,
                            dep: transferDeparture,
                            to: toStation,
                            arr: destination[1]
                        }
                    ],
                    dep: fromStop[1],
                    arr: destination[1]
                });
            });
        });
    });

    return results;
}

function findTrips(trips, fromStation, toStation, deadlineMin, transferMin) {
    return collectTrips(trips, fromStation, toStation, transferMin)
        .filter((trip) => trip.arr <= deadlineMin)
        .sort((first, second) => second.dep - first.dep || first.arr - second.arr)
        .slice(0, 3);
}

function findTripOptions(
    trips,
    fromStation,
    toStation,
    arriveMin,
    transferMin,
    lastWalkMin = 0,
    slackMin = 0
) {
    const uniqueTrips = new Map();
    collectTrips(trips, fromStation, toStation, transferMin).forEach((trip) => {
        const firstLeg = trip.legs[0];
        const key = `${firstLeg.no}|${firstLeg.dep}`;
        const previous = uniqueTrips.get(key);
        if (!previous || trip.arr < previous.arr) uniqueTrips.set(key, trip);
    });

    const candidates = [...uniqueTrips.values()].map((trip) => ({
        ...trip,
        arriveDest: trip.arr + lastWalkMin,
        slack: arriveMin - (trip.arr + lastWalkMin)
    }));
    const deadlineMin = arriveMin - slackMin;
    const onTime = candidates
        .filter((trip) => trip.arriveDest <= deadlineMin)
        .sort((first, second) => second.dep - first.dep || first.arr - second.arr);
    if (onTime.length === 0) return [];

    const best = { ...onTime[0], kind: 'best', lateMin: 0 };
    const early = onTime
        .slice(1, 3)
        .map((trip) => ({ ...trip, kind: 'early', lateMin: 0 }));
    const nextCandidate = candidates
        .filter((trip) => trip.dep > best.dep)
        .sort((first, second) => first.dep - second.dep || first.arr - second.arr)[0];
    const next = nextCandidate
        ? [{
            ...nextCandidate,
            kind: nextCandidate.arriveDest <= arriveMin ? 'tight' : 'late',
            lateMin: Math.max(0, nextCandidate.arriveDest - arriveMin)
        }]
        : [];

    return [...early, best, ...next].sort(
        (first, second) => first.dep - second.dep || first.arr - second.arr
    );
}
