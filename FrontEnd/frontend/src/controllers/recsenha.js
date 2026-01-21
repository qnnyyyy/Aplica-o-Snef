const form = document.getElementById('resetForm');
const emailInput = document.getElementById('email');

const successMsg = document.getElementById('successMsg');
const errorMsg = document.getElementById('errorMsg');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    successMsg.style.display = 'none';
    errorMsg.style.display = 'none';

    const email = emailInput.value.trim();

    if (!email) {
        errorMsg.textContent = 'Informe um e-mail válido.';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao solicitar recuperação');
        }

        successMsg.textContent = '✅ Se o e-mail existir, enviaremos as instruções.';
        successMsg.style.display = 'block';

        form.reset();

    } catch (err) {
        console.error('Erro recuperação senha:', err);

        errorMsg.textContent = err.message || 'Erro inesperado.';
        errorMsg.style.display = 'block';
    }
});
