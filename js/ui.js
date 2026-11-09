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
let selectedAlarmDayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

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

function renderPlanDetails(card, result, route) {
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
        detail.textContent = `${label}: ${value}`;
        if (note) {
            const noteElement = document.createElement('span');
            noteElement.className = note === '빠듯' ? 'tight' : 'prev-day';
            noteElement.textContent = ` (${note})`;
            detail.appendChild(noteElement);
        }
        card.appendChild(detail);
    });
}

function renderPlanCard(dayKey, todayKey, week, routes, plans) {
    const card = document.createElement('article');
    card.className = `plan-card${dayKey === todayKey ? ' today' : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = UI_DAY_LABELS[dayKey];
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

    renderPlanDetails(card, result, route);
    return card;
}

function renderPlan() {
    const grid = document.getElementById('plan-grid');
    const routes = loadRoutes();
    const week = loadWeek();
    const plans = calcWeek(routes, week, []);
    const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

    grid.replaceChildren();
    UI_DAY_KEYS.forEach((dayKey) => {
        grid.appendChild(renderPlanCard(dayKey, todayKey, week, routes, plans));
    });
    renderAlarmList(routes, week, plans);
}

function renderAlarmList(routes, week, plans) {
    const tabs = document.getElementById('alarm-tabs');
    const list = document.getElementById('alarm-list');
    tabs.replaceChildren();
    list.replaceChildren();

    UI_DAY_KEYS.forEach((dayKey) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = UI_DAY_LABELS[dayKey];
        tab.className = `alarm-tab${dayKey === selectedAlarmDayKey ? ' active' : ''}`;
        tab.setAttribute('aria-selected', dayKey === selectedAlarmDayKey ? 'true' : 'false');
        tab.addEventListener('click', () => {
            selectedAlarmDayKey = dayKey;
            renderAlarmList(routes, week, plans);
        });
        tabs.appendChild(tab);
    });

    const dayPlan = week[selectedAlarmDayKey];
    const route = dayPlan && routes.find((item) => item.id === dayPlan.routeId);
    const result = plans[selectedAlarmDayKey];
    if (!dayPlan || !route || !result || !result.ok) {
        const empty = document.createElement('p');
        empty.textContent = '알람 없음';
        list.appendChild(empty);
        return;
    }

    const alarmLabel = `${toHHMM(result.train)} 열차 · ${dayPlan.arrive} 도착`;
    [
        ['기상', result.wake],
        ['출발 알림', result.alert],
        ['출발', result.depart]
    ].sort((first, second) => first[1] - second[1]).forEach(([name, minute]) => {
        const alarm = document.createElement('p');
        alarm.className = 'alarm-item';
        alarm.textContent = `${toHHMM(minute)} ${name} · ${alarmLabel}`;
        list.appendChild(alarm);
    });
}

function setOptions(select, values, placeholder) {
    select.replaceChildren();
    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = placeholder;
    select.appendChild(firstOption);
    values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
    select.disabled = values.length === 0;
}

function clearErrors() {
    document.querySelectorAll('.field-error').forEach((element) => {
        element.textContent = '';
    });
}

function showError(id, message) {
    document.getElementById(id).textContent = message;
}

function renderRoutes() {
    const list = document.getElementById('routes-list');
    list.replaceChildren();
    loadRoutes().forEach((route) => {
        const card = document.createElement('article');
        const title = document.createElement('h3');
        title.textContent = route.name;
        const detail = document.createElement('p');
        detail.textContent = route.customTimes
            ? `직접 입력: ${route.customTimes.join(', ')}`
            : `${route.line} · ${route.station} · ${route.direction}`;
        const timings = document.createElement('p');
        timings.textContent =
            `걷기 ${route.walkMin}분 · 이동 ${route.rideMin}분 · 준비 ${route.prepMin}분 · 여유 ${route.slackMin}분`;
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

        const routeSelect = document.createElement('select');
        routeSelect.id = `week-route-${dayKey}`;
        routeSelect.appendChild(new Option('안 감', ''));
        routes.forEach((route) => {
            routeSelect.appendChild(new Option(route.name, route.id));
        });

        const arriveInput = document.createElement('input');
        arriveInput.type = 'time';
        arriveInput.id = `week-arrive-${dayKey}`;

        const savedPlan = week[dayKey];
        routeSelect.value = savedPlan ? savedPlan.routeId : '';
        arriveInput.value = savedPlan ? savedPlan.arrive : '';

        const saveDay = () => {
            const nextWeek = loadWeek();
            nextWeek[dayKey] = routeSelect.value
                ? { routeId: routeSelect.value, arrive: arriveInput.value }
                : null;
            saveWeek(nextWeek);
            renderPlan();
        };

        routeSelect.addEventListener('change', saveDay);
        arriveInput.addEventListener('change', saveDay);
        row.append(label, routeSelect, arriveInput);
        container.appendChild(row);
    });
}

function updateStationOptions() {
    const line = document.getElementById('route-line').value;
    const stationSelect = document.getElementById('route-station');
    const directionSelect = document.getElementById('route-direction');
    setOptions(stationSelect, line ? getStations(line) : [], '역을 선택하세요');
    setOptions(directionSelect, [], '방향을 선택하세요');
}

function updateDirectionOptions() {
    const line = document.getElementById('route-line').value;
    const station = document.getElementById('route-station').value;
    setOptions(
        document.getElementById('route-direction'),
        line && station ? getDirections(line, station) : [],
        '방향을 선택하세요'
    );
}

function toggleCustomTimes() {
    const checked = document.getElementById('custom-times').checked;
    document.getElementById('timetable-fields').hidden = checked;
    document.getElementById('custom-times-field').hidden = !checked;
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
    const custom = document.getElementById('custom-times').checked;
    const name = document.getElementById('route-name').value.trim();
    const line = document.getElementById('route-line').value;
    const station = document.getElementById('route-station').value;
    const direction = document.getElementById('route-direction').value;
    let valid = true;

    if (!name) {
        showError('name-error', '이름을 입력해 주세요.');
        valid = false;
    }
    if (!custom && !line) {
        showError('line-error', '노선을 선택해 주세요.');
        valid = false;
    }
    if (!custom && !station) {
        showError('station-error', '역을 선택해 주세요.');
        valid = false;
    }
    if (!custom && !direction) {
        showError('direction-error', '방향을 선택해 주세요.');
        valid = false;
    }

    let customTimes = null;
    if (custom) {
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
    ].map(([inputId, errorId, label]) => readNonNegativeNumber(inputId, errorId, label));
    if (values.some((value) => value === null)) valid = false;
    if (!valid) return;

    addRoute({
        name,
        line: custom ? null : line,
        station: custom ? null : station,
        direction: custom ? null : direction,
        walkMin: values[0],
        rideMin: values[1],
        prepMin: values[2],
        slackMin: values[3],
        customTimes
    });
    event.target.reset();
    document.getElementById('prep-min').value = 60;
    document.getElementById('slack-min').value = 10;
    setOptions(document.getElementById('route-station'), [], '역을 선택하세요');
    setOptions(document.getElementById('route-direction'), [], '방향을 선택하세요');
    toggleCustomTimes();
    renderRoutes();
    renderWeekInputs();
    renderPlan();
}

function bindRouteEvents() {
    setOptions(document.getElementById('route-line'), getLines(), '노선을 선택하세요');
    setOptions(document.getElementById('route-station'), [], '역을 선택하세요');
    setOptions(document.getElementById('route-direction'), [], '방향을 선택하세요');
    document.getElementById('route-line').addEventListener('change', updateStationOptions);
    document.getElementById('route-station').addEventListener('change', updateDirectionOptions);
    document.getElementById('custom-times').addEventListener('change', toggleCustomTimes);
    document.getElementById('route-form').addEventListener('submit', handleRouteSubmit);
    document.getElementById('download-ics').addEventListener('click', handleIcsDownload);
    toggleCustomTimes();
    renderRoutes();
    renderWeekInputs();
    renderPlan();
}

bindRouteEvents();
