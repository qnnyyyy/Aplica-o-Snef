const API_BASE_URL = '/api/team'
const token = localStorage.getItem('token')

const els = {
    form: document.getElementById('invite-form'),
    name: document.getElementById('invite-name'),
    email: document.getElementById('invite-email'),
    btnInvite: document.getElementById('btn-invite'),
    feedback: document.getElementById('invite-feedback'),
    tbody: document.getElementById('team-tbody')
}

async function carregarEquipe() {
    try {
        const res = await fetch(API_BASE_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (result.status === 'success') {
            renderizarEquipe(result.data)
        }
    } catch (err) {
        els.tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999">Erro ao carregar membros.</td></tr>'
    }
}

function renderizarEquipe(membros) {
    if (membros.length === 0) {
        els.tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999">Nenhum membro encontrado.</td></tr>'
        return
    }

    els.tbody.innerHTML = membros.map(m => {
        const isAdmin = (m.role || '').toLowerCase() === 'admin'
        return `
            <tr>
                <td>${m.name}</td>
                <td>${m.email}</td>
                <td><span class="badge ${isAdmin ? 'badge-admin' : 'badge-viewer'}">${isAdmin ? 'Admin' : 'Usuário'}</span></td>
                <td>${isAdmin ? '—' : `<button class="btn-remove" data-id="${m.id}">Remover</button>`}</td>
            </tr>
        `
    }).join('')

    els.tbody.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => removerMembro(btn.dataset.id))
    })
}

async function removerMembro(id) {
    if (!confirm('Remover o acesso desse usuário?')) return

    try {
        const res = await fetch(`${API_BASE_URL}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (!res.ok) {
            alert(result.message || 'Erro ao remover acesso')
            return
        }

        carregarEquipe()
    } catch (err) {
        alert('Erro ao comunicar com o servidor')
    }
}

function showFeedback(message, ok) {
    els.feedback.textContent = message
    els.feedback.className = ok ? 'ok' : 'err'
}

els.form.addEventListener('submit', async (e) => {
    e.preventDefault()

    els.btnInvite.disabled = true
    els.btnInvite.textContent = 'Enviando...'

    try {
        const res = await fetch(`${API_BASE_URL}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name: els.name.value.trim(), email: els.email.value.trim() })
        })
        const result = await res.json()

        if (!res.ok) {
            showFeedback(result.message || 'Erro ao enviar convite', false)
            return
        }

        showFeedback('Convite enviado com sucesso!', true)
        els.form.reset()
        carregarEquipe()
    } catch (err) {
        showFeedback('Erro ao comunicar com o servidor.', false)
    } finally {
        els.btnInvite.disabled = false
        els.btnInvite.textContent = 'Enviar convite'
    }
})

document.addEventListener('DOMContentLoaded', carregarEquipe)
