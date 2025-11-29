const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Проверка конфигурации Telegram
async function validateConfiguration(telegramConfig) {
    console.log('\n📱 Проверка Telegram конфигурации:');
    if (telegramConfig.botToken) {
        try {
            const response = await axios.get(`${telegramConfig.apiUrl}${telegramConfig.botToken}/getMe`);
            if (response.data.ok) {
                console.log(`✅ Telegram Bot: ${response.data.result.first_name} (@${response.data.result.username})`);
            } else {
                console.log('❌ Telegram Bot: неверный токен');
            }
        } catch (error) {
            console.log('❌ Telegram Bot: ошибка подключения -', error.message);
        }
    } else {
        console.log('⚠️  Telegram Bot: токен не установлен (TELEGRAM_BOT_TOKEN)');
    }
}

// Отправка сообщений в Telegram
// В функции sendTelegramMessages добавьте обработку файлов:
async function sendTelegramMessages(message, recipients, attachments, telegramConfig) {
    const validRecipients = recipients.filter(r => r.telegram_chat_id || 
        (r.custom_address && (r.custom_address.startsWith('@') || !isNaN(r.custom_address))));
    const results = [];
    
    for (let recipient of validRecipients) {
        const chatId = recipient.telegram_chat_id || recipient.custom_address;

        const deliveryMethods = {};
        let telegramSuccess = false;

        try {
            console.log(`📱 Отправка в Telegram для ${chatId}`);

            // Отправка текста
            const textMessage = `${message.subject ? `*${message.subject}*\n\n` : ''}${message.content}`;
            
            await axios.post(`${telegramConfig.apiUrl}${telegramConfig.botToken}/sendMessage`, {
                chat_id: chatId,
                text: textMessage.length > 4096 ? textMessage.substring(0, 4093) + '...' : textMessage,
                parse_mode: 'Markdown'
            });

            console.log(`✅ Текст отправлен в Telegram: ${chatId}`);

            // Отправка файлов с повторными попытками
            let filesSuccess = true;
            if (attachments && attachments.length > 0) {
                for (let attachment of attachments) {
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    while (retryCount < maxRetries) {
                        try {
                            console.log(`📁 Попытка ${retryCount + 1} отправки файла: ${attachment.original_name}`);
                            
                            const fileBuffer = fs.readFileSync(attachment.path);
                            
                            const form = new FormData();
                            form.append('chat_id', chatId);
                            form.append('document', fileBuffer, attachment.original_name);

                            await axios.post(
                                `${telegramConfig.apiUrl}${telegramConfig.botToken}/sendDocument`,
                                form,
                                {
                                    headers: form.getHeaders(),
                                    timeout: 60000, // Увеличиваем таймаут
                                    maxContentLength: Infinity,
                                    maxBodyLength: Infinity
                                }
                            );

                            console.log(`✅ Файл отправлен в Telegram: ${attachment.original_name}`);
                            break; // Успешно, выходим из цикла повторных попыток
                            
                        } catch (fileError) {
                            retryCount++;
                            console.error(`❌ Ошибка отправки файла ${attachment.original_name} (попытка ${retryCount}):`, fileError.message);
                            
                            if (retryCount === maxRetries) {
                                console.error(`❌ Файл не отправлен после ${maxRetries} попыток: ${attachment.original_name}`);
                                filesSuccess = false;
                            } else {
                                // Ждем перед повторной попыткой
                                await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                            }
                        }
                    }
                }
            }

            telegramSuccess = true;
            deliveryMethods['telegram'] = {
                success: true,
                delivered: true,
                error: null,
                filesSent: filesSuccess
            };

        } catch (error) {
            console.error(`❌ Ошибка отправки в Telegram для ${chatId}:`, error.response?.data || error.message);
            
            deliveryMethods['telegram'] = {
                success: false,
                delivered: false,
                error: error.response?.data?.description || error.message
            };
        }

        results.push({ 
            recipient: chatId, 
            success: telegramSuccess,
            deliveryMethods: deliveryMethods
        });

        // Пауза между сообщениями
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
}

module.exports = {
    validateConfiguration,
    sendTelegramMessages
};