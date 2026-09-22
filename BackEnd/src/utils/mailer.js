const nodemailer = require('nodemailer')
const path = require('path')

const LOGO_PATH = path.resolve(__dirname, '..', '..', '..', 'frontend', 'frontend', 'src', 'assets', 'snef_fr.jpg')

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
    tls: { rejectUnauthorized: false }
})

function logoAttachment() {
    return { filename: 'snef_fr.jpg', path: LOGO_PATH, cid: 'snef-logo' }
}

module.exports = { transporter, logoAttachment }
