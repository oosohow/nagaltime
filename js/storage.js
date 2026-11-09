// localStorage 저장과 불러오기를 담당하는 파일입니다.

const ROUTES_KEY = 'nagalsigan.routes';
const WEEK_KEY = 'nagalsigan.week';
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// 브라우저 저장소는 접근이 차단되거나 데이터가 손상될 수 있어 try/catch로 감쌉니다.

function createEmptyWeek() {
    return DAY_KEYS.reduce((week, dayKey) => {
        week[dayKey] = null;
        return week;
    }, {});
}

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

function saveJson(key, value, fallback) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return value;
    } catch (error) {
        console.warn(`데이터를 저장하지 못했습니다: ${key}`, error);
        return fallback;
    }
}

function loadRoutes() {
    const routes = loadJson(ROUTES_KEY, []);
    return Array.isArray(routes) ? routes : [];
}

function saveRoutes(routes) {
    return saveJson(ROUTES_KEY, routes, []);
}

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

function saveWeek(week) {
    return saveJson(WEEK_KEY, week, createEmptyWeek());
}

function addRoute(route) {
    const routes = loadRoutes();
    const newRoute = { ...route, id: String(Date.now()) };
    routes.push(newRoute);
    saveRoutes(routes);
    return newRoute;
}

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
