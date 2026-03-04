const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initialize();
    }

    initialize() {
        // Create reusable transporter using SMTP transport
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Verify connection configuration
        this.transporter.verify((error, success) => {
            if (error) {
                console.error('❌ Email service connection failed:', error.message);
            } else {
                console.log('✅ Email service ready to send messages');
            }
        });
    }

    /**
     * Send new message notification email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {string} options.recipientName - Recipient's name
     * @param {string} options.senderName - Sender's name
     * @param {string} options.messageContent - Message content
     * @param {string} options.chatUrl - URL to open chat
     */
    async sendMessageNotification({ to, recipientName, senderName, messageContent, chatUrl }) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM || 'Local Communication <noreply@localhost>',
                to,
                subject: `💬 Tin nhắn mới từ ${senderName}`,
                html: this.generateMessageNotificationHTML({
                    recipientName,
                    senderName,
                    messageContent,
                    chatUrl
                })
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${to}: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Failed to send email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate HTML email template for message notification
     */
    generateMessageNotificationHTML({ recipientName, senderName, messageContent, chatUrl }) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .message-box { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0; }
        .sender { font-weight: 600; color: #667eea; margin-bottom: 10px; }
        .message { color: #333; line-height: 1.6; }
        .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 600; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💬 Tin nhắn mới</h1>
        </div>
        <div class="content">
            <p>Xin chào <strong>${recipientName}</strong>,</p>
            <p>Bạn có tin nhắn mới từ <strong>${senderName}</strong>:</p>
            
            <div class="message-box">
                <div class="sender">💬 ${senderName}</div>
                <div class="message">${this.escapeHtml(messageContent)}</div>
            </div>

            <p>Nhấn nút bên dưới để trả lời ngay:</p>
            <a href="${chatUrl}" class="button">Mở Chat</a>
        </div>
        <div class="footer">
            <p>Email này được gửi tự động từ Local Communication</p>
            <p>Bạn nhận được email này vì có người gửi tin nhắn cho bạn</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Test email service
     */
    async sendTestEmail(to) {
        try {
            const result = await this.sendMessageNotification({
                to,
                recipientName: 'Test User',
                senderName: 'System',
                messageContent: 'This is a test email from Local Communication. If you receive this, email service is working correctly!',
                chatUrl: 'http://localhost:3000'
            });
            return result;
        } catch (error) {
            console.error('Test email failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
