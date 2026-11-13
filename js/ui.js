// 화면 표시와 사용자 이벤트를 담당하는 파일입니다.

const UI_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const UI_DAY_LABELS = {
    mon: '월요일',
    tue: '화요일',
    wed: '수요일',
    thu: '목요일',
    fri: '금요일',
    sat: '토요일',
    sun: '일요일'
};
let selectedPlanDayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

function handleIcsDownload() {
    const routes = loadRoutes();
    const week = loadWeek();
    const plans = calcWeek(routes, week, []);
    downloadIcs(buildIcs(plans, routes));
}

function renderPlanError(card, message) {
    const error = document.createElement('p');
    error.className = 'plan-error';
    error.textContent = message;
    card.appendChild(error);
}

function renderTripOptions(card, result, dayKey) {
    if (!result.options || result.options.length === 0) return;

    const options = document.createElement('div');
    options.className = 'trip-options';
    const heading = document.createElement('strong');
    heading.textContent = '탈 열차 선택';
    options.appendChild(heading);

    result.options.forEach((option, index) => {
        const label = document.createElement('label');
        label.className = `trip-option ${option.kind}`;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `trip-choice-${dayKey}`;
        radio.value = option.legs[0].no;
        radio.checked = option.legs[0].no === result.choice;
        radio.addEventListener('change', () => {
            const week = loadWeek();
            week[dayKey] = {
                ...week[dayKey],
                choice: option.legs[0].no
            };
            saveWeek(week);
            renderPlan();
        });

        const firstLeg = option.legs[0];
        const routeText = [`${toHHMM(firstLeg.dep)} ${firstLeg.line}`];
        option.legs.slice(1).forEach((leg) => {
            routeText.push(`${toHHMM(leg.dep)} ${leg.line}`);
        });
        const lastLeg = option.legs[option.legs.length - 1];
        const kindText = option.kind === 'best'
            ? `추천 · 여유 ${option.slack}분`
            : option.kind === 'early'
            ? `여유 ${option.slack}분`
            : option.kind === 'tight'
            ? `빠듯 · 여유 ${option.slack}분`
            : `지각 ${option.lateMin}분`;
        const text = document.createElement('span');
        text.className = 'trip-option-text';
        const route = document.createElement('span');
        route.textContent = `${routeText.join(' → ')} → ${toHHMM(option.arriveDest)} 도착`;
        text.appendChild(route);
        const kind = document.createElement('span');
        kind.className = `trip-option-kind${option.kind === 'best' ? ' recommended' : ''}`;
        kind.textContent = kindText;
        text.appendChild(kind);
        label.append(radio, text);
        options.appendChild(label);
    });
    card.appendChild(options);
}

function renderPlanDetails(card, result, route, dayKey, choiceCard = card) {
    if (route.type === 'trip') {
        const flow = document.createElement('div');
        flow.className = 'trip-flow';

        const lineColors = {
            '1호선': '#0052A4',
            '2호선': '#00A84D',
            '7호선': '#747F00',
            '경의중앙선': '#77C4A3',
            '수인분당선': '#F5A200'
        };
        const addFlowItem = (time, text, type, line = '') => {
            const item = document.createElement('div');
            item.className = `trip-flow-item ${type}`;
            if (line) {
                item.style.setProperty('--line-color', lineColors[line] || '#8B95A1');
            }
            const timeElement = document.createElement('time');
            timeElement.textContent = time;
            const marker = document.createElement('span');
            marker.className = 'trip-flow-marker';
            const textElement = document.createElement('span');
            textElement.className = 'trip-flow-text';
            textElement.textContent = text;
            item.append(timeElement, marker, textElement);
            flow.appendChild(item);
        };

        const firstLeg = result.legs[0];
        addFlowItem(toHHMM(result.depart), '집에서 출발', 'walk');
        addFlowItem(toHHMM(firstLeg.dep), `${firstLeg.from} ${firstLeg.line}`, 'train', firstLeg.line);
        result.legs.forEach((leg, index) => {
            if (index === 0) return;
            const previousLeg = result.legs[index - 1];
            addFlowItem(
                toHHMM(leg.dep),
                `${previousLeg.to} ${toHHMM(leg.dep)} ${leg.line} 환승`,
                'transfer',
                leg.line
            );
        });

        const lastLeg = result.legs[result.legs.length - 1];
        addFlowItem(toHHMM(lastLeg.arr), `${lastLeg.to} 도착`, 'train', lastLeg.line);
        addFlowItem(
            toHHMM(result.arriveEst),
            `목적지 도착 (여유 ${result.slack}분)`,
            'walk'
        );
        card.appendChild(flow);

        renderTripOptions(choiceCard, result, dayKey);
        return;
    }

    const destination = document.createElement('p');
    destination.textContent = `목적지: ${route.name}`;
    card.appendChild(destination);

    const details = [
        ['기상', toHHMM(result.wake), result.prevDay ? '전날' : ''],
        ['출발', toHHMM(result.depart), ''],
        ['탈 열차', toHHMM(result.train), ''],
        ['도착 예상', toHHMM(result.arriveEst), ''],
        ['여유', `${result.slack}분`, result.slack <= route.slackMin + 5 ? '빠듯' : '']
    ];
    details.forEach(([label, value, note]) => {
        const detail = document.createElement('p');
        detail.className = label === '기상' || label === '출발' ? 'key-time' : '';
        detail.textContent = `${label}: ${value}`;
        if (note) {
            const noteElement = document.createElement('span');
            noteElement.className = `status-badge ${note === '빠듯' ? 'tight' : 'prev-day'}`;
            noteElement.textContent = ` (${note})`;
            detail.appendChild(noteElement);
        }
        card.appendChild(detail);
    });
}

function renderPlanCard(dayKey, week, routes, plans) {
    const card = document.createElement('article');
    card.className = 'plan-card today';
    const heading = document.createElement('h3');
    heading.textContent = UI_DAY_LABELS[dayKey];
    heading.className = 'plan-day';
    card.appendChild(heading);

    const dayPlan = week[dayKey];
    const route = dayPlan && routes.find((item) => item.id === dayPlan.routeId);
    if (!dayPlan) {
        card.classList.add('not-going');
        const message = document.createElement('p');
        message.textContent = '안 감';
        card.appendChild(message);
        return card;
    }

    const result = plans[dayKey];
    if (!route || !result.ok) {
        renderPlanError(card, result ? result.message : '경로를 찾을 수 없습니다.');
        return card;
    }

    const main = document.createElement('div');
    main.className = 'selected-plan-main';
    const choices = document.createElement('div');
    choices.className = 'selected-plan-choices';

    const planSummary = document.createElement('p');
    planSummary.className = 'plan-summary';
    planSummary.textContent = `${UI_DAY_LABELS[dayKey]} · ${route.name} ${dayPlan.arrive} 도착`;
    main.append(planSummary);

    const keyTimes = document.createElement('div');
    keyTimes.className = 'key-times';
    [
        ['일어나기', result.wake],
        ['출발', result.depart]
    ].forEach(([label, minute]) => {
        const time = document.createElement('p');
        time.className = label === '출발' ? 'key-time accent' : 'key-time';
        time.textContent = `${label} ${toHHMM(minute)}`;
        keyTimes.appendChild(time);
    });
    main.appendChild(keyTimes);
    const firstLeg = result.legs && result.legs[0];
    const hint = document.createElement('p');
    hint.className = 'plan-hint';
    const timingHint = result.kind === 'late'
        ? `${result.lateMin}분 늦게 도착해요`
        : result.kind === 'tight' ? '빠듯하게' : '여유 있게';
    hint.textContent = route.type === 'trip' && firstLeg
        ? `${toHHMM(result.depart)}에 나가면 ${toHHMM(result.train)} ${firstLeg.from} ${firstLeg.line}을 ${timingHint}`
        : `${toHHMM(result.depart)}에 나가면 ${toHHMM(result.train)} 열차를 ${timingHint}`;
    main.appendChild(hint);
    renderPlanDetails(main, result, route, dayKey, choices);
    card.replaceChildren(main, choices);
    return card;
}

function renderPlan() {
    const tabs = document.getElementById('day-tabs');
    const selectedPlan = document.getElementById('selected-plan');
    const alarmList = document.getElementById('alarm-list');
    const calendarButton = document.getElementById('download-ics');
    const routes = loadRoutes();
    const week = loadWeek();
    const plans = calcWeek(routes, week, []);
    if (!UI_DAY_KEYS.includes(selectedPlanDayKey)) selectedPlanDayKey = UI_DAY_KEYS[0];

    tabs.replaceChildren();
    UI_DAY_KEYS.forEach((dayKey) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `day-tab${dayKey === selectedPlanDayKey ? ' active' : ''}`;
        tab.textContent = UI_DAY_LABELS[dayKey].slice(0, 1);
        tab.setAttribute('aria-selected', dayKey === selectedPlanDayKey ? 'true' : 'false');
        if (!week[dayKey]) tab.classList.add('not-going');
        tab.addEventListener('click', () => {
            selectedPlanDayKey = dayKey;
            renderPlan();
        });
        tabs.appendChild(tab);
    });

    selectedPlan.replaceChildren();
    selectedPlan.appendChild(renderPlanCard(selectedPlanDayKey, week, routes, plans));
    selectedPlan.appendChild(alarmList);
    calendarButton.textContent = '이번 주 알람을 캘린더로 보내기';
    calendarButton.disabled = !UI_DAY_KEYS.some((dayKey) => plans[dayKey] && plans[dayKey].ok);
    selectedPlan.appendChild(calendarButton);
    renderAlarmList(routes, week, plans, selectedPlanDayKey);
}

function renderAlarmList(routes, week, plans, dayKey) {
    const list = document.getElementById('alarm-list');
    list.replaceChildren();

    const dayPlan = week[dayKey];
    const route = dayPlan && routes.find((item) => item.id === dayPlan.routeId);
    const result = plans[dayKey];
    if (!dayPlan || !route || !result || !result.ok) {
        const empty = document.createElement('p');
        empty.textContent = '이 요일은 일정이 없어요';
        list.appendChild(empty);
        return;
    }

    const firstLeg = result.legs && result.legs[0];
    const summary = document.createElement('p');
    summary.className = 'alarm-summary';
    summary.textContent = route.type === 'trip' && firstLeg
        ? `${UI_DAY_LABELS[dayKey]} · ${toHHMM(result.train)} ${firstLeg.from} ${firstLeg.line} → ${dayPlan.arrive} 도착`
        : `${UI_DAY_LABELS[dayKey]} · ${toHHMM(result.train)} 열차 → ${dayPlan.arrive} 도착`;
    list.appendChild(summary);
    [
        ['기상', result.wake],
        ['출발 알림', result.alert],
        ['출발', result.depart]
    ].sort((first, second) => first[1] - second[1]).forEach(([name, minute]) => {
        const alarm = document.createElement('p');
        alarm.className = 'alarm-item';
        alarm.textContent = `${toHHMM(minute)} ${name}`;
        list.appendChild(alarm);
    });
}

function clearErrors() {
    document.querySelectorAll('.field-error').forEach((element) => {
        element.textContent = '';
    });
}

function showError(id, message) {
    document.getElementById(id).textContent = message;
}

function showPanel(panelId) {
    document.querySelectorAll('.panel-tab').forEach((tab) => {
        const active = tab.dataset.panel === panelId;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.panel-body').forEach((panel) => {
        panel.hidden = panel.id !== panelId;
    });
}

function renderRoutes() {
    const list = document.getElementById('routes-list');
    const routes = loadRoutes();
    if (routes.length === 0) showPanel('route-registration');
    list.replaceChildren();
    routes.forEach((route) => {
        const card = document.createElement('article');
        const title = document.createElement('h3');
        title.textContent = route.name;
        const detail = document.createElement('p');
        detail.textContent = route.type === 'trip'
            ? `${route.fromStation} → ${route.toStation} (열차 추천)`
            : route.type === 'custom'
            ? `직접 입력: ${route.customTimes.join(', ')}`
            : '예전 경로 형식 · 다시 등록 필요';
        const timings = document.createElement('p');
        timings.textContent = route.type === 'trip'
            ? `출발역까지 ${route.walkMin}분 · 마지막 도보 ${route.lastWalkMin}분 · 준비 ${route.prepMin}분 · 여유 ${route.slackMin}분`
            : route.type === 'custom'
            ? `걷기 ${route.walkMin}분 · 이동 ${route.rideMin}분 · 준비 ${route.prepMin}분 · 여유 ${route.slackMin}분`
            : '이 경로를 삭제하고 새로 등록해 주세요.';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = '삭제';
        deleteButton.addEventListener('click', () => {
            deleteRoute(route.id);
            renderRoutes();
            renderWeekInputs();
            renderPlan();
        });
        card.append(title, detail, timings, deleteButton);
        list.appendChild(card);
    });
}

function renderWeekInputs() {
    const container = document.getElementById('week-inputs');
    const emptyMessage = document.getElementById('week-empty-message');
    const routes = loadRoutes();
    const week = loadWeek();

    container.replaceChildren();
    emptyMessage.hidden = routes.length > 0;
    if (routes.length === 0) return;

    UI_DAY_KEYS.forEach((dayKey) => {
        const row = document.createElement('div');
        row.className = 'week-row';

        const label = document.createElement('label');
        label.textContent = UI_DAY_LABELS[dayKey];

        let routeSelect = null;
        if (routes.length > 1) {
            routeSelect = document.createElement('select');
            routeSelect.id = `week-route-${dayKey}`;
            routeSelect.appendChild(new Option('안 감', ''));
            routes.forEach((route) => {
                routeSelect.appendChild(new Option(route.name, route.id));
            });
        }

        const arriveInput = document.createElement('input');
        arriveInput.type = 'time';
        arriveInput.id = `week-arrive-${dayKey}`;

        const savedPlan = week[dayKey];
        if (routeSelect) routeSelect.value = savedPlan ? savedPlan.routeId : '';
        arriveInput.value = savedPlan ? savedPlan.arrive : '';

        const saveDay = () => {
            const nextWeek = loadWeek();
            const routeId = routeSelect ? routeSelect.value : routes[0].id;
            const hasPlan = routeSelect
                ? routeSelect.value && arriveInput.value
                : arriveInput.value;
            nextWeek[dayKey] = hasPlan
                ? { routeId, arrive: arriveInput.value }
                : null;
            saveWeek(nextWeek);
            renderPlan();
        };

        if (routeSelect) routeSelect.addEventListener('change', saveDay);
        arriveInput.addEventListener('change', saveDay);
        row.append(label);
        if (routeSelect) row.appendChild(routeSelect);
        row.appendChild(arriveInput);
        container.appendChild(row);
    });
}

function getTripStationNames() {
    const stations = new Set();
    ['weekday', 'holiday'].forEach((dayType) => {
        (TRIPS[dayType] || []).forEach((trip) => {
            trip.stops.forEach(([station]) => stations.add(station));
        });
    });
    return [...stations].sort();
}

function toggleRouteTypeFields() {
    const isTrip = document.getElementById('route-type').value === 'trip';
    document.getElementById('custom-fields').hidden = isTrip;
    document.getElementById('trip-fields').hidden = !isTrip;
}

function readTripNumber(inputId, errorId, label) {
    return readNonNegativeNumber(inputId, errorId, label);
}

function readNonNegativeNumber(inputId, errorId, label) {
    const rawValue = document.getElementById(inputId).value.trim();
    const value = Number(rawValue);
    if (!rawValue || !Number.isFinite(value) || value < 0) {
        showError(errorId, `${label}은(는) 0 이상의 숫자여야 합니다.`);
        return null;
    }
    return value;
}

function handleRouteSubmit(event) {
    event.preventDefault();
    clearErrors();
    const routeType = document.getElementById('route-type').value;
    const name = document.getElementById('route-name').value.trim();
    let valid = true;

    if (!name) {
        showError('name-error', '이름을 입력해 주세요.');
        valid = false;
    }
    let customTimes = null;
    if (routeType === 'custom') {
        const parsed = parseTimeList(document.getElementById('custom-times-input').value);
        if (!parsed.ok) {
            showError('custom-times-error', parsed.message);
            valid = false;
        } else {
            customTimes = parsed.value.map((minute) => toHHMM(minute));
        }
    }

    const values = [
        ['walk-min', 'walk-error', '걷는 시간'],
        ['ride-min', 'ride-error', '탑승 후 이동 시간'],
        ['prep-min', 'prep-error', '준비 시간'],
        ['slack-min', 'slack-error', '최소 여유']
    ].map(([inputId, errorId, label]) => routeType === 'custom'
        ? readNonNegativeNumber(inputId, errorId, label)
        : 0);
    if (routeType === 'custom' && values.some((value) => value === null)) valid = false;

    let tripValues = null;
    if (routeType === 'trip') {
        const tripFrom = document.getElementById('trip-from').value.trim();
        const tripTo = document.getElementById('trip-to').value.trim();
        const tripStations = getTripStationNames();
        if (!tripStations.includes(tripFrom)) {
            showError('trip-from-error', '출발역을 목록에서 선택해 주세요.');
            valid = false;
        }
        if (!tripStations.includes(tripTo)) {
            showError('trip-to-error', '도착역을 목록에서 선택해 주세요.');
            valid = false;
        }
        tripValues = [
            ['trip-walk-min', 'trip-walk-error', '집에서 출발역까지 시간'],
            ['trip-last-walk-min', 'trip-last-walk-error', '도착역에서 목적지까지 시간'],
            ['trip-prep-min', 'trip-prep-error', '일어나서 나가기까지 시간'],
            ['trip-slack-min', 'trip-slack-error', '최소 여유'],
            ['trip-transfer-min', 'trip-transfer-error', '환승 시간']
        ].map(([inputId, errorId, label]) => readTripNumber(inputId, errorId, label));
        if (tripValues.some((value) => value === null)) valid = false;
    }
    if (!valid) return;

    const route = routeType === 'trip'
        ? {
            name,
            type: 'trip',
            fromStation: document.getElementById('trip-from').value.trim(),
            toStation: document.getElementById('trip-to').value.trim(),
            walkMin: tripValues[0],
            lastWalkMin: tripValues[1],
            prepMin: tripValues[2],
            slackMin: tripValues[3],
            transferMin: tripValues[4]
        }
        : {
            name,
            type: 'custom',
            walkMin: values[0],
            rideMin: values[1],
            prepMin: values[2],
            slackMin: values[3],
            customTimes
        };
    addRoute(route);
    event.target.reset();
    document.getElementById('prep-min').value = 60;
    document.getElementById('slack-min').value = 10;
    document.getElementById('route-type').value = 'trip';
    toggleRouteTypeFields();
    renderRoutes();
    renderWeekInputs();
    renderPlan();
    showPanel('week-registration');
}

function bindRouteEvents() {
    const stationList = document.getElementById('trip-stations');
    getTripStationNames().forEach((station) => {
        stationList.appendChild(new Option(station, station));
    });
    document.getElementById('route-type').addEventListener('change', toggleRouteTypeFields);
    document.getElementById('route-form').addEventListener('submit', handleRouteSubmit);
    document.getElementById('download-ics').addEventListener('click', handleIcsDownload);
    document.querySelectorAll('.panel-tab').forEach((tab) => {
        tab.addEventListener('click', () => showPanel(tab.dataset.panel));
    });
    showPanel('week-registration');
    toggleRouteTypeFields();
    renderRoutes();
    renderWeekInputs();
    renderPlan();
}

bindRouteEvents();
