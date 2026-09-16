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
    exportToolbar: document.getElementById('export-toolbar'),
    btnExport: document.getElementById('btn-export-full-report'),
    btnExportSelected: document.getElementById('btn-export-selected'),
    selectedCount: document.getElementById('selected-count'),
    checkAll: document.getElementById('check-all'),
    loading: document.getElementById('loading-message')
};

let allZones = [];
let allCameras = [];
let currentReportData = [];
let selectedRows = new Set();

const CORES = { primaria: '368D6D', entradas: '28a745', saidas: 'dc3545' };

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
    elements.exportToolbar.style.display = dados.length ? 'flex' : 'none';

    selectedRows.clear();
    atualizarBarraSelecao();

    let somaIn = 0, somaOut = 0;

    if (dados.length === 0) {
        elements.tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999;">Nenhum registro encontrado</td></tr>';
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
            <tr data-index="${index}">
                <td><input type="checkbox" class="row-check" data-index="${index}"></td>
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

    elements.checkAll.checked = false;
    elements.checkAll.indeterminate = false;

    elements.tbody.querySelectorAll('.row-check').forEach(chk => {
        chk.addEventListener('change', () => {
            const idx = Number(chk.dataset.index);
            if (chk.checked) selectedRows.add(idx);
            else selectedRows.delete(idx);
            chk.closest('tr').classList.toggle('row-selected', chk.checked);
            atualizarBarraSelecao();
        });
    });
}

function atualizarBarraSelecao() {
    const total = currentReportData.length;
    const selecionados = selectedRows.size;

    elements.selectedCount.textContent = selecionados;
    elements.btnExportSelected.disabled = selecionados === 0;

    if (elements.checkAll) {
        elements.checkAll.checked = total > 0 && selecionados === total;
        elements.checkAll.indeterminate = selecionados > 0 && selecionados < total;
    }
}

elements.checkAll.addEventListener('change', () => {
    const marcar = elements.checkAll.checked;
    selectedRows.clear();

    elements.tbody.querySelectorAll('.row-check').forEach(chk => {
        chk.checked = marcar;
        chk.closest('tr').classList.toggle('row-selected', marcar);
        if (marcar) selectedRows.add(Number(chk.dataset.index));
    });

    atualizarBarraSelecao();
});

elements.station.addEventListener('change', () => atualizarDropdowns(true));
elements.zone.addEventListener('change', () => atualizarDropdowns(false));
elements.btnApply.addEventListener('click', buscarRelatorio);

function mapearLinha(row) {
    return {
        dataHora: new Date(row.event_time).toLocaleString('pt-BR'),
        estacao: row.station || 'N/A',
        camera: row.camera_friendly_name,
        serial: row.camera_serial || 'S/N',
        zona: row.zone,
        entradas: parseInt(row.total_in) || 0,
        saidas: parseInt(row.total_out) || 0
    };
}

window.exportarLinha = (index) => {
    exportarExcel([mapearLinha(currentReportData[index])], 'Individual');
};

elements.btnExport.addEventListener('click', () => {
    exportarExcel(currentReportData.map(mapearLinha), 'Completo');
});

elements.btnExportSelected.addEventListener('click', () => {
    const linhas = [...selectedRows].sort((a, b) => a - b).map(i => mapearLinha(currentReportData[i]));
    exportarExcel(linhas, 'Selecionados');
});

async function gerarGraficoBuffer(json) {
    const porCamera = new Map();
    json.forEach(row => {
        const atual = porCamera.get(row.camera) || { entradas: 0, saidas: 0 };
        atual.entradas += row.entradas;
        atual.saidas += row.saidas;
        porCamera.set(row.camera, atual);
    });

    const labels = [...porCamera.keys()];
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 380;

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Entradas', data: labels.map(l => porCamera.get(l).entradas), backgroundColor: `#${CORES.entradas}` },
                { label: 'Saídas', data: labels.map(l => porCamera.get(l).saidas), backgroundColor: `#${CORES.saidas}` }
            ]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: { title: { display: true, text: 'Entradas x Saídas por Câmera' } },
            scales: { y: { beginAtZero: true } }
        }
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    const dataUrl = canvas.toDataURL('image/png');
    chart.destroy();

    return dataUrl;
}

async function exportarExcel(json, prefixo) {
    if (typeof ExcelJS === 'undefined') {
        alert('Biblioteca de exportação não carregada. Verifique sua conexão e tente novamente.');
        return;
    }

    if (!json.length) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SNEF';
    wb.created = new Date();

    const ws = wb.addWorksheet('Relatório SNEF', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    ws.columns = [
        { header: 'Data/Hora', key: 'dataHora', width: 20 },
        { header: 'Estação', key: 'estacao', width: 18 },
        { header: 'Câmera', key: 'camera', width: 26 },
        { header: 'Serial', key: 'serial', width: 16 },
        { header: 'Zona', key: 'zona', width: 18 },
        { header: 'Entradas', key: 'entradas', width: 12 },
        { header: 'Saídas', key: 'saidas', width: 12 }
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CORES.primaria}` } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    ws.addRows(json);

    let somaIn = 0, somaOut = 0;

    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        somaIn += row.getCell('entradas').value;
        somaOut += row.getCell('saidas').value;

        const zebra = rowNumber % 2 === 0;

        row.eachCell({ includeEmpty: true }, cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
            };
            if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7F9' } };
        });

        row.getCell('entradas').font = { color: { argb: `FF${CORES.entradas}` }, bold: true };
        row.getCell('saidas').font = { color: { argb: `FF${CORES.saidas}` }, bold: true };
        row.getCell('entradas').alignment = { horizontal: 'center' };
        row.getCell('saidas').alignment = { horizontal: 'center' };
    });

    ws.autoFilter = { from: 'A1', to: 'G1' };

    const totalRow = ws.addRow({ dataHora: '', estacao: '', camera: '', serial: '', zona: 'TOTAL', entradas: somaIn, saidas: somaOut });
    totalRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
        cell.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
    });

    try {
        const imageBase64 = await gerarGraficoBuffer(json);
        const imageId = wb.addImage({ base64: imageBase64, extension: 'png' });
        ws.addImage(imageId, {
            tl: { col: 0, row: ws.rowCount + 2 },
            ext: { width: 500, height: 250 }
        });
    } catch (err) {
        console.warn('Não foi possível gerar o gráfico no Excel:', err);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `SNEF_${prefixo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', carregarFiltros);