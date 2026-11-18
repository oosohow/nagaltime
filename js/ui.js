// 화면 표시와 사용자 이벤트를 담당하는 파일입니다.

// 지금 수정 중인 경로의 id (수정 중이 아니면 null)
let editingRouteId = null;

const UI_DAY_LABELS = {
    mon: '월요일',
    tue: '화요일',
    wed: '수요일',
    thu: '목요일',
    fri: '금요일',
    sat: '토요일',
    sun: '일요일'
};
// 계획 화면에서 선택한 요일. 처음에는 오늘 요일 (getDay는 일요일이 0이라 월요일 시작으로 맞춤)
let selectedPlanDayKey = DAY_KEYS[(new Date().getDay() + 6) % 7];

// 저장된 요일 계획을 계산해 캘린더(.ics) 파일로 내려받습니다.
function handleIcsDownload() {
    const routes = loadRoutes();
    const week = loadWeek();
    const plans = calcWeek(routes, week, []);
    downloadIcs(buildIcs(plans, routes));
}

// 계획 카드에 오류 문구 한 줄을 표시합니다.
function renderPlanError(card, message) {
    const error = document.createElement('p');
    error.className = 'plan-error';
    error.textContent = message;
    card.appendChild(error);
}

// 다른 열차 후보(여유·추천·빠듯·지각)를 라디오 목록으로 그리고, 고르면 요일별로 저장합니다.
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
        const kindText = option.kind === 'best'
            ? `추천 · 여유 ${option.slack}분`
            : option.kind === 'early'
            ? `여유 ${option.slack}분`
            : option.kind === 'tight'
            ? `빠듯 · 여유 ${option.slack}분`
            : `지각 ${option.lateMin}분`;
        const text = document.createElement('span');
        text.className = 'trip-option-text';
        const time = document.createElement('span');
        time.className = 'trip-option-time';
        time.textContent = `${toHHMM(firstLeg.dep)} → ${toHHMM(option.arriveDest)} 도착`;
        const legs = document.createElement('span');
        legs.className = 'trip-option-legs';
        legs.textContent = formatLegs(option.legs);
        text.append(time, legs);
        const kind = document.createElement('span');
        kind.className = `trip-option-kind${option.kind === 'best' ? ' recommended' : ''}`;
        kind.textContent = kindText;
        label.append(radio, text, kind);
        options.appendChild(label);
    });
    card.appendChild(options);
}

// 일어나서 목적지 도착까지를 준비·도보·열차·환승·여유 구간 목록(분 단위)으로 나눕니다.
function getTimeSegments(result) {
    const legs = result.legs;
    const lastLeg = legs[legs.length - 1];
    const segments = [
        { type: 'prep', label: '준비', minutes: (result.depart - result.wake + 1440) % 1440 },
        { type: 'walk', label: '도보', minutes: legs[0].dep - result.depart }
    ];
    legs.forEach((leg, index) => {
        if (index > 0) {
            segments.push({ type: 'wait', label: '환승', minutes: leg.dep - legs[index - 1].arr });
        }
        segments.push({ type: 'train', label: leg.line.replace(/^(.*[^호])선$/, '$1'), line: leg.line, minutes: leg.arr - leg.dep });
    });
    segments.push({ type: 'walk', label: '도보', minutes: result.arriveEst - lastLeg.arr });
    segments.push({ type: 'slack', label: '여유', minutes: result.slack });
    return segments.filter((segment) => segment.minutes > 0);
}

// 일어나서 목적지에 도착할 때까지를 준비·도보·열차·환승·여유 길이로 보여 주는 아침 막대를 만듭니다.
function renderTimeBar(result, lineColors) {
    const wrapper = document.createElement('div');
    wrapper.className = 'time-bar-wrap';
    const title = document.createElement('p');
    title.className = 'time-bar-title';
    title.textContent = '일어나서 도착까지';
    const arriveMin = result.arriveEst + result.slack;
    const total = (arriveMin - result.wake + 1440) % 1440;
    const head = document.createElement('p');
    head.className = 'time-bar-head';
    const hours = Math.floor(total / 60);
    const totalText = hours > 0 ? `${hours}시간 ${total % 60}분` : `${total}분`;
    const strong = document.createElement('strong');
    strong.textContent = totalText;
    head.append(strong, ` ${toHHMM(result.wake)} 기상 → ${toHHMM(normalizeMinute(arriveMin))} 도착`);
    if (result.slack < 0) {
        const late = document.createElement('span');
        late.className = 'time-bar-late';
        late.textContent = ` · ${-result.slack}분 늦어요`;
        head.appendChild(late);
    }

    const bar = document.createElement('div');
    bar.className = 'time-bar';
    const labels = document.createElement('div');
    labels.className = 'time-bar-labels';
    getTimeSegments(result).forEach((segment) => {
        const part = document.createElement('span');
        part.className = `time-bar-part ${segment.type}`;
        part.style.flexGrow = segment.minutes;
        if (segment.line) part.style.setProperty('--line-color', lineColors[segment.line] || '#8B95A1');
        part.textContent = `${segment.minutes}분`;
        part.title = `${segment.label} ${segment.minutes}분`;
        bar.appendChild(part);

        const label = document.createElement('span');
        label.className = `time-bar-label ${segment.type}`;
        label.style.flexGrow = segment.minutes;
        if (segment.line) label.style.setProperty('--line-color', lineColors[segment.line] || '#8B95A1');
        label.textContent = segment.label;
        labels.appendChild(label);
    });
    const legend = document.createElement('p');
    legend.className = 'time-bar-legend';
    legend.textContent = '회색은 걷기, 빗금은 환승 대기, 점선은 남는 여유 시간이에요';
    wrapper.append(title, head, bar, labels, legend);
    return wrapper;
}

// 추천 경로면 시간 막대·이동 타임라인·열차 후보를, 직접 입력 경로면 탈 열차·도착 예상·여유를 그립니다.
function renderPlanDetails(card, result, route, dayKey, choiceCard = card) {
    if (route.type === 'trip') {
        const flow = document.createElement('div');
        flow.className = 'trip-flow';

        const lineColors = {
            '1호선': '#0052A4',
            '2호선': '#00A84D',
            '3호선': '#EF7C1C',
            '4호선': '#00A5DE',
            '5호선': '#996CAC',
            '6호선': '#CD7C2F',
            '7호선': '#747F00',
            '8호선': '#E6186C',
            '9호선': '#BDB092',
            '공항철도': '#0090D2',
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
        card.append(renderTimeBar(result, lineColors), flow);

        renderTripOptions(choiceCard, result, dayKey);
        return;
    }

    const details = [
        ['탈 열차', toHHMM(result.train)],
        ['도착 예상', toHHMM(result.arriveEst)],
        ['여유', `${result.slack}분`]
    ];
    details.forEach(([label, value]) => {
        const detail = document.createElement('p');
        detail.className = 'plan-detail';
        detail.textContent = `${label} ${value}`;
        card.appendChild(detail);
    });
}

// 선택한 열차 종류(여유·빠듯·지각)에 맞는 안내 문장을 만듭니다.
function buildPlanHint(result, route) {
    const firstLeg = result.legs && result.legs[0];
    const trainText = route.type === 'trip' && firstLeg
        ? `${toHHMM(result.train)} ${firstLeg.from} ${firstLeg.line}을`
        : `${toHHMM(result.train)} 열차를`;
    if (result.kind === 'late') {
        return `${toHHMM(result.depart)}에 나가면 ${trainText} 타는데 ${result.lateMin}분 늦어요`;
    }
    if (result.kind === 'tight') {
        return `${toHHMM(result.depart)}에 나가면 ${trainText} 탈 수 있지만 빠듯해요`;
    }
    return `${toHHMM(result.depart)}에 나가면 ${trainText} 여유 있게 탈 수 있어요`;
}

// 선택한 요일의 계획 카드(일어나기·출발 시간, 안내 문장, 상세 내용)를 만듭니다.
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
        [result.prevDay ? '일어나기 (전날)' : '일어나기', result.wake],
        ['출발', result.depart]
    ].forEach(([label, minute]) => {
        const time = document.createElement('p');
        time.className = label === '출발' ? 'key-time accent' : 'key-time';
        const labelElement = document.createElement('span');
        labelElement.className = 'key-time-label';
        labelElement.textContent = label;
        const value = document.createElement('span');
        value.textContent = toHHMM(minute);
        time.append(labelElement, value);
        keyTimes.appendChild(time);
    });
    main.appendChild(keyTimes);
    const hint = document.createElement('p');
    hint.className = 'plan-hint';
    hint.textContent = buildPlanHint(result, route);
    main.appendChild(hint);
    renderPlanDetails(main, result, route, dayKey, choices);
    card.replaceChildren(main, choices);
    return card;
}

// 요일 탭, 선택한 요일의 계획, 알람 목록, 캘린더 버튼을 다시 그립니다.
function renderPlan() {
    const tabs = document.getElementById('day-tabs');
    const selectedPlan = document.getElementById('selected-plan');
    const alarmList = document.getElementById('alarm-list');
    const calendarButton = document.getElementById('download-ics');
    const routes = loadRoutes();
    const week = loadWeek();
    const plans = calcWeek(routes, week, []);
    if (!DAY_KEYS.includes(selectedPlanDayKey)) selectedPlanDayKey = DAY_KEYS[0];

    tabs.replaceChildren();
    DAY_KEYS.forEach((dayKey) => {
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
    const plannedDays = DAY_KEYS.filter((dayKey) => plans[dayKey] && plans[dayKey].ok);
    calendarButton.disabled = plannedDays.length === 0;
    calendarButton.textContent = plannedDays.length === 0
        ? '이번 주에 보낼 알람이 없어요'
        : `이번 주 알람을 캘린더로 보내기 (${plannedDays.map((dayKey) => UI_DAY_LABELS[dayKey].slice(0, 1)).join('·')})`;
    selectedPlan.appendChild(calendarButton);
    renderAlarmList(routes, week, plans, selectedPlanDayKey);
}

// 선택한 요일의 기상·출발 알림·출발 시각을 시간순으로 보여 줍니다.
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
        const alarmTime = document.createElement('strong');
        alarmTime.textContent = toHHMM(minute);
        alarm.append(alarmTime, ` ${name}`);
        list.appendChild(alarm);
    });
}

// 경로 등록 폼의 오류 문구를 모두 지웁니다.
function clearErrors() {
    document.querySelectorAll('.field-error').forEach((element) => {
        element.textContent = '';
    });
}

// 입력칸 아래 오류 문구를 표시합니다.
function showError(id, message) {
    document.getElementById(id).textContent = message;
}

// 왼쪽 패널의 탭(요일별 도착 시간 / 경로 등록)을 바꿉니다.
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

// 열차 구간 목록을 '경의중앙선 → 회기 1호선'처럼 짧은 문장으로 만듭니다.
function formatLegs(legs) {
    if (legs.length === 1) return `${legs[0].line} 직행`;
    return legs.map((leg, index) => (index === 0 ? leg.line : `${leg.from} ${leg.line}`)).join(' → ');
}

// 추천 경로의 출발역·환승역·도착역을 한 줄로 만듭니다.
function formatTripRoute(route) {
    return route.viaStation
        ? `${route.fromStation} → ${route.viaStation} 환승 → ${route.toStation}`
        : `${route.fromStation} → ${route.toStation}`;
}

// 저장된 경로 목록을 수정·삭제 버튼과 함께 그립니다.
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
            ? `${formatTripRoute(route)} (열차 추천)`
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
        deleteButton.className = 'secondary danger';
        deleteButton.addEventListener('click', () => {
            if (editingRouteId === route.id) resetRouteForm();
            deleteRoute(route.id);
            renderRoutes();
            renderWeekInputs();
            renderPlan();
        });
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = '수정';
        editButton.className = 'secondary';
        editButton.disabled = route.type !== 'trip' && route.type !== 'custom';
        editButton.addEventListener('click', () => startRouteEdit(route));
        const actions = document.createElement('div');
        actions.className = 'route-actions';
        actions.append(editButton, deleteButton);
        card.append(title, detail, timings, actions);
        list.appendChild(card);
    });
}

// 요일마다 경로 선택칸과 도착 시간 입력칸을 그리고, 바꾸면 바로 저장합니다.
function renderWeekInputs() {
    const container = document.getElementById('week-inputs');
    const emptyMessage = document.getElementById('week-empty-message');
    const routes = loadRoutes();
    const week = loadWeek();

    container.replaceChildren();
    emptyMessage.hidden = routes.length > 0;
    if (routes.length === 0) return;

    DAY_KEYS.forEach((dayKey) => {
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

// 열차 데이터에 있는 모든 역 이름을 가나다순으로 돌려줍니다.
function getTripStationNames() {
    const stations = new Set();
    ['weekday', 'holiday'].forEach((dayType) => {
        (TRIPS[dayType] || []).forEach((trip) => {
            trip.stops.forEach(([station]) => stations.add(station));
        });
    });
    return [...stations].sort();
}

// 등록 방식(열차 추천 / 직접 입력)에 맞는 입력칸만 보여 줍니다.
function toggleRouteTypeFields() {
    const isTrip = document.getElementById('route-type').value === 'trip';
    document.getElementById('custom-fields').hidden = isTrip;
    document.getElementById('trip-fields').hidden = !isTrip;
}

// 숫자 입력칸 값을 읽어 0 이상의 숫자면 돌려주고, 아니면 오류 문구를 표시하고 null을 돌려줍니다.
function readNonNegativeNumber(inputId, errorId, label) {
    const rawValue = document.getElementById(inputId).value.trim();
    const value = Number(rawValue);
    if (!rawValue || !Number.isFinite(value) || value < 0) {
        showError(errorId, `${label}은(는) 0 이상의 숫자여야 합니다.`);
        return null;
    }
    return value;
}

// 경로 등록 폼을 처음 상태로 되돌리고 수정 상태를 끝냅니다.
function resetRouteForm() {
    editingRouteId = null;
    const form = document.getElementById('route-form');
    form.reset();
    document.getElementById('prep-min').value = 60;
    document.getElementById('slack-min').value = 10;
    document.getElementById('route-type').value = 'trip';
    document.getElementById('route-submit').textContent = '저장';
    document.getElementById('route-cancel').hidden = true;
    clearErrors();
    toggleRouteTypeFields();
}

// 저장된 경로 값을 폼에 채워 수정 상태로 바꿉니다.
function startRouteEdit(route) {
    editingRouteId = route.id;
    const form = document.getElementById('route-form');
    document.getElementById('route-name').value = route.name || '';
    document.getElementById('route-type').value = route.type;
    if (route.type === 'trip') {
        document.getElementById('trip-from').value = route.fromStation || '';
        document.getElementById('trip-to').value = route.toStation || '';
        document.getElementById('trip-walk-min').value = route.walkMin;
        document.getElementById('trip-last-walk-min').value = route.lastWalkMin;
        document.getElementById('trip-prep-min').value = route.prepMin;
        document.getElementById('trip-slack-min').value = route.slackMin;
        document.getElementById('trip-transfer-min').value = route.transferMin;
        document.getElementById('trip-via').value = route.viaStation || '';
        if (route.viaStation) document.querySelector('#trip-fields details').open = true;
    } else {
        document.getElementById('custom-times-input').value = route.customTimes.join(', ');
        document.getElementById('walk-min').value = route.walkMin;
        document.getElementById('ride-min').value = route.rideMin;
        document.getElementById('prep-min').value = route.prepMin;
        document.getElementById('slack-min').value = route.slackMin;
    }
    document.getElementById('route-submit').textContent = '수정 저장';
    document.getElementById('route-cancel').hidden = false;
    clearErrors();
    toggleRouteTypeFields();
    showPanel('route-registration');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 경로 폼 값을 검사해 새로 저장하거나(등록) 기존 경로를 바꿉니다(수정).
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
    let tripFrom = null;
    let tripTo = null;
    let tripVia = '';
    if (routeType === 'trip') {
        const tripStations = getTripStationNames();
        tripFrom = resolveStationName(document.getElementById('trip-from').value, tripStations);
        tripTo = resolveStationName(document.getElementById('trip-to').value, tripStations);
        const viaText = document.getElementById('trip-via').value.trim();
        tripVia = viaText ? resolveStationName(viaText, tripStations) : '';
        if (!tripFrom) {
            showError('trip-from-error', '출발역을 목록에서 선택해 주세요.');
            valid = false;
        }
        if (!tripTo) {
            showError('trip-to-error', '도착역을 목록에서 선택해 주세요.');
            valid = false;
        }
        if (tripVia === null) {
            showError('trip-via-error', '환승역을 목록에서 선택하거나 비워 두세요.');
            valid = false;
        } else if (tripVia && (tripVia === tripFrom || tripVia === tripTo)) {
            showError('trip-via-error', '환승역은 출발역·도착역과 달라야 합니다.');
            valid = false;
        }
        tripValues = [
            ['trip-walk-min', 'trip-walk-error', '집에서 출발역까지 시간'],
            ['trip-last-walk-min', 'trip-last-walk-error', '도착역에서 목적지까지 시간'],
            ['trip-prep-min', 'trip-prep-error', '일어나서 나가기까지 시간'],
            ['trip-slack-min', 'trip-slack-error', '최소 여유'],
            ['trip-transfer-min', 'trip-transfer-error', '환승 시간']
        ].map(([inputId, errorId, label]) => readNonNegativeNumber(inputId, errorId, label));
        if (tripValues.some((value) => value === null)) valid = false;
    }
    if (!valid) return;

    const route = routeType === 'trip'
        ? {
            name,
            type: 'trip',
            fromStation: tripFrom,
            toStation: tripTo,
            walkMin: tripValues[0],
            lastWalkMin: tripValues[1],
            prepMin: tripValues[2],
            slackMin: tripValues[3],
            transferMin: tripValues[4],
            viaStation: tripVia
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
    if (editingRouteId) updateRoute(editingRouteId, route);
    else addRoute(route);
    resetRouteForm();
    renderRoutes();
    renderWeekInputs();
    renderPlan();
    showPanel('week-registration');
}

// 시간·숫자 입력칸에 커서가 있을 때 마우스 휠을 굴리면 값이 바뀌지 않고 화면만 스크롤되게 합니다.
function preventWheelChange(event) {
    const input = event.target;
    if (input instanceof HTMLInputElement
        && (input.type === 'time' || input.type === 'number')
        && document.activeElement === input) {
        input.blur();
    }
}

// 역 목록을 채우고 버튼·폼 이벤트를 연결한 뒤 처음 화면을 그립니다.
function bindRouteEvents() {
    document.addEventListener('wheel', preventWheelChange, { passive: true });
    const stationList = document.getElementById('trip-stations');
    getTripStationNames().forEach((station) => {
        stationList.appendChild(new Option(station, station));
    });
    document.getElementById('route-type').addEventListener('change', toggleRouteTypeFields);
    document.getElementById('route-form').addEventListener('submit', handleRouteSubmit);
    document.getElementById('route-cancel').addEventListener('click', () => {
        resetRouteForm();
        renderRoutes();
        renderWeekInputs();
        renderPlan();
    });
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

if (document.getElementById('route-form')) bindRouteEvents();
