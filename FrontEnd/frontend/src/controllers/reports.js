const API_BASE_URL = '/api';

const elements = {
    btnApply: document.getElementById('btn-apply-filters'),
    tbody: document.getElementById('report-tbody'),
    station: document.getElementById('station-select'),
    zone: document.getElementById('zone-select'),
    camera: document.getElementById('camera-select'),
    table: document.getElementById('results-table'),
    totalIn: document.getElementById('report-total-in'),
    totalOut: document.getElementById('report-total-out'),
    btnExport: document.getElementById('btn-export-full-report'),
    loading: document.getElementById('loading-message')
};

let allZones = [];
let allCameras = [];
let currentReportData = [];

async function carregarFiltros() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_BASE_URL}/reports/filters`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            allZones = result.data.zones || [];
            allCameras = result.data.cameras || [];

            elements.station.innerHTML = '<option value="">Todas as Estações</option>' + 
                (result.data.stations || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');

            atualizarDropdowns(true); 
            
            elements.loading.style.display = 'none';
            elements.btnApply.disabled = false;
        }
    } catch (err) {
        console.error('Erro ao carregar filtros:', err);
        elements.loading.textContent = 'Erro ao carregar filtros';
    }
}

function atualizarDropdowns(resetSelection = false) {
    const stationId = elements.station.value;
    const currentZone = elements.zone.value;
    const currentCam = elements.camera.value;

    const filteredZones = stationId ? allZones.filter(z => z.station_id == stationId) : allZones;
    elements.zone.innerHTML = '<option value="">Todas as Zonas</option>' + 
        filteredZones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
    
    if (!resetSelection && currentZone) elements.zone.value = currentZone;

    const selectedZone = elements.zone.value;
    let filteredCameras = allCameras;

    if (selectedZone) {
        filteredCameras = allCameras.filter(c => c.zone_id == selectedZone);
    } else if (stationId) {
        const validZoneIds = filteredZones.map(z => z.id);
        filteredCameras = allCameras.filter(c => validZoneIds.includes(c.zone_id));
    }

    elements.camera.innerHTML = '<option value="">Todas as Câmeras</option>' + 
        filteredCameras.map(c => `<option value="${c.id}">${c.name} (${c.camera_id || 'N/A'})</option>`).join('');
    
    if (!resetSelection && currentCam) elements.camera.value = currentCam;
}

async function buscarRelatorio() {
    const token = localStorage.getItem('token');
    
    elements.btnApply.disabled = true;
    elements.btnApply.textContent = "Buscando...";

    const params = new URLSearchParams({
        dateStart: document.getElementById('date-start').value || '',
        dateEnd: document.getElementById('date-end').value || '',
        timeStart: document.getElementById('time-start').value || '',
        timeEnd: document.getElementById('time-end').value || '',
        station: elements.station.value || '',
        zone: elements.zone.value || '',
        camera: elements.camera.value || ''
    });

    try {
        const response = await fetch(`${API_BASE_URL}/reports?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            currentReportData = result.data.details || [];
            renderizarTabela(currentReportData);
        } else {
            throw new Error(result.message || 'Erro na resposta do servidor');
        }
    } catch (err) {
        console.error('Erro na busca:', err);
        alert("Erro ao buscar dados: " + err.message);
        elements.tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Erro: ${err.message}</td></tr>`;
    } finally {
        elements.btnApply.disabled = false;
        elements.btnApply.textContent = "Gerar Relatório";
    }
}

function renderizarTabela(dados) {
    elements.table.style.display = dados.length ? 'table' : 'none';
    elements.btnExport.style.display = dados.length ? 'block' : 'none';
    
    let somaIn = 0, somaOut = 0;
    
    if (dados.length === 0) {
        elements.tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999;">Nenhum registro encontrado</td></tr>';
        elements.totalIn.textContent = '0';
        elements.totalOut.textContent = '0';
        return;
    }
    
    elements.tbody.innerHTML = dados.map((row, index) => {
        const valIn = parseInt(row.total_in) || 0;
        const valOut = parseInt(row.total_out) || 0;
        somaIn += valIn;
        somaOut += valOut;
        
        const dataFmt = new Date(row.event_time).toLocaleString('pt-BR');
        
        return `
            <tr>
                <td>${dataFmt}</td>
                <td>${row.station || 'N/A'}</td>
                <td>${row.camera_friendly_name} (${row.camera_serial || 'S/N'})</td>
                <td>${row.zone}</td>
                <td class="direction-IN">${valIn}</td>
                <td class="direction-OUT">${valOut}</td>
                <td><button class="btn-export-row" onclick="exportarLinha(${index})">Exportar</button></td>
            </tr>
        `;
    }).join('');

    elements.totalIn.textContent = somaIn;
    elements.totalOut.textContent = somaOut;
}

elements.station.addEventListener('change', () => atualizarDropdowns(true));
elements.zone.addEventListener('change', () => atualizarDropdowns(false));
elements.btnApply.addEventListener('click', buscarRelatorio);

window.exportarLinha = (index) => {
    const row = currentReportData[index];
    const data = [{
        'Data/Hora': new Date(row.event_time).toLocaleString('pt-BR'),
        'Estação': row.station,
        'Câmera': row.camera_friendly_name,
        'Serial': row.camera_serial,
        'Zona': row.zone,
        'Entradas': row.total_in,
        'Saídas': row.total_out
    }];
    exportarExcel(data, 'Individual');
};

elements.btnExport.addEventListener('click', () => {
    const data = currentReportData.map(row => ({
        'Data/Hora': new Date(row.event_time).toLocaleString('pt-BR'),
        'Estação': row.station,
        'Câmera': row.camera_friendly_name,
        'Serial': row.camera_serial,
        'Zona': row.zone,
        'Entradas': row.total_in,
        'Saídas': row.total_out
    }));
    exportarExcel(data, 'Completo');
});

function exportarExcel(json, prefixo) {
    if (typeof XLSX === 'undefined') {
        alert('Biblioteca XLSX não carregada. Verifique o script.');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(json);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório SNEF");
    XLSX.writeFile(wb, `SNEF_${prefixo}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

document.addEventListener('DOMContentLoaded', carregarFiltros);