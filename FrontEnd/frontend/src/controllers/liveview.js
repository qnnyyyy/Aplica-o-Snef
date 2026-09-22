const API_BASE_URL = '/api'
const token = localStorage.getItem('token')

const els = {
    list: document.getElementById('camera-list'),
    empty: document.getElementById('empty-state'),
    filterZone: document.getElementById('filter-zone'),
    filterCamera: document.getElementById('filter-camera'),
    filterIp: document.getElementById('filter-ip'),
    modal: document.getElementById('viewModal'),
    modalTitle: document.getElementById('modal-title'),
    snapshotBox: document.getElementById('snapshot-box'),
    snapshotImg: document.getElementById('snapshot-img'),
    snapshotPlaceholder: document.getElementById('snapshot-placeholder'),
    form: document.getElementById('liveForm'),
    feedback: document.getElementById('modal-feedback'),
    btnSyncTime: document.getElementById('btn-sync-time'),
    btnCloseModal: document.getElementById('btn-close-modal')
}

let allCameras = []
let allZones = []
let snapshotTimer = null
let lastObjectUrl = null
let activeCameraId = null

async function apiGet(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.json()
}

async function init() {
    try {
        const [camerasRes, zonesRes] = await Promise.all([
            apiGet('/cameras'),
            apiGet('/zones')
        ])

        allCameras = camerasRes.status === 'success' ? camerasRes.data : []
        allZones = zonesRes.status === 'success' ? zonesRes.data : []

        updateZoneOptions()
        updateCameraOptions()
        renderList()
    } catch (err) {
        els.list.innerHTML = ''
        els.empty.style.display = 'block'
        els.empty.textContent = 'Erro ao carregar câmeras.'
    }
}

function updateZoneOptions() {
    els.filterZone.innerHTML = '<option value="">Todas as Zonas</option>' +
        allZones.map(z => `<option value="${z.id}">${z.name}</option>`).join('')
}

function updateCameraOptions() {
    const zoneId = els.filterZone.value

    const filtered = zoneId
        ? allCameras.filter(c => String(c.zone_id) === zoneId)
        : allCameras

    els.filterCamera.innerHTML = '<option value="">Todas as Câmeras</option>' +
        filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
}

function getFilteredCameras() {
    const zoneId = els.filterZone.value
    const cameraId = els.filterCamera.value
    const ipQuery = els.filterIp.value.trim().toLowerCase()

    return allCameras.filter(c => {
        if (zoneId && String(c.zone_id) !== zoneId) return false
        if (cameraId && String(c.id) !== cameraId) return false
        if (ipQuery && !(c.location || '').toLowerCase().includes(ipQuery)) return false
        return true
    })
}

function renderList() {
    const cameras = getFilteredCameras()

    if (cameras.length === 0) {
        els.list.innerHTML = ''
        els.empty.style.display = 'block'
        return
    }

    els.empty.style.display = 'none'

    els.list.innerHTML = cameras.map(c => `
        <div class="camera-row">
            <div class="info">
                <strong>${c.name}</strong>
                <small>IP: ${c.location || 'N/A'} ${c.zone_name ? '· ' + c.zone_name : ''}</small>
            </div>
            <button class="btn-view" data-id="${c.id}">View</button>
        </div>
    `).join('')

    els.list.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => openModal(Number(btn.dataset.id)))
    })
}

function openModal(cameraId) {
    const camera = allCameras.find(c => c.id === cameraId)
    if (!camera) return

    activeCameraId = cameraId
    els.modalTitle.textContent = `Live View — ${camera.name}`

    document.getElementById('editId').value = camera.id
    document.getElementById('editName').value = camera.name || ''
    document.getElementById('editOsd').value = camera.osd_text || ''
    document.getElementById('editIp').value = camera.location || ''
    document.getElementById('editUser').value = camera.camera_user || ''
    document.getElementById('editPassword').value = ''

    clearFeedback()
    els.modal.style.display = 'flex'

    startSnapshotLoop(cameraId)
}

function closeModal() {
    els.modal.style.display = 'none'
    stopSnapshotLoop()
    activeCameraId = null
}

function startSnapshotLoop(cameraId) {
    stopSnapshotLoop()
    refreshSnapshot(cameraId)
    snapshotTimer = setInterval(() => refreshSnapshot(cameraId), 1500)
}

function stopSnapshotLoop() {
    if (snapshotTimer) {
        clearInterval(snapshotTimer)
        snapshotTimer = null
    }
    if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl)
        lastObjectUrl = null
    }
}

async function refreshSnapshot(cameraId) {
    try {
        const res = await fetch(`${API_BASE_URL}/cameras/${cameraId}/snapshot`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!res.ok) throw new Error('offline')

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)

        if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl)
        lastObjectUrl = url

        els.snapshotImg.src = url
        els.snapshotImg.style.display = 'block'
        els.snapshotPlaceholder.style.display = 'none'
    } catch (err) {
        els.snapshotImg.style.display = 'none'
        els.snapshotPlaceholder.style.display = 'block'
        els.snapshotPlaceholder.textContent = 'Câmera offline ou inacessível.'
    }
}

function showFeedback(message, ok) {
    els.feedback.textContent = message
    els.feedback.className = ok ? 'ok' : 'err'
}

function clearFeedback() {
    els.feedback.textContent = ''
    els.feedback.className = ''
}

els.form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!activeCameraId) return

    const body = {
        name: document.getElementById('editName').value.trim(),
        osd_text: document.getElementById('editOsd').value.trim(),
        location: document.getElementById('editIp').value.trim(),
        camera_user: document.getElementById('editUser').value.trim(),
        camera_password: document.getElementById('editPassword').value
    }

    try {
        const res = await fetch(`${API_BASE_URL}/cameras/${activeCameraId}/live-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        })
        const result = await res.json()

        if (!res.ok) {
            showFeedback(result.message || 'Erro ao salvar', false)
            return
        }

        showFeedback(result.message, true)
        await init()
    } catch (err) {
        showFeedback('Erro ao comunicar com o servidor.', false)
    }
})

els.btnSyncTime.addEventListener('click', async () => {
    if (!activeCameraId) return

    try {
        const res = await fetch(`${API_BASE_URL}/cameras/${activeCameraId}/sync-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ datetime: new Date().toISOString() })
        })
        const result = await res.json()
        showFeedback(result.message, result.synced !== false)
    } catch (err) {
        showFeedback('Erro ao comunicar com o servidor.', false)
    }
})

els.btnCloseModal.addEventListener('click', closeModal)
els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal()
})

els.filterZone.addEventListener('change', () => {
    updateCameraOptions()
    renderList()
})
els.filterCamera.addEventListener('change', renderList)
els.filterIp.addEventListener('input', renderList)

document.addEventListener('DOMContentLoaded', init)
