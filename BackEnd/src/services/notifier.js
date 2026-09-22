// webhook único pra todo o sistema — não é por localidade.
// Aponta pro serviço de envio de WhatsApp que a SNEF configurar (Zapier, Make, etc).
// Espera receber um POST { phone, message } e cuidar do envio de verdade.
async function notifyWhatsApp(phone, message) {
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL

    if (!webhookUrl || !phone) return

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, message })
        })
    } catch (err) {
        console.error('Erro ao notificar WhatsApp:', err.message)
    }
}

module.exports = { notifyWhatsApp }
