const API_BASE_URL = '/api';
let lineChart, barChart;
let lastFetchedData = [];

let allStations = [];
let allZones = [];
let allCameras = [];

const elements = {
    dateStart: document.getElementById('date-start'),
    dateEnd: document.getElementById('date-end'),
    station: document.getElementById('station-select'),
    zone: document.getElementById('zone-select'),
    camera: document.getElementById('camera-select'),
    btnUpdate: document.getElementById('btn-update'),
    rankType: document.getElementById('rank-type')
};

async function fetchChartData() {
    const filters = {
        dateStart: elements.dateStart.value,
        dateEnd: elements.dateEnd.value,
        camera: elements.camera.value,
        station: elements.station.value,
        zone: elements.zone.value
    };

    const params = new URLSearchParams(filters);

    try {
        const response = await fetch(`${API_BASE_URL}/reports?${params}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        lastFetchedData = (result.data && result.data.details) ? result.data.details : [];
        return lastFetchedData;
    } catch (err) {
        console.error("Erro ao carregar dados dos gráficos:", err);
        return [];
    }
}

function updateZoneDropdown() {
    const stationId = elements.station.value;
    elements.zone.innerHTML = '<option value="">TODAS AS ZONAS</option>';
    elements.camera.innerHTML = '<option value="all">TODAS CÂMERAS</option>';

    const filteredZones = stationId 
        ? allZones.filter(z => z.station_id == stationId) 
        : allZones;

    filteredZones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z.id;
        opt.textContent = z.name.toUpperCase();
        elements.zone.appendChild(opt);
    });

    updateCameraDropdown();
}

function updateCameraDropdown() {
    const stationId = elements.station.value;
    const zoneId = elements.zone.value;
    elements.camera.innerHTML = '<option value="all">TODAS CÂMERAS</option>';

    let filteredCameras = allCameras;

    if (zoneId) {
        filteredCameras = allCameras.filter(c => c.zone_id == zoneId);
    } else if (stationId) {
        const zoneIdsForStation = allZones
            .filter(z => z.station_id == stationId)
            .map(z => z.id);
        filteredCameras = allCameras.filter(c => zoneIdsForStation.includes(c.zone_id));
    }

    filteredCameras.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name.toUpperCase();
        elements.camera.appendChild(opt);
    });
}

function renderCharts(data) {
    if (lineChart) lineChart.destroy();
    if (barChart) barChart.destroy();

    const hourlyIn = Array(24).fill(0);
    const hourlyOut = Array(24).fill(0);
    const cameraMap = {};
    const rankType = elements.rankType.value;

    data.forEach(d => {
        const dateObj = new Date(d.event_time);
        if (!isNaN(dateObj)) {
            const hour = dateObj.getHours();
            hourlyIn[hour] += (Number(d.total_in) || 0);
            hourlyOut[hour] += (Number(d.total_out) || 0);
            
            const name = d.camera_friendly_name || "Câmera S/N";
            if (!cameraMap[name]) cameraMap[name] = { in: 0, out: 0 };
            cameraMap[name].in += (Number(d.total_in) || 0);
            cameraMap[name].out += (Number(d.total_out) || 0);
        }
    });

    const ctxLine = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}h`),
            datasets: [
                { 
                    label: 'Entradas (IN)', 
                    data: hourlyIn, 
                    borderColor: '#368D6D', 
                    backgroundColor: '#368D6D22', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#368D6D'
                },
                { 
                    label: 'Saídas (OUT)', 
                    data: hourlyOut, 
                    borderColor: '#D9534F', 
                    backgroundColor: '#D9534F22', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#D9534F'
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: { 
                y: { beginAtZero: true, grid: { color: '#eee' } },
                x: { grid: { display: false } }
            }
        }
    });

    const cameraLabels = Object.keys(cameraMap);
    const barValues = cameraLabels.map(name => rankType === 'in' ? cameraMap[name].in : cameraMap[name].out);

    const ctxBar = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: cameraLabels,
            datasets: [{ 
                label: rankType === 'in' ? 'Total Entradas' : 'Total Saídas', 
                data: barValues, 
                backgroundColor: rankType === 'in' ? '#368D6D' : '#D9534F',
                borderRadius: 4
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            indexAxis: 'y',
            plugins: { 
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: '#eee' } },
                y: { grid: { display: false } }
            }
        }
    });
}

elements.btnUpdate.addEventListener('click', async () => {
    const data = await fetchChartData();
    renderCharts(data);
});

elements.rankType.addEventListener('change', () => {
    if (lastFetchedData.length > 0) renderCharts(lastFetchedData);
});

elements.station.addEventListener('change', updateZoneDropdown);
elements.zone.addEventListener('change', updateCameraDropdown);

async function init() {
    const hoje = new Date().toISOString().split('T')[0];
    elements.dateStart.value = hoje;
    elements.dateEnd.value = hoje;

    try {
        const resp = await fetch(`${API_BASE_URL}/reports/filters`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await resp.json();
        
        if (result.status === 'success') {
            allStations = result.data.stations || [];
            allZones = result.data.zones || [];
            allCameras = result.data.cameras || [];

            allStations.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name.toUpperCase();
                elements.station.appendChild(opt);
            });

            updateZoneDropdown();
        }
    } catch (e) {
        console.error("Erro ao carregar filtros iniciais", e);
    }

    const data = await fetchChartData();
    renderCharts(data);
}

init();