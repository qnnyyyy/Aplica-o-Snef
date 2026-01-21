const API_URL_ZONES = '/api/zones';
const API_URL_STATIONS = '/api/stations';
const token = localStorage.getItem('token');

const zoneForm = document.getElementById('zone-form');
const zoneTbody = document.getElementById('zone-tbody');
const stationSelect = document.getElementById('station-select');
const editStationSelect = document.getElementById('edit-station-select');
const editZoneModal = document.getElementById('editZoneModal');
const closeZoneModal = document.getElementById('closeZoneModal');

async function loadInitialData() {
    await Promise.all([loadStations(), listZones()]);
}

async function loadStations() {
    try {
        const res = await fetch(API_URL_STATIONS, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.status === 'success') {
            const options = result.data.map(st => `<option value="${st.id}">${st.name}</option>`).join('');
            const placeholder = '<option value="">Selecione uma Estação</option>';
            stationSelect.innerHTML = placeholder + options;
            editStationSelect.innerHTML = placeholder + options;
        }
    } catch (err) {
        console.error(err);
    }
}

async function listZones() {
    try {
        const res = await fetch(API_URL_ZONES, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.status === 'success') {
            zoneTbody.innerHTML = result.data.map(z => `
                <tr>
                    <td><strong>${z.name}</strong></td>
                    <td>${z.station_name || 'Não vinculada'}</td>
                    <td>
                        <button class="btn-edit" data-id="${z.id}" data-name="${z.name}" data-sid="${z.station_id}">Editar</button>
                        <button class="btn-delete-action" data-id="${z.id}">Excluir</button>
                    </td>
                </tr>
            `).join('');

            document.querySelectorAll('.btn-edit').forEach(btn => {
                btn.onclick = () => {
                    document.getElementById('edit-zone-id').value = btn.dataset.id;
                    document.getElementById('edit-zone-name').value = btn.dataset.name;
                    document.getElementById('edit-station-select').value = btn.dataset.sid;
                    editZoneModal.style.display = 'flex';
                };
            });

            document.querySelectorAll('.btn-delete-action').forEach(btn => {
                btn.onclick = () => deleteZone(btn.dataset.id);
            });
        }
    } catch (err) {
        zoneTbody.innerHTML = '<tr><td colspan="3">Erro ao carregar zonas.</td></tr>';
    }
}

zoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('zone-name').value,
        station_id: document.getElementById('station-select').value
    };
    const res = await fetch(API_URL_ZONES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        zoneForm.reset();
        listZones();
    }
});

document.getElementById('edit-zone-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-zone-id').value;
    const data = {
        name: document.getElementById('edit-zone-name').value,
        station_id: document.getElementById('edit-station-select').value
    };
    const res = await fetch(`${API_URL_ZONES}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        editZoneModal.style.display = 'none';
        listZones();
    }
};

async function deleteZone(id) {
    if (confirm('Deseja realmente excluir esta zona?')) {
        const res = await fetch(`${API_URL_ZONES}/${id}`, { 
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (res.ok) {
            listZones();
        }
    }
}

closeZoneModal.onclick = (e) => {
    e.preventDefault();
    editZoneModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target == editZoneModal) {
        editZoneModal.style.display = 'none';
    }
};

document.addEventListener('DOMContentLoaded', loadInitialData);