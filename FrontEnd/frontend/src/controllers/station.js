const API_URL = '/api/stations';
const token = localStorage.getItem('token');

const stationForm = document.getElementById('station-form');
const nameInput = document.getElementById('name');
const locationInput = document.getElementById('location');
const feedback = document.getElementById('feedback');

function showFeedback(message, ok) {
    feedback.textContent = message;
    feedback.style.display = 'block';
    feedback.style.background = ok ? '#e6f4ea' : '#fdecea';
    feedback.style.color = ok ? '#1e7d34' : '#b3261e';
}

async function carregarEstacao() {
    try {
        const res = await fetch(API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.status === 'success' && result.data) {
            nameInput.value = result.data.name || '';
            locationInput.value = result.data.location || '';
        }
    } catch (err) {
        showFeedback('Erro ao carregar dados da estação.', false);
    }
}

stationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.style.display = 'none';

    try {
        const res = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: nameInput.value, location: locationInput.value })
        });
        const result = await res.json();

        if (!res.ok) {
            showFeedback(result.message || 'Erro ao salvar', false);
            return;
        }

        showFeedback('Salvo com sucesso!', true);
    } catch (err) {
        showFeedback('Erro ao comunicar com o servidor.', false);
    }
});

document.addEventListener('DOMContentLoaded', carregarEstacao);
