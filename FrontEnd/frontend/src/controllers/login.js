const form = document.getElementById('login-form')
const errorMessage = document.getElementById('error-message')

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

        localStorage.setItem('token', data.token)
        window.location.href = 'index.html'

    } catch (err) {
        errorMessage.textContent = 'Erro ao conectar com o servidor'
        errorMessage.style.display = 'block'
    }
})
