const TIMEOUT_MS = 5000

function buildAuthHeader(user, password) {
    if (!user) return {}
    const token = Buffer.from(`${user}:${password || ''}`).toString('base64')
    return { Authorization: `Basic ${token}` }
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        return await fetch(url, { ...options, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

async function fetchSnapshot(camera, password) {
    const url = `http://${camera.location}/cgi-bin/viewer/video.jpg`

    const res = await fetchWithTimeout(url, {
        headers: buildAuthHeader(camera.camera_user, password)
    })

    if (!res.ok) {
        throw new Error(`Câmera respondeu HTTP ${res.status}`)
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, contentType: res.headers.get('content-type') || 'image/jpeg' }
}

async function setOsdText(camera, password, text) {
    const params = new URLSearchParams({ videoin_c0_text: text || '' })
    const url = `http://${camera.location}/cgi-bin/admin/setparam.cgi?${params}`

    const res = await fetchWithTimeout(url, {
        headers: buildAuthHeader(camera.camera_user, password)
    })

    if (!res.ok) {
        throw new Error(`Câmera respondeu HTTP ${res.status}`)
    }

    return true
}

async function syncDateTime(camera, password, date = new Date()) {
    const params = new URLSearchParams({
        system_time_year: date.getFullYear(),
        system_time_month: date.getMonth() + 1,
        system_time_day: date.getDate(),
        system_time_hour: date.getHours(),
        system_time_minute: date.getMinutes(),
        system_time_second: date.getSeconds()
    })
    const url = `http://${camera.location}/cgi-bin/admin/setparam.cgi?${params}`

    const res = await fetchWithTimeout(url, {
        headers: buildAuthHeader(camera.camera_user, password)
    })

    if (!res.ok) {
        throw new Error(`Câmera respondeu HTTP ${res.status}`)
    }

    return true
}

module.exports = { fetchSnapshot, setOsdText, syncDateTime }
