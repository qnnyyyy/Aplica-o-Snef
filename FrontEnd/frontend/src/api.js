const BASE_URL = '';

export async function getDashboardData() {
    const response = await fetch(`${BASE_URL}/api/dashboard`);
    if (!response.ok) {
        throw new Error(`Erro de rede ao buscar dashboard: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (result.status !== 'success') {
        throw new Error(`Erro do servidor ao buscar dashboard: ${result.message}`);
    }
    return result.data;
}

export async function getFilterOptions() {
    const response = await fetch(`${BASE_URL}/api/reports/filters`);
    if (!response.ok) {
        throw new Error(`Erro de rede ao buscar filtros: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (result.status !== 'success') {
        throw new Error(`Erro do servidor ao buscar filtros: ${result.message}`);
    }
    return result.data;
}

export async function getReports(filters) {
    const queryParams = new URLSearchParams(filters).toString();
    
    const url = `${BASE_URL}/api/reports?${queryParams}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Erro de rede ao buscar relatórios: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (result.status !== 'success') {
        throw new Error(`Erro do servidor ao buscar relatórios: ${result.message}`);
    }
    return result.data;
}