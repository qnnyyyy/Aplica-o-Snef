const API_BASE_URL = '/api/team'
const token = localStorage.getItem('token')

function decodeJwtPayload(jwt) {
    try {
        return JSON.parse(atob(jwt.split('.')[1]))
    } catch {
        return {}
    }
}

const meId = decodeJwtPayload(token || '').id

const els = {
    form: document.getElementById('invite-form'),
    name: document.getElementById('invite-name'),
    email: document.getElementById('invite-email'),
    role: document.getElementById('invite-role'),
    confirmationKey: document.getElementById('invite-admin-password'),
    btnInvite: document.getElementById('btn-invite'),
    feedback: document.getElementById('invite-feedback'),
    tbody: document.getElementById('team-tbody'),

    editModal: document.getElementById('edit-modal'),
    editUserId: document.getElementById('edit-user-id'),
    editModalTitle: document.getElementById('edit-modal-title'),
    editRole: document.getElementById('edit-role'),
    editKey: document.getElementById('edit-confirmation-key'),
    editFeedback: document.getElementById('edit-feedback'),
    btnEditSave: document.getElementById('btn-edit-save'),
    btnEditCancel: document.getElementById('btn-edit-cancel')
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
        const isSelf = Number(m.id) === Number(meId)
        const isOwner = Number(m.is_owner) === 1

        let acoes
        if (isOwner) {
            acoes = 'Admin principal'
        } else if (isSelf) {
            acoes = 'Você'
        } else {
            acoes = `
                <button class="btn-edit-role" data-id="${m.id}" data-name="${m.name}" data-role="${isAdmin ? 'admin' : 'viewer'}">Editar</button>
                ${!isAdmin ? `<button class="btn-remove" data-id="${m.id}">Remover</button>` : ''}
            `
        }

        return `
            <tr>
                <td>${m.name}${isOwner ? ' <span class="badge badge-admin" style="margin-left:6px">Dono</span>' : ''}</td>
                <td>${m.email}</td>
                <td><span class="badge ${isAdmin ? 'badge-admin' : 'badge-viewer'}">${isAdmin ? 'Admin' : 'Usuário'}</span></td>
                <td>${acoes}</td>
            </tr>
        `
    }).join('')

    els.tbody.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => removerMembro(btn.dataset.id))
    })

    els.tbody.querySelectorAll('.btn-edit-role').forEach(btn => {
        btn.addEventListener('click', () => abrirEdicao(btn.dataset.id, btn.dataset.name, btn.dataset.role))
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
            body: JSON.stringify({
                name: els.name.value.trim(),
                email: els.email.value.trim(),
                role: els.role.value,
                confirmationKey: els.confirmationKey.value
            })
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

function abrirEdicao(id, name, currentRole) {
    els.editUserId.value = id
    els.editModalTitle.textContent = `Editar permissão — ${name}`
    els.editRole.value = currentRole
    els.editKey.value = ''
    els.editFeedback.textContent = ''
    els.editFeedback.className = ''
    els.editModal.style.display = 'flex'
}

function fecharEdicao() {
    els.editModal.style.display = 'none'
}

els.btnEditCancel.addEventListener('click', fecharEdicao)
els.editModal.addEventListener('click', (e) => {
    if (e.target === els.editModal) fecharEdicao()
})

els.btnEditSave.addEventListener('click', async () => {
    const id = els.editUserId.value

    els.btnEditSave.disabled = true
    els.btnEditSave.textContent = 'Salvando...'

    try {
        const res = await fetch(`${API_BASE_URL}/${id}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                role: els.editRole.value,
                confirmationKey: els.editKey.value
            })
        })
        const result = await res.json()

        if (!res.ok) {
            els.editFeedback.textContent = result.message || 'Erro ao atualizar permissão'
            els.editFeedback.className = 'err'
            return
        }

        fecharEdicao()
        carregarEquipe()
    } catch (err) {
        els.editFeedback.textContent = 'Erro ao comunicar com o servidor.'
        els.editFeedback.className = 'err'
    } finally {
        els.btnEditSave.disabled = false
        els.btnEditSave.textContent = 'Salvar'
    }
})

document.addEventListener('DOMContentLoaded', carregarEquipe)
