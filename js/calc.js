// 열차 선택과 계획 계산을 담당하는 파일입니다.

// 요일 키와 공휴일 여부를 받아 시간표 유형을 반환합니다.
function getDayType(dayKey, isHoliday) {
    if (isHoliday || dayKey === 'sun') return 'sun';
    if (dayKey === 'sat') return 'sat';
    return 'weekday';
}

// 경로와 시간표 유형을 받아 정렬된 열차 시각 분 배열 또는 오류 객체를 반환합니다.
function getTrainTimes(route, dayType) {
    const timeTexts = route && Array.isArray(route.customTimes)
        ? route.customTimes
        : route && TIMETABLE[route.line]
            && TIMETABLE[route.line][route.station]
            && TIMETABLE[route.line][route.station][route.direction]
            && TIMETABLE[route.line][route.station][route.direction][dayType];

    if (!Array.isArray(timeTexts) || timeTexts.length === 0) {
        return { ok: false, message: '이 역의 시간표가 없습니다. 열차 시각을 직접 입력해 주세요.' };
    }

    const trainMins = [];
    for (const timeText of timeTexts) {
        if (typeof timeText !== 'string') {
            return { ok: false, message: '이 역의 시간표가 없습니다. 열차 시각을 직접 입력해 주세요.' };
        }
        const minute = toMin(timeText);
        if (minute === null) {
            return { ok: false, message: '이 역의 시간표가 없습니다. 열차 시각을 직접 입력해 주세요.' };
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

// 경로와 도착 시각, 요일 유형을 받아 하루 이동 계획 또는 오류 객체를 반환합니다.
function calcPlan(route, arriveText, dayType) {
    if (typeof arriveText !== 'string' || toMin(arriveText) === null) {
        return { ok: false, message: '도착 시간을 HH:MM 형식으로 입력해 주세요.' };
    }

    if (route.type === 'trip') {
        return calcTripPlan(route, toMin(arriveText), dayType);
    }

    const fields = ['walkMin', 'rideMin', 'prepMin', 'slackMin'];
    if (!route || fields.some((field) => typeof route[field] !== 'number' || route[field] < 0)) {
        return { ok: false, message: '경로 시간 설정은 0 이상의 숫자여야 합니다.' };
    }

    // 추천 경로와 도착 분, 요일 유형을 받아 추천 열차 계획과 대안 목록을 반환합니다.
    function calcTripPlan(route, arriveMin, dayType) {
        const fields = ['walkMin', 'lastWalkMin', 'prepMin', 'slackMin', 'transferMin'];
        if (fields.some((field) => typeof route[field] !== 'number' || route[field] < 0)) {
            return { ok: false, message: '경로 시간 설정은 0 이상의 숫자여야 합니다.' };
        }

        const trips = dayType === 'weekday' ? TRIPS.weekday : TRIPS.holiday;
        const deadlineMin = arriveMin - route.slackMin - route.lastWalkMin;
        const candidates = findTrips(
            trips,
            route.fromStation,
            route.toStation,
            deadlineMin,
            route.transferMin
        );
        if (candidates.length === 0) {
            return { ok: false, message: '도착 시간에 맞는 열차가 없습니다.' };
        }

        const selected = candidates[0];
        const departRaw = selected.dep - route.walkMin;
        const wakeRaw = departRaw - route.prepMin;
        const alertRaw = departRaw - 10;
        const arriveEstRaw = selected.arr + route.lastWalkMin;
        const normalize = (minute) => (minute < 0 ? minute + 1440 : minute >= 1440 ? minute - 1440 : minute);

        return {
            ok: true,
            train: selected.legs[0].dep,
            depart: normalize(departRaw),
            wake: normalize(wakeRaw),
            alert: normalize(alertRaw),
            arriveEst: normalize(arriveEstRaw),
            slack: arriveMin - arriveEstRaw,
            prevDay: wakeRaw < 0,
            legs: selected.legs,
            alternatives: candidates.slice(1)
        };
    }

    const trainTimes = getTrainTimes(route, dayType);
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
    const normalize = (minute) => (minute < 0 ? minute + 1440 : minute >= 1440 ? minute - 1440 : minute);

    return {
        ok: true,
        train,
        depart: normalize(departRaw),
        wake: normalize(wakeRaw),
        alert: normalize(alertRaw),
        arriveEst: normalize(arriveEstRaw),
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
        results[dayKey] = calcPlan(route, dayPlan.arrive, getDayType(dayKey, holidayList.includes(dayKey)));
    }

    return results;
}

// 열차 데이터와 출발·도착역, 도착 마감, 환승 시간을 받아 가능한 직행·1회 환승 경로를 반환합니다.
function findTrips(trips, fromStation, toStation, deadlineMin, transferMin) {
    const stationIndex = new Map();
    const tripList = Array.isArray(trips) ? trips : [];

    tripList.forEach((trip) => {
        trip.stops.forEach(([station], index) => {
            if (!stationIndex.has(station)) stationIndex.set(station, []);
            stationIndex.get(station).push({ trip, index });
        });
    });

    const fromTrips = stationIndex.get(fromStation) || [];
    const results = [];

    fromTrips.forEach(({ trip: firstTrip, index: fromIndex }) => {
        const fromStop = firstTrip.stops[fromIndex];
        const directToIndex = firstTrip.stops.findIndex(
            ([station], index) => index > fromIndex && station === toStation
        );
        if (directToIndex !== -1) {
            const toStop = firstTrip.stops[directToIndex];
            if (toStop[1] <= deadlineMin) {
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
        }

        const transferStations = new Set(
            firstTrip.stops
                .slice(fromIndex + 1)
                .map(([station]) => station)
        );
        transferStations.forEach((transferStation) => {
            const transferIndex = firstTrip.stops.findIndex(
                ([station], index) => index > fromIndex && station === transferStation
            );
            const transferArrival = firstTrip.stops[transferIndex][1];
            const nextTrips = stationIndex.get(transferStation) || [];

            nextTrips.forEach(({ trip: secondTrip, index: transferDepartureIndex }) => {
                if (secondTrip === firstTrip) return;
                const transferDeparture = secondTrip.stops[transferDepartureIndex][1];
                if (transferDeparture < transferArrival + transferMin) return;

                const destinationIndex = secondTrip.stops.findIndex(
                    ([station], index) => index > transferDepartureIndex && station === toStation
                );
                if (destinationIndex === -1) return;

                const destination = secondTrip.stops[destinationIndex];
                if (destination[1] > deadlineMin) return;

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

    return results
        .sort((first, second) => second.dep - first.dep || second.arr - first.arr)
        .slice(0, 3);
}
