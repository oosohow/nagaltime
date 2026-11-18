// localStorage 저장과 불러오기를 담당하는 파일입니다.

const ROUTES_KEY = 'nagalsigan.routes';
const WEEK_KEY = 'nagalsigan.week';

// 브라우저 저장소는 접근이 차단되거나 데이터가 손상될 수 있어 try/catch로 감쌉니다.

// 모든 요일이 "안 감"(null)인 빈 요일 계획을 만듭니다.
function createEmptyWeek() {
    return DAY_KEYS.reduce((week, dayKey) => {
        week[dayKey] = null;
        return week;
    }, {});
}

// 저장소에서 JSON 값을 읽고, 없거나 깨졌으면 기본값을 돌려줍니다.
function loadJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) return fallback;
        return JSON.parse(value);
    } catch (error) {
        console.warn(`저장된 데이터를 불러오지 못했습니다: ${key}`, error);
        return fallback;
    }
}

// 값을 JSON으로 저장하고, 저장에 실패하면 기본값을 돌려줍니다.
function saveJson(key, value, fallback) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return value;
    } catch (error) {
        console.warn(`데이터를 저장하지 못했습니다: ${key}`, error);
        return fallback;
    }
}

// 저장된 경로 목록을 불러옵니다.
function loadRoutes() {
    const routes = loadJson(ROUTES_KEY, []);
    return Array.isArray(routes) ? routes : [];
}

// 경로 목록을 저장합니다.
function saveRoutes(routes) {
    return saveJson(ROUTES_KEY, routes, []);
}

// 저장된 요일 계획을 불러오고, 빠진 요일은 null로 채웁니다.
function loadWeek() {
    const week = loadJson(WEEK_KEY, createEmptyWeek());
    if (!week || typeof week !== 'object' || Array.isArray(week)) {
        return createEmptyWeek();
    }
    return DAY_KEYS.reduce((result, dayKey) => {
        result[dayKey] = Object.prototype.hasOwnProperty.call(week, dayKey)
            ? week[dayKey]
            : null;
        return result;
    }, {});
}

// 요일 계획을 저장합니다.
function saveWeek(week) {
    return saveJson(WEEK_KEY, week, createEmptyWeek());
}

// 새 경로에 id를 붙여 저장하고 저장한 경로를 돌려줍니다.
function addRoute(route) {
    const routes = loadRoutes();
    const newRoute = { ...route, id: String(Date.now()) };
    routes.push(newRoute);
    saveRoutes(routes);
    return newRoute;
}

// 같은 id로 경로 내용을 바꾸고, 그 경로를 쓰는 요일의 고른 열차(choice)만 지웁니다. id가 없으면 null을 돌려줍니다.
function updateRoute(id, route) {
    const routes = loadRoutes();
    const routeIndex = routes.findIndex((item) => item.id === id);
    if (routeIndex === -1) return null;

    const updatedRoute = { ...route, id };
    routes[routeIndex] = updatedRoute;
    const week = loadWeek();
    DAY_KEYS.forEach((dayKey) => {
        const dayPlan = week[dayKey];
        if (dayPlan && dayPlan.routeId === id
            && Object.prototype.hasOwnProperty.call(dayPlan, 'choice')) {
            const { choice, ...planWithoutChoice } = dayPlan;
            week[dayKey] = planWithoutChoice;
        }
    });
    saveRoutes(routes);
    saveWeek(week);
    return updatedRoute;
}

// 경로를 지우고, 그 경로를 쓰던 요일은 "안 감"으로 바꿉니다.
function deleteRoute(id) {
    const routes = loadRoutes().filter((route) => route.id !== id);
    const week = loadWeek();
    DAY_KEYS.forEach((dayKey) => {
        if (week[dayKey] && week[dayKey].routeId === id) {
            week[dayKey] = null;
        }
    });
    saveRoutes(routes);
    saveWeek(week);
    return { routes, week };
}
