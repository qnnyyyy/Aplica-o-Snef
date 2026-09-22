const API_BASE_URL = '/api/team'
const API_ROOT = '/api'
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
    btnEditCancel: document.getElementById('btn-edit-cancel'),

    apiKeyValue: document.getElementById('api-key-value'),
    btnCopyKey: document.getElementById('btn-copy-key'),
    btnRegenKey: document.getElementById('btn-regen-key'),
    apiKeyFeedback: document.getElementById('api-key-feedback'),

    auditTbody: document.getElementById('audit-tbody'),

    pendingTbody: document.getElementById('pending-tbody'),
    pendingCount: document.getElementById('pending-count')
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
        const role = (m.role || '').toLowerCase()
        const isAdmin = role === 'admin'
        const isDono = role === 'dono'
        const isSelf = Number(m.id) === Number(meId)
        const isOwner = isDono || Number(m.is_owner) === 1

        let acoes
        if (isOwner) {
            acoes = 'Dono principal'
        } else if (isSelf) {
            acoes = 'Você'
        } else {
            acoes = `
                <button class="btn-edit-role" data-id="${m.id}" data-name="${m.name}" data-role="${isAdmin ? 'admin' : 'viewer'}">Editar</button>
                ${!isAdmin ? `<button class="btn-remove" data-id="${m.id}">Remover</button>` : ''}
            `
        }

        const permissaoLabel = isDono ? 'Dono' : (isAdmin ? 'Admin' : 'Usuário')

        return `
            <tr>
                <td>${m.name}</td>
                <td>${m.email}</td>
                <td><span class="badge ${isDono || isAdmin ? 'badge-admin' : 'badge-viewer'}">${permissaoLabel}</span></td>
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
        carregarAuditoria()
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
        carregarAuditoria()
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
        carregarAuditoria()
    } catch (err) {
        els.editFeedback.textContent = 'Erro ao comunicar com o servidor.'
        els.editFeedback.className = 'err'
    } finally {
        els.btnEditSave.disabled = false
        els.btnEditSave.textContent = 'Salvar'
    }
})

async function carregarChaveApi() {
    try {
        const res = await fetch(`${API_ROOT}/tenant-info`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (result.status === 'success') {
            els.apiKeyValue.value = result.data.tenant.api_key || ''
        }
    } catch (err) {
        els.apiKeyValue.value = 'Erro ao carregar'
    }
}

function showApiKeyFeedback(message, ok) {
    els.apiKeyFeedback.textContent = message
    els.apiKeyFeedback.style.display = 'block'
    els.apiKeyFeedback.style.background = ok ? '#e6f4ea' : '#fdecea'
    els.apiKeyFeedback.style.color = ok ? '#1e7d34' : '#b3261e'
}

els.btnCopyKey.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(els.apiKeyValue.value)
        showApiKeyFeedback('Chave copiada!', true)
    } catch (err) {
        showApiKeyFeedback('Não foi possível copiar automaticamente. Selecione e copie manualmente.', false)
    }
})

els.btnRegenKey.addEventListener('click', async () => {
    if (!confirm('Gerar uma nova chave? A chave atual deixará de funcionar e as câmeras precisarão ser reconfiguradas.')) return

    try {
        const res = await fetch(`${API_ROOT}/tenant-info/regenerate-key`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (!res.ok) {
            showApiKeyFeedback(result.message || 'Erro ao gerar nova chave', false)
            return
        }

        els.apiKeyValue.value = result.data.api_key
        showApiKeyFeedback('Nova chave gerada com sucesso!', true)
    } catch (err) {
        showApiKeyFeedback('Erro ao comunicar com o servidor.', false)
    }
})

async function carregarPendentes() {
    try {
        const res = await fetch(`${API_BASE_URL}/pending-registrations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (result.status !== 'success') return

        if (result.data.length === 0) {
            els.pendingCount.style.display = 'none'
            els.pendingTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">Nenhum cadastro pendente.</td></tr>'
            return
        }

        els.pendingCount.style.display = 'inline-block'
        els.pendingCount.textContent = result.data.length

        els.pendingTbody.innerHTML = result.data.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.email}</td>
                <td><span class="badge ${p.requested_role === 'ADMIN' ? 'badge-admin' : 'badge-viewer'}">${p.requested_role === 'ADMIN' ? 'Admin' : 'Operador'}</span></td>
                <td>${new Date(p.created_at).toLocaleString('pt-BR')}</td>
                <td>
                    <button class="btn-edit-role" data-id="${p.id}" data-action="approve">Aprovar</button>
                    <button class="btn-remove" data-id="${p.id}" data-action="reject">Rejeitar</button>
                </td>
            </tr>
        `).join('')

        els.pendingTbody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => decidirPendente(btn.dataset.id, btn.dataset.action))
        })
    } catch (err) {
        els.pendingTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">Erro ao carregar cadastros pendentes.</td></tr>'
    }
}

async function decidirPendente(id, action) {
    if (action === 'reject' && !confirm('Rejeitar esse pedido de cadastro?')) return

    try {
        const res = await fetch(`${API_BASE_URL}/pending-registrations/${id}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (!res.ok) {
            alert(result.message || 'Erro ao processar pedido')
            return
        }

        carregarPendentes()
        carregarEquipe()
        carregarAuditoria()
    } catch (err) {
        alert('Erro ao comunicar com o servidor')
    }
}

async function carregarAuditoria() {
    try {
        const res = await fetch(`${API_BASE_URL}/audit-log`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const result = await res.json()

        if (result.status !== 'success') return

        if (result.data.length === 0) {
            els.auditTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma ação registrada ainda.</td></tr>'
            return
        }

        const acoes = {
            invite: 'Convite enviado',
            role_change: 'Permissão alterada',
            remove: 'Acesso removido',
            registration_approved: 'Cadastro aprovado',
            registration_rejected: 'Cadastro rejeitado'
        }

        els.auditTbody.innerHTML = result.data.map(a => `
            <tr>
                <td>${new Date(a.created_at).toLocaleString('pt-BR')}</td>
                <td>${a.actor_email}</td>
                <td>${acoes[a.action] || a.action}</td>
                <td>${a.target_email || '-'}</td>
                <td>${a.details || '-'}</td>
            </tr>
        `).join('')
    } catch (err) {
        els.auditTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">Erro ao carregar log.</td></tr>'
    }
}

document.addEventListener('DOMContentLoaded', () => {
    carregarEquipe()
    carregarChaveApi()
    carregarAuditoria()
    carregarPendentes()
})
