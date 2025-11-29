const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Проверка конфигурации VK сообщества
async function validateConfiguration(vkConfig) {
    console.log('\n📘 Проверка VK конфигурации (сообщество):');
    if (vkConfig.accessToken) {
        try {
            // Получаем информацию о сообществе
            const response = await axios.get(`${vkConfig.apiUrl}groups.getById`, {
                params: {
                    access_token: vkConfig.accessToken,
                    v: vkConfig.apiVersion,
                    fields: 'name,screen_name,is_messages_allowed'
                }
            });
            
            if (response.data.response && response.data.response.length > 0) {
                const group = response.data.response[0];
                console.log(`✅ VK API: подключено к сообществу "${group.name}" (${group.screen_name})`);
                console.log(`📝 Сообщения разрешены: ${group.is_messages_allowed ? 'Да' : 'Нет'}`);
                
                if (!group.is_messages_allowed) {
                    console.log('❌ Включите сообщения в настройках сообщества!');
                    return false;
                }
                
                return true;
            } else {
                console.log('❌ VK API: не удалось получить информацию о сообществе');
                return false;
            }
        } catch (error) {
            console.log('❌ VK API: ошибка подключения -', error.message);
            if (error.response) {
                console.log('Детали ошибки:', error.response.data);
            }
            return false;
        }
    } else {
        console.log('⚠️  VK API: токен доступа сообщества не установлен');
        return false;
    }
}

// Загрузка файла в VK (исправленная версия)
async function uploadFileToVK(attachment, userId, vkConfig) {
    try {
        console.log(`📘 Получение сервера загрузки для файла: ${attachment.original_name}`);
        
        // Получаем URL для загрузки файла
        const uploadServerResponse = await axios.get(`${vkConfig.apiUrl}docs.getMessagesUploadServer`, {
            params: {
                type: 'doc',
                peer_id: userId,
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion
            },
            timeout: 30000
        });

        if (uploadServerResponse.data.error) {
            throw new Error(uploadServerResponse.data.error.error_msg);
        }

        if (!uploadServerResponse.data.response) {
            throw new Error('Не удалось получить URL для загрузки');
        }

        const uploadUrl = uploadServerResponse.data.response.upload_url;
        console.log(`📘 URL для загрузки: ${uploadUrl}`);
        
        // Проверяем существование файла
        if (!fs.existsSync(attachment.path)) {
            throw new Error(`Файл не найден: ${attachment.path}`);
        }

        // Загружаем файл - ИСПРАВЛЕННАЯ ЧАСТЬ
        const form = new FormData();
        
        // Читаем файл как поток
        const fileStream = fs.createReadStream(attachment.path);
        
        // Важно: используем оригинальное имя файла и правильный content-type
        form.append('file', fileStream, {
            filename: attachment.original_name,
            contentType: 'application/octet-stream', // Упрощаем до общего типа
            knownLength: fs.statSync(attachment.path).size
        });

        console.log(`📘 Отправка файла ${attachment.original_name} (${fs.statSync(attachment.path).size} байт)`);

        const uploadResponse = await axios.post(uploadUrl, form, {
            headers: {
                ...form.getHeaders(),
                'Content-Length': form.getLengthSync() // Явно указываем длину контента
            },
            timeout: 60000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('📘 Ответ загрузки:', uploadResponse.data);

        // Обрабатываем разные форматы ответа
        let fileData;
        if (typeof uploadResponse.data === 'string') {
            // Если ответ в виде строки, пытаемся распарсить
            try {
                fileData = JSON.parse(uploadResponse.data);
            } catch (e) {
                // Если это не JSON, используем как есть
                fileData = uploadResponse.data;
            }
        } else {
            fileData = uploadResponse.data;
        }

        if (fileData.error) {
            throw new Error(fileData.error);
        }

        if (!fileData.file) {
            console.log('📘 Полный ответ от сервера загрузки:', fileData);
            throw new Error('Не удалось загрузить файл - отсутствует file в ответе');
        }

        // Сохраняем документ
        console.log(`📘 Сохранение документа: ${attachment.original_name}`);
        const saveResponse = await axios.get(`${vkConfig.apiUrl}docs.save`, {
            params: {
                file: fileData.file,
                title: attachment.original_name,
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion
            },
            timeout: 30000
        });

        console.log('📘 Ответ сохранения:', saveResponse.data);

        if (saveResponse.data.error) {
            throw new Error(saveResponse.data.error.error_msg);
        }

        if (saveResponse.data.response && saveResponse.data.response[0]) {
            const doc = saveResponse.data.response[0];
            const attachmentId = `doc${doc.owner_id}_${doc.id}`;
            console.log(`✅ Документ сохранен: ${attachmentId}`);
            return attachmentId;
        } else {
            throw new Error('Не удалось сохранить документ');
        }

    } catch (error) {
        console.error(`❌ Ошибка загрузки файла в VK: ${attachment.original_name}`, error.message);
        if (error.response) {
            console.error('Детали ошибки:', error.response.data);
        }
        throw error;
    }
}

// Альтернативный метод загрузки для проблемных файлов
async function uploadFileAlternative(attachment, userId, vkConfig) {
    try {
        console.log(`📘 Попытка альтернативной загрузки файла: ${attachment.original_name}`);
        
        // Получаем upload server
        const uploadServerResponse = await axios.get(`${vkConfig.apiUrl}docs.getMessagesUploadServer`, {
            params: {
                type: 'doc',
                peer_id: userId,
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion
            }
        });

        const uploadUrl = uploadServerResponse.data.response.upload_url;
        
        // Используем axios без FormData для большего контроля
        const fileBuffer = fs.readFileSync(attachment.path);
        
        const formData = new FormData();
        formData.append('file', fileBuffer, {
            filename: attachment.original_name,
            contentType: 'application/octet-stream'
        });

        const config = {
            headers: {
                'Content-Type': 'multipart/form-data',
                ...formData.getHeaders()
            },
            timeout: 60000
        };

        const uploadResponse = await axios.post(uploadUrl, formData, config);
        
        let fileData = uploadResponse.data;
        if (typeof fileData === 'string') {
            try {
                fileData = JSON.parse(fileData);
            } catch (e) {
                // Оставляем как есть
            }
        }

        if (fileData && fileData.file) {
            const saveResponse = await axios.get(`${vkConfig.apiUrl}docs.save`, {
                params: {
                    file: fileData.file,
                    title: attachment.original_name,
                    access_token: vkConfig.accessToken,
                    v: vkConfig.apiVersion
                }
            });

            if (saveResponse.data.response && saveResponse.data.response[0]) {
                const doc = saveResponse.data.response[0];
                return `doc${doc.owner_id}_${doc.id}`;
            }
        }
        
        throw new Error('Альтернативный метод не сработал');
        
    } catch (error) {
        console.error(`❌ Альтернативная загрузка не удалась: ${error.message}`);
        throw error;
    }
}

// Отправка сообщений через VK сообщество
async function sendVKMessages(message, recipients, attachments, vkConfig) {
    console.log('📘 Начало отправки VK сообщений через сообщество...');
    
    const groupInfo = await getGroupInfo(vkConfig);
    if (!groupInfo) {
        throw new Error('Не удалось получить информацию о сообществе');
    }
    
    const groupId = groupInfo.id;
    console.log(`📘 ID сообщества: ${groupId}`);
    console.log(`📘 Вложений для отправки: ${attachments ? attachments.length : 0}`);

    const validRecipients = recipients.filter(r => {
        const vkId = r.vk_id || r.custom_address;
        if (!vkId) return false;
        const normalizedId = normalizeVKId(vkId);
        return normalizedId && typeof normalizedId === 'number';
    });
    
    console.log(`📘 Валидные получатели VK: ${validRecipients.length}`);
    
    const results = [];

    for (let recipient of validRecipients) {
        const originalVkId = recipient.vk_id || recipient.custom_address;
        const deliveryMethods = {};
        let vkSuccess = false;

        try {
            const userId = normalizeVKId(originalVkId);
            if (!userId || typeof userId !== 'number') {
                throw new Error(`Неверный формат VK ID: ${originalVkId}. Должен быть числовым ID.`);
            }

            console.log(`📘 Отправка в VK для пользователя ${userId} через сообщество ${groupId}`);

            // Подготавливаем текст сообщения
            let messageText = '';
            if (message.subject) {
                messageText += `📌 ${message.subject}\n\n`;
            }
            messageText += message.content;

            // Загружаем файлы с повторными попытками
            let attachmentStr = '';
            let filesSent = false;
            let attachmentCount = 0;
            let fileErrors = [];

            if (attachments && attachments.length > 0) {
                console.log(`📘 Загрузка ${attachments.length} вложений для пользователя ${userId}`);
                
                const uploadedAttachments = [];
                
                for (let attachment of attachments) {
                    let uploaded = false;
                    let lastError = '';
                    
                    // Первая попытка - основной метод
                    try {
                        console.log(`📘 Попытка 1: основной метод для ${attachment.original_name}`);
                        const attachmentId = await uploadFileToVK(attachment, userId, vkConfig);
                        if (attachmentId) {
                            uploadedAttachments.push(attachmentId);
                            attachmentCount++;
                            uploaded = true;
                            console.log(`✅ Файл загружен: ${attachment.original_name}`);
                        }
                    } catch (error1) {
                        lastError = error1.message;
                        console.log(`❌ Попытка 1 не удалась: ${lastError}`);
                        
                        // Вторая попытка - альтернативный метод
                        try {
                            console.log(`📘 Попытка 2: альтернативный метод для ${attachment.original_name}`);
                            const attachmentId = await uploadFileAlternative(attachment, userId, vkConfig);
                            if (attachmentId) {
                                uploadedAttachments.push(attachmentId);
                                attachmentCount++;
                                uploaded = true;
                                console.log(`✅ Файл загружен (альтернативный метод): ${attachment.original_name}`);
                            }
                        } catch (error2) {
                            lastError = error2.message;
                            console.log(`❌ Попытка 2 не удалась: ${lastError}`);
                            fileErrors.push(`${attachment.original_name}: ${lastError}`);
                        }
                    }
                    
                    if (!uploaded) {
                        console.log(`❌ Файл не удалось загрузить: ${attachment.original_name}`);
                    }
                    
                    // Пауза между загрузками файлов
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                if (uploadedAttachments.length > 0) {
                    attachmentStr = uploadedAttachments.join(',');
                    filesSent = true;
                    console.log(`✅ Всего загружено файлов: ${uploadedAttachments.length}`);
                }
                
                if (fileErrors.length > 0) {
                    console.log(`⚠️  Ошибки загрузки файлов:`, fileErrors);
                }
            }

            // Отправляем сообщение
            const messageParams = {
                user_id: userId,
                message: messageText,
                random_id: Math.floor(Math.random() * 1000000),
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion
            };

            if (attachmentStr) {
                messageParams.attachment = attachmentStr;
                console.log(`📘 Добавлены вложения: ${attachmentStr}`);
            }

            console.log('📘 Параметры сообщения VK:', { 
                user_id: messageParams.user_id,
                message_length: messageParams.message.length,
                has_attachments: !!attachmentStr
            });

            const messageResponse = await axios.post(`${vkConfig.apiUrl}messages.send`, null, {
                params: messageParams,
                timeout: 30000
            });
            
            console.log('📘 Ответ VK API (сообщество):', JSON.stringify(messageResponse.data, null, 2));
            
            if (messageResponse.data.response) {
                console.log(`✅ Сообщение отправлено в VK: ${userId}, ID: ${messageResponse.data.response}`);
                
                vkSuccess = true;
                deliveryMethods['vk'] = {
                    success: true,
                    delivered: true,
                    error: null,
                    messageId: messageResponse.data.response,
                    viaGroup: true,
                    groupId: groupId,
                    filesSent: filesSent,
                    attachmentCount: attachmentCount,
                    fileErrors: fileErrors.length > 0 ? fileErrors : null
                };

            } else {
                const errorMsg = messageResponse.data.error?.error_msg || 'Unknown VK API error';
                console.log(`❌ Ошибка VK API (сообщество): ${errorMsg}`);
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error(`❌ Ошибка отправки через сообщество для ${originalVkId}:`, error.message);
            
            deliveryMethods['vk'] = {
                success: false,
                delivered: false,
                error: error.message,
                viaGroup: true
            };
        }

        results.push({ 
            recipient: originalVkId, 
            success: vkSuccess,
            deliveryMethods: deliveryMethods
        });

        // Пауза между отправками для избежания лимитов VK API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('📘 Отправка VK сообщений через сообщество завершена. Результаты:', results);
    return results;
}

// Нормализация VK ID - возвращает только числовой ID
function normalizeVKId(vkId) {
    if (!vkId) return null;
    
    const strId = vkId.toString().trim();
    
    // Если это числовой ID
    if (!isNaN(strId)) {
        return parseInt(strId);
    }
    
    // Если в формате id123456
    if (strId.startsWith('id')) {
        const numPart = strId.substring(2);
        return !isNaN(numPart) ? parseInt(numPart) : null;
    }
    
    return null;
}

// Проверка возможности отправки сообщения пользователю
async function checkIfCanSendMessage(userId, groupId, vkConfig) {
    try {
        const response = await axios.get(`${vkConfig.apiUrl}messages.isMessagesFromGroupAllowed`, {
            params: {
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion,
                group_id: groupId,
                user_id: userId
            }
        });
        
        if (response.data.response) {
            const isAllowed = response.data.response.is_allowed;
            console.log(`📘 Можно отправлять сообщения пользователю ${userId}: ${isAllowed}`);
            return isAllowed;
        }
        return false;
    } catch (error) {
        console.log(`⚠️  Не удалось проверить возможность отправки пользователю ${userId}:`, error.message);
        // Если не удалось проверить, все равно пытаемся отправить
        return true;
    }
}

// Получение информации о сообществе
async function getGroupInfo(vkConfig) {
    try {
        const response = await axios.get(`${vkConfig.apiUrl}groups.getById`, {
            params: {
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion
            }
        });
        
        if (response.data.response && response.data.response.length > 0) {
            return response.data.response[0];
        }
        return null;
    } catch (error) {
        console.error('❌ Ошибка получения информации о сообществе:', error.message);
        return null;
    }
}

// Функция для приглашения пользователя в сообщество (для админов)
async function inviteUserToGroup(userId, groupId, vkConfig) {
    try {
        const response = await axios.get(`${vkConfig.apiUrl}groups.invite`, {
            params: {
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion,
                group_id: groupId,
                user_id: userId
            }
        });
        
        console.log(`✅ Пользователь ${userId} приглашен в сообщество`);
        return true;
    } catch (error) {
        console.log(`❌ Не удалось пригласить пользователя ${userId}:`, error.message);
        return false;
    }
}

// Преобразование screen_name в числовой ID
async function resolveScreenName(screenName, vkConfig) {
    try {
        const response = await axios.get(`${vkConfig.apiUrl}utils.resolveScreenName`, {
            params: {
                access_token: vkConfig.accessToken,
                v: vkConfig.apiVersion,
                screen_name: screenName.replace('@', '')
            }
        });
        
        if (response.data.response) {
            const resolved = response.data.response;
            if (resolved.type === 'user') {
                console.log(`✅ Screen_name ${screenName} преобразован в ID: ${resolved.object_id}`);
                return resolved.object_id;
            }
        }
        return null;
    } catch (error) {
        console.error(`❌ Ошибка преобразования screen_name ${screenName}:`, error.message);
        return null;
    }
}

module.exports = {
    validateConfiguration,
    sendVKMessages,
    normalizeVKId,
    checkIfCanSendMessage,
    getGroupInfo,
    inviteUserToGroup,
    resolveScreenName,
    uploadFileToVK,
    uploadFileAlternative
};