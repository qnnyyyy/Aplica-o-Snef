const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const pino = require('pino')
const path = require('path')

const AUTH_DIR = path.join(__dirname, '..', '..', 'whatsapp-auth')
const NUMERO_BOT = '+55 11 91794-4484'

let sock = null
let pronto = false

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log(`\n[WhatsApp] Escaneie o QR Code abaixo com o WhatsApp do número ${NUMERO_BOT} (Aparelhos conectados > Conectar um aparelho):\n`)
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            pronto = true
            console.log('[WhatsApp] Bot conectado com sucesso.')
        }

        if (connection === 'close') {
            pronto = false
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const deveReconectar = statusCode !== DisconnectReason.loggedOut

            if (deveReconectar) {
                console.error('[WhatsApp] Conexão encerrada, reconectando...')
                start()
            } else {
                console.error('[WhatsApp] Sessão desconectada (logout). Apague a pasta "whatsapp-auth" e reinicie o servidor para gerar um novo QR Code.')
            }
        }
    })
}

function paraJid(telefone) {
    if (!telefone) return null
    let digitos = String(telefone).replace(/\D/g, '')
    if (!digitos) return null
    if (!digitos.startsWith('55')) digitos = '55' + digitos
    return `${digitos}@s.whatsapp.net`
}

async function enviarWhatsApp(telefone, mensagem) {
    const jid = paraJid(telefone)
    if (!jid) return false

    if (!sock || !pronto) {
        console.error('[WhatsApp] Bot ainda não está conectado, mensagem não enviada.')
        return false
    }

    try {
        await sock.sendMessage(jid, { text: mensagem })
        return true
    } catch (err) {
        console.error('[WhatsApp] Erro ao enviar mensagem:', err.message)
        return false
    }
}

module.exports = { start, enviarWhatsApp }
