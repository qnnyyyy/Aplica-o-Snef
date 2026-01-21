const token = localStorage.getItem('token');

async function updateDashboard() {
    try {
        const res = await fetch('/api/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.status === 'success') {
            const { totalIn, totalOut, latestEvents } = result.data;

            document.getElementById('count-in').innerText = totalIn;
            document.getElementById('count-out').innerText = totalOut;

            const tbody = document.getElementById('latest-events-tbody');
            if (tbody) {
                tbody.innerHTML = latestEvents.map(event => `
                    <tr>
                        <td>${event.time}</td>
                        <td>
                            <span style="font-weight:600">${event.station || 'N/A'}</span><br>
                            <small>${event.zone || 'Geral'}</small>
                        </td>
                        <td>${event.camera}</td>
                        <td class="${event.direction === 'IN' ? 'text-success' : 'text-danger'}">
                            <strong>${event.direction}</strong>
                        </td>
                        <td>${event.count}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Erro ao atualizar dashboard:', err);
    }
}

setInterval(updateDashboard, 30000);
document.addEventListener('DOMContentLoaded', updateDashboard);