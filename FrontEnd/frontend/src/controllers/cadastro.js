const form = document.getElementById('register-form')
const errorMessage = document.getElementById('error-message')
const modal = document.getElementById('success-modal')
const btnOk = document.getElementById('btn-ok')
const confirmationKeyInput = document.getElementById('confirmation-key')

document.querySelectorAll('input[name="account-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
        confirmationKeyInput.placeholder = radio.value === 'owner' && radio.checked
            ? 'Chave de Dono fornecida pela SNEF'
            : 'Chave fornecida pela SNEF'
    })
})

form.addEventListener('submit', async (e) => {
    e.preventDefault()

    errorMessage.style.display = 'none'

    const name = document.getElementById('name').value.trim()
    const locationName = document.getElementById('location-name').value.trim()
    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value
    const confirm = document.getElementById('confirm-password').value
    const confirmationKey = document.getElementById('confirmation-key').value
    const accountType = document.querySelector('input[name="account-type"]:checked')?.value || 'admin'

    if (password !== confirm) {
        errorMessage.textContent = 'As senhas não coincidem'
        errorMessage.style.display = 'block'
        return
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, locationName, confirmationKey, accountType })
        })

        const data = await res.json()

        if (!res.ok) {
            errorMessage.textContent = data.message || 'Erro no cadastro'
            errorMessage.style.display = 'block'
            return
        }

        modal.style.display = 'block'

    } catch (err) {
        errorMessage.textContent = 'Erro de conexão com o servidor'
        errorMessage.style.display = 'block'
    }
})

btnOk.addEventListener('click', () => {
    window.location.href = 'login.html'
})
