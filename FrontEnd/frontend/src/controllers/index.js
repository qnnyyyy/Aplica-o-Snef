const token = localStorage.getItem('token');
const API_BASE_URL = '/api';

let currentEvents = [];
let eventFilter = 'ALL'; 
let currentTenant = null;

async function loadTenantInfo() {
    try {
        const res = await fetch(`${API_BASE_URL}/tenant-info`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            currentTenant = result.data.tenant;
            document.title = `SNEF - ${currentTenant.name}`;
            
            const tenantNameElement = document.getElementById('tenant-name');
            if (tenantNameElement) {
                tenantNameElement.textContent = currentTenant.name;
            }
        }
    } catch (err) {
        console.error('Erro ao carregar info do tenant:', err);
    }
}

async function updateDashboard() {
    try {
        const filterEl = document.getElementById('camera-filter');
        const cameraId = (filterEl && filterEl.value) ? filterEl.value : 'all';
        
        const res = await fetch(`${API_BASE_URL}/dashboard?camera_id=${cameraId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.status === 'success') {
            const { totalIn, totalOut, latestEvents, cameraStatus, availableCameras } = result.data;
            
            currentEvents = latestEvents.map(e => ({
                event_time: e.event_time || e.received_at,
                camera: e.camera || e.camera_name,
                total_in: Number(e.total_in ?? e.countIn ?? 0),
                total_out: Number(e.total_out ?? e.countOut ?? 0)
            }));

            if (filterEl && filterEl.options.length <= 1 && availableCameras) {
                filterEl.innerHTML = '<option value="all">TODAS AS CÂMERAS</option>';
                availableCameras.forEach(cam => {
                    const opt = document.createElement('option');
                    opt.value = cam.id;
                    opt.textContent = cam.name;
                    filterEl.appendChild(opt);
                });
            }

            document.getElementById('total-in').innerText = totalIn;
            document.getElementById('total-out').innerText = totalOut;

            renderEvents();

            const statusList = document.getElementById('camera-status-list');
            if (statusList) {
                statusList.innerHTML = cameraStatus.map(cam => {
                    const color = cam.status === 'online' ? '#28a745' : '#dc3545';
                    return `<li>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong>${cam.name}</strong>
                            <span style="color:${color}; font-size:10px;">● ${cam.status.toUpperCase()}</span>
                        </div>
                    </li>`;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Erro ao atualizar dashboard:', err);
    }
}

function renderEvents() {
    const container = document.getElementById('latest-events');
    if (!container) return;

    setupEventFilterButtons();

    let filtered = [];
    if (eventFilter === 'ALL') {
        filtered = currentEvents;
    } else if (eventFilter === 'IN') {
        filtered = currentEvents.filter(e => e.total_in > 0);
    } else if (eventFilter === 'OUT') {
        filtered = currentEvents.filter(e => e.total_out > 0);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<li style="text-align:center; color:#999; padding:20px;">Nenhum registro encontrado.</li>';
        return;
    }

    container.innerHTML = filtered.map(event => {
        const time = new Date(event.event_time).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        let displayLines = '';
        if (event.total_in > 0 && (eventFilter === 'ALL' || eventFilter === 'IN')) {
            displayLines += `<span style="font-weight:bold; color:#28a745;">↑ ENTRADA (${event.total_in})</span>`;
        }
        if (event.total_out > 0 && (eventFilter === 'ALL' || eventFilter === 'OUT')) {
            if (displayLines) displayLines += ' | ';
            displayLines += `<span style="font-weight:bold; color:#dc3545;">↓ SAÍDA (${event.total_out})</span>`;
        }

        return `<li>
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 2px 0;">
                <span><strong>${time}</strong> - ${event.camera}</span>
                <div style="text-align: right;">${displayLines}</div>
            </div>
        </li>`;
    }).join('');
}

function setupEventFilterButtons() {
    const header = document.getElementById('latest-events-header');
    if (!header || document.getElementById('event-filter-group')) return;

    const btnGroup = document.createElement('div');
    btnGroup.id = 'event-filter-group';
    btnGroup.innerHTML = `
        <button onclick="setEventFilter('ALL')" class="event-filter-btn active" id="btn-all">T</button>
        <button onclick="setEventFilter('IN')" class="event-filter-btn" id="btn-in">IN</button>
        <button onclick="setEventFilter('OUT')" class="event-filter-btn" id="btn-out">OUT</button>
    `;
    header.appendChild(btnGroup);
}

window.setEventFilter = (type) => {
    eventFilter = type;
    document.querySelectorAll('.event-filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeId = type === 'ALL' ? 'btn-all' : (type === 'IN' ? 'btn-in' : 'btn-out');
    const activeBtn = document.getElementById(activeId);
    if (activeBtn) activeBtn.classList.add('active');
    renderEvents();
};

async function loadUsersInTenant() {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/tenant-users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            const usersList = document.getElementById('tenant-users-list');
            if (usersList) {
                usersList.innerHTML = result.data.map(user => `
                    <tr>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td>${new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Erro ao carregar usuários do tenant:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadTenantInfo();
    updateDashboard();
    
    const filterEl = document.getElementById('camera-filter');
    if (filterEl) filterEl.addEventListener('change', updateDashboard);
    
    const usersTab = document.getElementById('users-tab');
    if (usersTab) {
        usersTab.addEventListener('click', loadUsersInTenant);
    }
    
    const inviteForm = document.getElementById('invite-form');
    if (inviteForm) {
        inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('invite-email').value;
            const role = document.getElementById('invite-role').value;
            
            try {
                const res = await fetch(`${API_BASE_URL}/auth/invite`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, role })
                });
                
                const result = await res.json();
                
                if (result.status === 'success') {
                    alert('Convite enviado com sucesso!');
                    inviteForm.reset();
                } else {
                    alert(result.message || 'Erro ao enviar convite');
                }
            } catch (err) {
                alert('Erro ao enviar convite');
            }
        });
    }
    
    setInterval(updateDashboard, 15000);
});