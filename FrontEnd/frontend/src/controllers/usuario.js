const API_BASE_URL = '/api/auth'

const userForm = document.getElementById('user-form')
const userNameEl = document.getElementById('user-name')
const userEmailEl = document.getElementById('user-email')
const userPasswordEl = document.getElementById('user-password')
const messageEl = document.getElementById('message')

async function carregarDadosUsuario() {
    const token = localStorage.getItem('token')
    
    if (!token) {
        window.location.href = 'index.html'
        return
    }

    try {
        const response = await fetch(`${API_BASE_URL}/me`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        
        const result = await response.json()
        
        if (result.status === 'success') {
            userNameEl.value = result.data.name
            userEmailEl.value = result.data.email
        }
    } catch (err) {
        console.error('Erro ao processar JSON:', err)
    }
}

userForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    
    const updateData = {
        name: userNameEl.value
    }

    if (userPasswordEl.value.trim() !== '') {
        updateData.password = userPasswordEl.value
    }

    try {
        const response = await fetch(`${API_BASE_URL}/update`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(updateData)
        })

        const result = await response.json()
        
        if (result.status === 'success') {
            messageEl.style.color = '#368D6D'
            messageEl.textContent = 'Perfil atualizado com sucesso!'
            userPasswordEl.value = ''
        } else {
            messageEl.style.color = '#ff4444'
            messageEl.textContent = result.message || 'Erro ao atualizar.'
        }
    } catch (err) {
        messageEl.style.color = '#ff4444'
        messageEl.textContent = 'Erro de conexão.'
    }
})

document.addEventListener('DOMContentLoaded', carregarDadosUsuario)