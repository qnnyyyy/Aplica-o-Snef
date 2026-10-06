const errorMessage = document.getElementById('error-message')
const modal = document.getElementById('success-modal')
const successTitle = document.getElementById('success-title')
const successText = document.getElementById('success-text')
const btnOk = document.getElementById('btn-ok')


document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.classList.remove('active')
            p.style.display = 'none'
        })

        btn.classList.add('active')
        const painel = document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`)
        painel.classList.add('active')
        painel.style.display = 'block'

        errorMessage.style.display = 'none'
    })
})


const locationSearch = document.getElementById('location-search')
const locationSearchId = document.getElementById('location-search-id')
const locationSuggestions = document.getElementById('location-suggestions')

let allLocations = []

function normalizar(str) {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function distanciaLevenshtein(a, b) {
    const m = a.length, n = b.length
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
        }
    }
    return dp[m][n]
}

function buscarLocalizacoes(texto) {
    const q = normalizar(texto)
    if (!q) return allLocations.slice(0, 8)

    return allLocations
        .map(loc => {
            const nome = normalizar(loc.name)
            if (nome.includes(q)) return { ...loc, score: -1 }

            const palavras = nome.split(' ')
            const score = Math.min(distanciaLevenshtein(q, nome), ...palavras.map(p => distanciaLevenshtein(q, p)))
            return { ...loc, score }
        })
        .filter(loc => loc.score <= Math.max(2, Math.ceil(q.length * 0.4)))
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
}

function renderizarSugestoes(lista) {
    if (lista.length === 0) {
        locationSuggestions.innerHTML = '<div class="suggestion-empty">Nenhuma localidade encontrada</div>'
    } else {
        locationSuggestions.innerHTML = lista.map(loc => `
            <div class="suggestion-item" data-id="${loc.id}" data-name="${loc.name}">${loc.name}</div>
        `).join('')

        locationSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                locationSearch.value = item.dataset.name
                locationSearchId.value = item.dataset.id
                locationSuggestions.classList.remove('open')
            })
        })
    }

    locationSuggestions.classList.add('open')
}

locationSearch.addEventListener('input', () => {
    locationSearchId.value = ''
    renderizarSugestoes(buscarLocalizacoes(locationSearch.value))
})

locationSearch.addEventListener('focus', () => {
    renderizarSugestoes(buscarLocalizacoes(locationSearch.value))
})

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) {
        locationSuggestions.classList.remove('open')
    }
})

async function carregarLocalizacoes() {
    try {
        const res = await fetch('/api/auth/locations')
        const data = await res.json()

        if (data.status === 'success') {
            allLocations = data.data
            locationSearch.placeholder = allLocations.length ? 'Digite o nome da estação...' : 'Nenhuma localidade cadastrada ainda'
        }
    } catch {
        locationSearch.placeholder = 'Erro ao carregar localidades'
    }
}


const form = document.getElementById('register-form')
const confirmationKeyInput = document.getElementById('confirmation-key')
const locationNameInput = document.getElementById('location-name')

const groupLocationSelect = document.getElementById('group-location-select')
const groupLocationName = document.getElementById('group-location-name')
const groupConfirmationKey = document.getElementById('group-confirmation-key')
const approvalHint = document.getElementById('approval-hint')

function atualizarCamposPorTipo() {
    const tipo = document.querySelector('input[name="account-type"]:checked')?.value || 'viewer'

    groupLocationSelect.style.display = tipo === 'owner' ? 'none' : 'block'
    groupLocationName.style.display = tipo === 'owner' ? 'block' : 'none'
    groupConfirmationKey.style.display = tipo === 'viewer' ? 'none' : 'block'
    approvalHint.style.display = tipo === 'owner' ? 'none' : 'block'

    confirmationKeyInput.placeholder = tipo === 'owner'
        ? 'Chave de Dono fornecida pela SNEF'
        : 'Chave fornecida pela SNEF'
}

document.querySelectorAll('input[name="account-type"]').forEach(radio => {
    radio.addEventListener('change', atualizarCamposPorTipo)
})

function showError(msg) {
    errorMessage.textContent = msg
    errorMessage.style.display = 'block'
}

function showSuccess(title, text) {
    successTitle.textContent = title
    successText.textContent = text
    modal.style.display = 'block'
}

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorMessage.style.display = 'none'

    const name = document.getElementById('name').value.trim()
    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value
    const confirm = document.getElementById('confirm-password').value
    const confirmationKey = confirmationKeyInput.value
    const accountType = document.querySelector('input[name="account-type"]:checked')?.value || 'viewer'

    if (password !== confirm) {
        showError('As senhas não coincidem')
        return
    }

    try {
        let res, data

        if (accountType === 'owner') {
            const locationName = locationNameInput.value.trim()

            if (!locationName) {
                showError('Digite o nome da localidade')
                return
            }

            res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, locationName, confirmationKey })
            })
            data = await res.json()

            if (!res.ok) {
                showError(data.message || 'Erro no cadastro')
                return
            }

            showSuccess('Sucesso!', 'Sua localidade foi criada. Clique abaixo para acessar o sistema.')
        } else {
            if (!locationSearchId.value) {
                showError('Selecione a estação/localidade na lista')
                return
            }

            res = await fetch('/api/auth/request-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role: accountType, tenantId: locationSearchId.value, confirmationKey })
            })
            data = await res.json()

            if (!res.ok) {
                showError(data.message || 'Erro no cadastro')
                return
            }

            showSuccess('Cadastro enviado!', 'Seu pedido foi encaminhado para aprovação do responsável pela localidade. Você receberá um e-mail quando for aprovado.')
        }
    } catch (err) {
        showError('Erro de conexão com o servidor')
    }
})


const ownerForm = document.getElementById('owner-location-form')

ownerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorMessage.style.display = 'none'

    const email = document.getElementById('owner-email').value.trim()
    const password = document.getElementById('owner-password').value
    const confirmationKey = document.getElementById('owner-key').value
    const locationName = document.getElementById('owner-location-name').value.trim()

    try {
        const res = await fetch('/api/auth/register-owner-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, locationName, confirmationKey })
        })
        const data = await res.json()

        if (!res.ok) {
            showError(data.message || 'Erro ao criar localidade')
            return
        }

        localStorage.setItem('token', data.token)
        localStorage.setItem('role', data.user.role)
        window.location.href = 'index.html'
    } catch (err) {
        showError('Erro de conexão com o servidor')
    }
})

btnOk.addEventListener('click', () => {
    window.location.href = 'login.html'
})

carregarLocalizacoes()
atualizarCamposPorTipo()
