const nodemailer = require('nodemailer');

// Проверка конфигурации email
async function validateConfiguration(emailConfig) {
    console.log('\n📧 Проверка Email конфигурации:');
    
    // Dadehard
    if (emailConfig.dadehard.auth.pass) {
        try {
            console.log(`Проверка Dadehard SMTP: ${emailConfig.dadehard.host}:${emailConfig.dadehard.port}`);
            const transporter = nodemailer.createTransport(emailConfig.dadehard);
            await transporter.verify();
            console.log('✅ Dadehard SMTP: доступен');
            
            // Тестовое письмо на реальный ящик
            try {
                const testResult = await transporter.sendMail({
                    from: emailConfig.dadehard.auth.user,
                    to: 'kalugin66@ya.ru', // Отправляем на реальный ящик для проверки
                    subject: 'Тест SMTP Dadehard - ' + new Date().toISOString(),
                    text: 'Тестовое письмо для проверки работы SMTP сервера Dadehard'
                });
                console.log('✅ Dadehard: тестовое письмо отправлено, ID:', testResult.messageId);
                console.log('   Ответ сервера:', testResult.response);
            } catch (testError) {
                console.log('❌ Dadehard: тестовое письмо не отправлено -', testError.message);
            }
        } catch (error) {
            console.log('❌ Dadehard SMTP: ошибка подключения -', error.message);
        }
    } else {
        console.log('⚠️  Dadehard SMTP: пароль не установлен (DADEHARD_PASSWORD)');
    }

    // Yandex
    if (emailConfig.yandex.auth.pass) {
        try {
            console.log(`Проверка Yandex SMTP: ${emailConfig.yandex.host}:${emailConfig.yandex.port}`);
            const transporter = nodemailer.createTransport(emailConfig.yandex);
            await transporter.verify();
            console.log('✅ Yandex SMTP: доступен');
            
            // Тестовое письмо на реальный ящик
            try {
                const testResult = await transporter.sendMail({
                    from: emailConfig.yandex.auth.user,
                    to: 'kalugin66@ya.ru', // Отправляем на реальный ящик для проверки
                    subject: 'Тест SMTP Yandex - ' + new Date().toISOString(),
                    text: 'Тестовое письмо для проверки работы SMTP сервера Yandex'
                });
                console.log('✅ Yandex: тестовое письмо отправлено, ID:', testResult.messageId);
                console.log('   Ответ сервера:', testResult.response);
            } catch (testError) {
                console.log('❌ Yandex: тестовое письмо не отправлено -', testError.message);
            }
        } catch (error) {
            console.log('❌ Yandex SMTP: ошибка подключения -', error.message);
        }
    } else {
        console.log('⚠️  Yandex SMTP: пароль не установлен (YANDEX_PASSWORD)');
    }
}

// Отправка email
async function sendEmails(message, recipients, attachments, emailConfig) {
    console.log('📧 Начало отправки email...');
    console.log('Получатели:', recipients.map(r => r.email || r.custom_address));
    console.log('Тема:', message.subject);
    console.log('Длина текста:', message.content.length);
    console.log('Вложения:', attachments.length);
    
    const validRecipients = recipients.filter(r => r.email || r.custom_address);
    const results = [];
    
    const smtpConfigs = [];
    
    if (emailConfig.dadehard.auth.pass) {
        smtpConfigs.push({
            name: 'dadehard',
            config: emailConfig.dadehard,
            from: emailConfig.dadehard.auth.user,
            identifier: 'dadehard'
        });
    }
    
    if (emailConfig.yandex.auth.pass) {
        smtpConfigs.push({
            name: 'yandex', 
            config: emailConfig.yandex,
            from: emailConfig.yandex.auth.user,
            identifier: 'yandex'
        });
    }

    if (smtpConfigs.length === 0) {
        console.log('❌ Нет доступных SMTP серверов');
        return validRecipients.map(recipient => ({
            recipient: recipient.email || recipient.custom_address,
            success: false,
            error: 'No SMTP servers available',
            deliveryMethods: {}
        }));
    }

    console.log(`📧 Отправка каждому получателю с ${smtpConfigs.length} ящиков`);

    for (let recipient of validRecipients) {
        const email = recipient.email || recipient.custom_address;
        
        if (!email.includes('@')) {
            console.log(`❌ Неверный email: ${email}`);
            results.push({ 
                recipient: email, 
                success: false, 
                error: 'Invalid email',
                deliveryMethods: {}
            });
            continue;
        }

        const deliveryMethods = {};
        let atLeastOneSuccess = false;

        for (let smtpConfig of smtpConfigs) {
            try {
                console.log(`\n🔄 Попытка отправки с ${smtpConfig.from} на ${email}`);
                
                const transporter = nodemailer.createTransport(smtpConfig.config);
                
                const subject = message.subject || 'Сообщение';
                
                const mailOptions = {
                    from: smtpConfig.from,
                    to: email,
                    subject: subject,
                    text: message.content,
                    html: message.content.replace(/\n/g, '<br>'),
                    headers: {
                        'X-Priority': '1',
                        'X-Mailer': 'MessageService'
                    },
                    attachments: attachments.map(att => ({
                        filename: att.original_name,
                        path: att.path
                    }))
                };

                console.log('Параметры письма:', {
                    from: mailOptions.from,
                    to: mailOptions.to,
                    subject: mailOptions.subject,
                    text_length: mailOptions.text.length,
                    attachments: mailOptions.attachments.length
                });

                const result = await transporter.sendMail(mailOptions);
                console.log(`✅ Email отправлен с ${smtpConfig.from} на: ${email}`);
                console.log(`   ID письма: ${result.messageId}`);
                console.log(`   Ответ SMTP: ${result.response}`);
                
                // Записываем статус для каждого метода доставки
                deliveryMethods[`email_${smtpConfig.identifier}`] = {
                    success: true,
                    from: smtpConfig.from,
                    delivered: true,
                    error: null,
                    messageId: result.messageId,
                    response: result.response
                };
                
                atLeastOneSuccess = true;
                
            } catch (error) {
                console.error(`❌ Ошибка отправки ${smtpConfig.name} email на ${email}:`, error.message);
                console.error('Полная ошибка:', error);
                
                deliveryMethods[`email_${smtpConfig.identifier}`] = {
                    success: false,
                    from: smtpConfig.from,
                    delivered: false,
                    error: error.message
                };
            }

            // Пауза между отправками
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        results.push({ 
            recipient: email, 
            success: atLeastOneSuccess,
            deliveryMethods: deliveryMethods
        });

        console.log(`📬 ${email}: статусы доставки`, deliveryMethods);
    }

    console.log('📧 Отправка email завершена. Результаты:', results);
    return results;
}

module.exports = {
    validateConfiguration,
    sendEmails
};