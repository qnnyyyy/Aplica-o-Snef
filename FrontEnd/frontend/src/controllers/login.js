const form = document.getElementById('login-form')
const errorMessage = document.getElementById('error-message')
const accountModal = document.getElementById('account-modal')
const accountList = document.getElementById('account-list')
const accountSearch = document.getElementById('account-search')
const accountEmpty = document.getElementById('account-empty')

const SEARCH_THRESHOLD = 6
let currentAccounts = []
let selectionTokenAtual = null

function entrarComToken(data) {
    localStorage.setItem('token', data.token)
    localStorage.setItem('role', data.user?.role || 'viewer')
    window.location.href = 'index.html'
}

form.addEventListener('submit', async (e) => {
    e.preventDefault()

    errorMessage.style.display = 'none'

    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value

    try {
        const res = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })

        const data = await res.json()

        if (!res.ok) {
            errorMessage.textContent = data.message || 'Login inválido'
            errorMessage.style.display = 'block'
            return
        }

        if (data.status === 'select_account') {
            mostrarSelecaoDeConta(data)
            return
        }

        entrarComToken(data)

    } catch (err) {
        errorMessage.textContent = 'Erro ao conectar com o servidor'
        errorMessage.style.display = 'block'
    }
})

function mostrarSelecaoDeConta(data) {
    currentAccounts = data.accounts
    selectionTokenAtual = data.selectionToken

    accountSearch.style.display = currentAccounts.length > SEARCH_THRESHOLD ? 'block' : 'none'
    accountSearch.value = ''

    renderizarContas(currentAccounts)
    accountModal.style.display = 'flex'

    if (accountSearch.style.display === 'block') {
        setTimeout(() => accountSearch.focus(), 50)
    }
}

function renderizarContas(accounts) {
    accountEmpty.style.display = accounts.length === 0 ? 'block' : 'none'

    accountList.innerHTML = accounts.map(acc => `
        <button type="button" class="account-option" data-id="${acc.id}">
            <strong>${acc.tenant_name}</strong>
            <span>${acc.role === 'admin' ? 'Admin' : 'Usuário'}</span>
        </button>
    `).join('')

    accountList.querySelectorAll('.account-option').forEach(btn => {
        btn.addEventListener('click', () => escolherConta(selectionTokenAtual, btn.dataset.id))
    })
}

let selectionTokenAtual = null

accountSearch.addEventListener('input', () => {
    const termo = accountSearch.value.trim().toLowerCase()
    const filtradas = termo
        ? currentAccounts.filter(acc => acc.tenant_name.toLowerCase().includes(termo))
        : currentAccounts
    renderizarContas(filtradas)
})

async function escolherConta(selectionToken, accountId) {
    try {
        const res = await fetch('http://localhost:3000/api/auth/login/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectionToken, accountId })
        })

        const data = await res.json()

        if (!res.ok) {
            accountModal.style.display = 'none'
            errorMessage.textContent = data.message || 'Erro ao selecionar conta'
            errorMessage.style.display = 'block'
            return
        }

        entrarComToken(data)
    } catch (err) {
        accountModal.style.display = 'none'
        errorMessage.textContent = 'Erro ao conectar com o servidor'
        errorMessage.style.display = 'block'
    }
}
