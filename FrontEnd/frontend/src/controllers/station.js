const API_URL = '/api/stations';
const token = localStorage.getItem('token');

const stationForm = document.getElementById('station-form');
const editForm = document.getElementById('edit-form');
const tbody = document.getElementById('station-tbody');
const editModal = document.getElementById('editModal');
const closeModal = document.getElementById('closeModal');

async function listStations() {
    try {
        const res = await fetch(API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.status === 'success') {
            tbody.innerHTML = result.data.map(st => `
                <tr>
                    <td><strong>${st.name}</strong></td>
                    <td>${st.location || 'N/A'}</td>
                    <td>
                        <button class="btn-edit" data-id="${st.id}" data-name="${st.name}" data-location="${st.location}">Editar</button>
                        <button class="btn-delete" data-id="${st.id}">Excluir</button>
                    </td>
                </tr>
            `).join('');

            document.querySelectorAll('.btn-edit').forEach(btn => {
                btn.onclick = () => openEditModal(btn.dataset);
            });

            document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.onclick = () => deleteStation(btn.dataset.id);
            });
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar dados.</td></tr>';
    }
}

stationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        location: document.getElementById('location').value
    };
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            stationForm.reset();
            listStations();
        }
    } catch (err) {
        console.error(err);
    }
});

function openEditModal(data) {
    document.getElementById('edit-id').value = data.id;
    document.getElementById('edit-name').value = data.name;
    document.getElementById('edit-location').value = data.location;
    editModal.style.display = 'flex';
}

closeModal.onclick = () => editModal.style.display = 'none';

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const data = {
        name: document.getElementById('edit-name').value,
        location: document.getElementById('edit-location').value
    };

    try {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.status === 'success') {
            editModal.style.display = 'none';
            listStations();
        }
    } catch (err) {
        console.error(err);
    }
});

async function deleteStation(id) {
    if (!confirm('Deseja realmente excluir esta estação?')) return;
    try {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) listStations();
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener('DOMContentLoaded', listStations);