const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const token = localStorage.getItem('token');

document.addEventListener('DOMContentLoaded', loadCameras);

async function loadCameras() {
    try {
        const response = await fetch('/api/cameras', { 
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.status === 'success') {
            renderTable(result.data);
        }
    } catch (err) {
        console.error('Erro ao carregar câmeras:', err);
    }
}

function renderTable(cameras) {
    const tbody = document.getElementById('cameraTbody');
    if (!tbody) return;
    
    tbody.innerHTML = cameras.map(c => `
        <tr>
            <td>${c.camera_id}</td>
            <td>
                <strong>${c.name}</strong><br>
                <small style="color: #666;">Estação: ${c.station_name || 'Não Vinculada'}</small>
            </td>
            <td>${c.zone_name || 'Geral (Sem Zona)'}</td>
            <td>
                <span style="color: ${c.enabled ? '#28a745' : '#dc3545'}; font-weight: bold;">
                    ${c.enabled ? 'Ativa' : 'Inativa'}
                </span>
            </td>
            <td>
                <button class="btn-edit" onclick='prepareModal(${JSON.stringify(c)})'>Editar</button>
            </td>
        </tr>
    `).join('');
}

async function prepareModal(camera) {
    document.getElementById('editId').value = camera.id;
    document.getElementById('editCameraId').value = camera.camera_id;
    document.getElementById('editName').value = camera.name;
    document.getElementById('editLocation').value = camera.location || '';
    document.getElementById('editModel').value = camera.model || '';
    document.getElementById('editEnabled').value = camera.enabled ? "1" : "0";
    
    const zoneSelect = document.getElementById('editZone');
    zoneSelect.innerHTML = '<option value="">Carregando zonas...</option>';

    try {
        const res = await fetch('/api/zones', { 
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        
        let options = '<option value="">-- Câmera Sem Zona (Geral) --</option>';
        if (result.status === 'success') {
            options += result.data.map(z => `
                <option value="${z.id}" ${z.id == camera.zone_id ? 'selected' : ''}>
                    ${z.station_name || 'S/E'} > ${z.name}
                </option>
            `).join('');
        }
        zoneSelect.innerHTML = options;
        zoneSelect.value = camera.zone_id || "";
    } catch (err) {
        zoneSelect.innerHTML = '<option value="">Erro ao carregar zonas</option>';
    }
    
    editModal.style.display = 'flex';
}

editForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const data = {
        name: document.getElementById('editName').value,
        location: document.getElementById('editLocation').value,
        model: document.getElementById('editModel').value,
        enabled: document.getElementById('editEnabled').value === "1",
        zone_id: document.getElementById('editZone').value || null
    };

    try {
        const response = await fetch(`/api/cameras/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            editModal.style.display = 'none';
            loadCameras();
        } else {
            const errData = await response.json();
            alert(errData.message || 'Erro ao salvar');
        }
    } catch (err) {
        alert('Erro na comunicação com o servidor');
    }
};

function closeModal() {
    editModal.style.display = 'none';
}