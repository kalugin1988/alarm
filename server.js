require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const basicAuth = require('basic-auth');

// Импорт модулей
const db = require('./sqllite.js');
const emailService = require('./email.js');
const telegramService = require('./telegram.js');
const vkService = require('./vk.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Конфигурация из переменных окружения
const config = {
    auth: {
        password: process.env.AUTH_PASSWORD || '',
        username: process.env.AUTH_USERNAME || 'admin'
    },
    email: {
        dadehard: {
            host: process.env.DADEHARD_SMTP_HOST || 'mail.netangels.ru',
            port: parseInt(process.env.DADEHARD_SMTP_PORT) || 587,
            secure: process.env.DADEHARD_SMTP_SECURE === 'true',
            auth: {
                user: process.env.DADEHARD_EMAIL || 'up.school25@dadehard.ru',
                pass: process.env.DADEHARD_PASSWORD || ''
            },
            tls: {
                rejectUnauthorized: false
            }
        },
        yandex: {
            host: process.env.YANDEX_SMTP_HOST || 'smtp.yandex.ru',
            port: parseInt(process.env.YANDEX_SMTP_PORT) || 465,
            secure: process.env.YANDEX_SMTP_SECURE !== 'false',
            auth: {
                user: process.env.YANDEX_EMAIL || 'kalugin66@ya.ru',
                pass: process.env.YANDEX_PASSWORD || ''
            },
            tls: {
                rejectUnauthorized: false
            }
        }
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        apiUrl: 'https://api.telegram.org/bot'
    },
    vk: {
        accessToken: process.env.VK_ACCESS_TOKEN || '',
        apiVersion: process.env.VK_API_VERSION || '5.131',
        apiUrl: 'https://api.vk.com/method/'
    }
};

// Middleware аутентификации
const authenticate = (req, res, next) => {
    if (!config.auth.password) {
        return next();
    }

    const credentials = basicAuth(req);

    if (!credentials || 
        credentials.name !== config.auth.username || 
        credentials.pass !== config.auth.password) {
        res.set('WWW-Authenticate', 'Basic realm="Message Service"');
        return res.status(401).send('Требуется аутентификация');
    }

    next();
};

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Применяем аутентификацию ко всем API routes
app.use('/api', authenticate);

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'data', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Функция проверки конфигурации
async function validateConfiguration() {
    console.log('🔧 Проверка конфигурации...');
    
    // Проверка аутентификации
    if (config.auth.password) {
        console.log('✅ Аутентификация включена');
    } else {
        console.log('⚠️  Аутентификация отключена (AUTH_PASSWORD не установлен)');
    }

    // Проверка Email конфигурации
    await emailService.validateConfiguration(config.email);
    
    // Проверка Telegram
    await telegramService.validateConfiguration(config.telegram);

    // Проверка VK
    await vkService.validateConfiguration(config.vk);

    console.log('\n🚀 Сервис готов к работе');
}

// API Routes

app.get('/info', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'info.html'));
});

// Информация о конфигурации
app.get('/api/config-status', (req, res) => {
    const status = {
        auth: {
            enabled: !!config.auth.password
        },
        email: {
            dadehard: {
                configured: !!config.email.dadehard.auth.pass,
                user: config.email.dadehard.auth.user,
                host: config.email.dadehard.host
            },
            yandex: {
                configured: !!config.email.yandex.auth.pass,
                user: config.email.yandex.auth.user,
                host: config.email.yandex.host
            }
        },
        telegram: {
            configured: !!config.telegram.botToken
        },
        vk: {
            configured: !!config.vk.accessToken
        }
    };
    res.json(status);
});

// Контакты
app.get('/api/contacts', (req, res) => {
    db.getAllContacts((err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/contacts', (req, res) => {
    const { name, email, telegram_chat_id, vk_id } = req.body;
    
    db.addContact(name, email, telegram_chat_id, vk_id, function(err, lastID) {
        if (err) {
            console.error('❌ Ошибка при добавлении контакта:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: lastID, name, email, telegram_chat_id, vk_id });
    });
});

app.delete('/api/contacts/:id', (req, res) => {
    const id = req.params.id;
    
    db.deleteContact(id, function(err, changes) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ deleted: changes });
    });
});

// Отправка сообщений
app.post('/api/send-message', upload.array('attachments', 5), async (req, res) => {
    try {
        console.log('📨 Получен запрос на отправку сообщения');
        console.log('Received deliveryMethods:', req.body.deliveryMethods);
        
        let deliveryMethods = req.body.deliveryMethods;
        let methods = [];

        // Обрабатываем разные форматы deliveryMethods
        if (typeof deliveryMethods === 'string') {
            try {
                methods = JSON.parse(deliveryMethods);
            } catch (e) {
                methods = deliveryMethods.split(',');
            }
        } else if (Array.isArray(deliveryMethods)) {
            methods = deliveryMethods;
        }

        console.log('Processed methods:', methods);

        const { subject, content, recipients, customAddresses } = req.body;
        const files = req.files || [];

        // Проверяем доступность выбранных методов доставки
        const availableMethods = [];

        for (const method of methods) {
            if (method === 'email' && (config.email.dadehard.auth.pass || config.email.yandex.auth.pass)) {
                availableMethods.push(method);
            } else if (method === 'telegram' && config.telegram.botToken) {
                availableMethods.push(method);
            } else if (method === 'vk' && config.vk.accessToken) {
                availableMethods.push(method);
            }
        }

        if (availableMethods.length === 0) {
            return res.status(400).json({ 
                error: 'Нет доступных методов доставки. Проверьте настройки.' 
            });
        }

        // Сохраняем сообщение в БД
        db.addMessage(subject, content, availableMethods.join(','), function(err, messageId) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            console.log(`✅ Сообщение сохранено в БД с ID: ${messageId}`);

            // Добавляем запись в историю статусов
            const historyEntry = {
                timestamp: new Date().toISOString(),
                action: 'create',
                status: 'pending',
                details: 'Сообщение создано'
            };
            db.addStatusHistory(messageId, historyEntry);
            
            // Сохраняем вложения
            files.forEach(file => {
                db.addAttachment(messageId, file.filename, file.originalname, file.path);
            });

            // Обрабатываем получателей
            const recipientList = recipients ? JSON.parse(recipients) : [];
            const customAddrList = customAddresses ? JSON.parse(customAddresses) : [];

            recipientList.forEach(contactId => {
                db.addMessageRecipient(messageId, contactId, null);
            });

            customAddrList.forEach(address => {
                db.addMessageRecipient(messageId, null, address);
            });

            console.log(`📋 Получатели: ${recipientList.length} из адресной книги, ${customAddrList.length} пользовательских`);

            // Отправка сообщений (асинхронно)
            sendMessages(messageId, availableMethods, config, files);

            res.json({ 
                success: true, 
                messageId: messageId,
                methods: availableMethods,
                message: 'Сообщение отправлено в обработку' 
            });
        });

    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        res.status(500).json({ error: error.message });
    }
});

// Функция отправки сообщений
async function sendMessages(messageId, methods, config, files) {
    console.log(`🚀 Запуск отправки сообщения ${messageId}, методы: ${methods}`);
        // Проверяем конфигурацию SMTP
    console.log('🔍 Проверка SMTP конфигурации:');
    console.log('   Dadehard настроен:', !!config.email.dadehard.auth.pass);
    console.log('   Yandex настроен:', !!config.email.yandex.auth.pass);
    console.log('   Dadehard хост:', config.email.dadehard.host);
    console.log('   Yandex хост:', config.email.yandex.host);
    // Получаем данные сообщения
    db.getMessage(messageId, async (err, message) => {
        if (err) {
            console.error('Error getting message:', err);
            return;
        }

        // Получаем получателей
        db.getMessageRecipients(messageId, async (err, recipients) => {
            if (err) {
                console.error('Error getting recipients:', err);
                return;
            }

            // Получаем вложения
            db.getAttachments(messageId, async (err, attachments) => {
                if (err) {
                    console.error('Error getting attachments:', err);
                    return;
                }

                console.log(`📨 Данные для отправки: ${recipients.length} получателей, ${attachments.length} вложений`);

                // Собираем все результаты доставки
                const allDeliveryResults = {};
                let hasAnySuccess = false;

                for (let method of methods) {
                    try {
                        console.log(`🔄 Обработка метода: ${method}`);
                        let result;
                        
                        if (method === 'email') {
                            result = await emailService.sendEmails(message, recipients, attachments, config.email);
                            
                            // Обрабатываем результаты email
                            if (result && Array.isArray(result)) {
                                result.forEach(emailResult => {
                                    const recipientKey = emailResult.recipient;
                                    if (!allDeliveryResults[recipientKey]) {
                                        allDeliveryResults[recipientKey] = {};
                                    }
                                    Object.assign(allDeliveryResults[recipientKey], emailResult.deliveryMethods);
                                    
                                    if (emailResult.success) {
                                        hasAnySuccess = true;
                                    }
                                });
                            }
                            
                        } else if (method === 'telegram') {
                            result = await telegramService.sendTelegramMessages(message, recipients, attachments, config.telegram);
                            
                            // Обрабатываем результаты telegram
                            if (result && Array.isArray(result)) {
                                result.forEach(tgResult => {
                                    const recipientKey = tgResult.recipient;
                                    if (!allDeliveryResults[recipientKey]) {
                                        allDeliveryResults[recipientKey] = {};
                                    }
                                    Object.assign(allDeliveryResults[recipientKey], tgResult.deliveryMethods);
                                    
                                    if (tgResult.success) {
                                        hasAnySuccess = true;
                                    }
                                });
                            }
                        } else if (method === 'vk') {
                            result = await vkService.sendVKMessages(message, recipients, attachments, config.vk);
                            
                            // Обрабатываем результаты VK
                            if (result && Array.isArray(result)) {
                                result.forEach(vkResult => {
                                    const recipientKey = vkResult.recipient;
                                    if (!allDeliveryResults[recipientKey]) {
                                        allDeliveryResults[recipientKey] = {};
                                    }
                                    Object.assign(allDeliveryResults[recipientKey], vkResult.deliveryMethods);
                                    
                                    if (vkResult.success) {
                                        hasAnySuccess = true;
                                    }
                                });
                            }
                        }
                        
                    } catch (error) {
                        console.error(`❌ Ошибка отправки via ${method}:`, error);
                    }
                }

                // Определяем финальный статус
                const finalStatus = hasAnySuccess ? 'sent' : 'failed';
                
                console.log(`📊 Итоговый статус для сообщения ${messageId}: ${finalStatus}`);
                console.log('Детали доставки:', allDeliveryResults);
                
                // Сохраняем детальную информацию о доставке в БД
                try {
                    const deliveryInfo = JSON.stringify(allDeliveryResults);
                    db.updateMessageStatus(messageId, finalStatus, deliveryInfo);
                    
                    // Добавляем запись в историю статусов
                    const historyEntry = {
                        timestamp: new Date().toISOString(),
                        action: 'status_change',
                        status: finalStatus,
                        details: `Отправка завершена. Успешно: ${hasAnySuccess}`
                    };
                    db.addStatusHistory(messageId, historyEntry);
                    
                    console.log(`✅ Сообщение ${messageId} обработано. Статус: ${finalStatus}`);
                } catch (dbError) {
                    console.error('❌ Ошибка сохранения в БД:', dbError);
                }
            });
        });
    });
}

// История сообщений
app.get('/api/messages', (req, res) => {
    db.getAllMessages((err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Детальная информация о сообщении
app.get('/api/messages/:id', (req, res) => {
    const messageId = req.params.id;
    
    db.getMessageDetails(messageId, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // Парсим информацию о доставке
        let deliveryInfo = {};
        try {
            deliveryInfo = row.delivery_info ? JSON.parse(row.delivery_info) : {};
        } catch (e) {
            console.error('Error parsing delivery info:', e);
        }
        
        res.json({
            ...row,
            delivery_info: deliveryInfo
        });
    });
});

// Повторная отправка сообщения
app.post('/api/messages/:id/resend', async (req, res) => {
    const messageId = req.params.id;

    try {
        console.log(`🔄 Запрос на повторную отправку сообщения ${messageId}`);

        // Получаем данные сообщения
        db.getMessage(messageId, async (err, message) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }

            // Добавляем запись в историю статусов
            const historyEntry = {
                timestamp: new Date().toISOString(),
                action: 'resend',
                status: 'pending',
                details: 'Запущена повторная отправка'
            };
            db.addStatusHistory(messageId, historyEntry);

            // Обновляем статус сообщения
            db.updateMessageStatus(messageId, 'pending', message.delivery_info);

            // Запускаем повторную отправку
            const methods = message.delivery_methods.split(',');
            sendMessages(messageId, methods, config, []);

            res.json({ 
                success: true, 
                message: 'Повторная отправка запущена',
                messageId: messageId
            });
        });

    } catch (error) {
        console.error('Error resending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// История статусов сообщения
app.get('/api/messages/:id/history', (req, res) => {
    const messageId = req.params.id;
    
    db.getStatusHistory(messageId, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, async () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📧 Dadehard email: ${config.email.dadehard.auth.user}`);
    console.log(`📧 Yandex email: ${config.email.yandex.auth.user}`);
    console.log(`🤖 Telegram bot: ${config.telegram.botToken ? 'настроен' : 'не настроен'}`);
    console.log(`📘 VK API: ${config.vk.accessToken ? 'настроен' : 'не настроен'}`);
    console.log(`🔐 Аутентификация: ${config.auth.password ? 'включена' : 'отключена'}`);
    
    // Инициализация БД
    db.initialize();
    
    await validateConfiguration();
});