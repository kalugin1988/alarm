class HistoryManager {
    constructor(app) {
        this.app = app;
    }

    async loadMessageHistory() {
        try {
            const response = await this.app.makeAuthenticatedRequest('/api/messages');
            const messages = await response.json();
            console.log('Загружены сообщения:', messages);
            this.renderMessageHistory(messages);
        } catch (error) {
            this.app.showAlert('Ошибка загрузки истории', 'error');
        }
    }

    renderMessageHistory(messages) {
        const messagesTable = document.getElementById('messagesTable');
        
        if (messages.length === 0) {
            messagesTable.innerHTML = '<p>Нет отправленных сообщений</p>';
            return;
        }
        
        messagesTable.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Тема</th>
                        <th>Получатели</th>
                        <th>Статусы доставки</th>
                        <th>Дата</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${messages.map(message => `
                        <tr>
                            <td>${message.id}</td>
                            <td>${message.subject || 'Без темы'}</td>
                            <td>${message.recipient_names ? message.recipient_names.split(',').slice(0, 2).join(', ') : 'Пользовательские адреса'} ${message.recipient_count > 2 ? `и еще ${message.recipient_count - 2}` : ''}</td>
                            <td class="delivery-status">${this.renderDeliveryStatus(message)}</td>
                            <td>${new Date(message.created_at).toLocaleString()}</td>
                            <td>
                                ${this.renderActionButton(message)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderDeliveryStatus(message) {
        console.log(`Рендеринг статуса для сообщения ${message.id}:`, message.status, message.delivery_info);

        // Если сообщение еще в обработке
        if (message.status === 'pending') {
            return '<span class="status-pending">⏳ В обработке</span>';
        }

        // Парсим информацию о доставке
        let deliveryInfo = {};
        try {
            if (typeof message.delivery_info === 'string') {
                deliveryInfo = JSON.parse(message.delivery_info);
            } else if (typeof message.delivery_info === 'object') {
                deliveryInfo = message.delivery_info;
            }
        } catch (e) {
            console.error('Error parsing delivery info:', e);
            return '<span class="status-pending">⏳ В обработке</span>';
        }
        
        // Если нет информации о доставке
        if (Object.keys(deliveryInfo).length === 0) {
            return '<span class="status-pending">⏳ В обработке</span>';
        }
        
        let statusHTML = '';
        
        // Проверяем статусы для каждого метода
        let dadehardSuccess = false;
        let yandexSuccess = false;
        let telegramSuccess = false;
        let vkSuccess = false;
        
        // Проходим по всем получателям и собираем статусы
        Object.values(deliveryInfo).forEach(recipientDelivery => {
            if (recipientDelivery.email_dadehard) {
                dadehardSuccess = dadehardSuccess || recipientDelivery.email_dadehard.success;
            }
            if (recipientDelivery.email_yandex) {
                yandexSuccess = yandexSuccess || recipientDelivery.email_yandex.success;
            }
            if (recipientDelivery.telegram) {
                telegramSuccess = telegramSuccess || recipientDelivery.telegram.success;
            }
            if (recipientDelivery.vk) {
                vkSuccess = vkSuccess || recipientDelivery.vk.success;
            }
        });
        
        console.log(`Статусы доставки для ${message.id}: Dadehard=${dadehardSuccess}, Yandex=${yandexSuccess}, Telegram=${telegramSuccess}, VK=${vkSuccess}`);
        
        // Отображаем статусы для выбранных методов
        const methods = message.delivery_methods ? message.delivery_methods.split(',') : [];
        
        if (methods.includes('email')) {
            statusHTML += `
                <div class="method-status">
                    <strong>Email:</strong>
                    <span class="status-badge ${dadehardSuccess ? 'success' : 'error'}">DadeHard ${dadehardSuccess ? '✅' : '❌'}</span>
                    <span class="status-badge ${yandexSuccess ? 'success' : 'error'}">Yandex ${yandexSuccess ? '✅' : '❌'}</span>
                </div>
            `;
        }
        
        if (methods.includes('telegram')) {
            statusHTML += `
                <div class="method-status">
                    <strong>Telegram:</strong>
                    <span class="status-badge ${telegramSuccess ? 'success' : 'error'}">${telegramSuccess ? '✅' : '❌'}</span>
                </div>
            `;
        }
        
        if (methods.includes('vk')) {
            statusHTML += `
                <div class="method-status">
                    <strong>VK:</strong>
                    <span class="status-badge ${vkSuccess ? 'success' : 'error'}">${vkSuccess ? '✅' : '❌'}</span>
                </div>
            `;
        }
        
        return statusHTML || '<span class="status-pending">⏳ В обработке</span>';
    }

    renderActionButton(message) {
        const isAllDelivered = this.isAllDelivered(message);
        
        console.log(`Кнопка действия для ${message.id}: все доставлено = ${isAllDelivered}`);
        
        if (isAllDelivered) {
            return `
                <button class="btn-info" onclick="app.historyManager.showMessageHistory(${message.id})">
                    История
                </button>
            `;
        } else {
            return `
                <button class="btn-warning" onclick="app.historyManager.resendMessage(${message.id})">
                    Выполнить
                </button>
            `;
        }
    }

    isAllDelivered(message) {
        console.log(`Проверка полной доставки для сообщения ${message.id}`);

        // Если сообщение еще в обработке
        if (message.status === 'pending') {
            console.log(`Сообщение ${message.id} еще в обработке`);
            return false;
        }

        // Парсим информацию о доставке
        let deliveryInfo = {};
        try {
            if (typeof message.delivery_info === 'string') {
                deliveryInfo = JSON.parse(message.delivery_info);
            } else if (typeof message.delivery_info === 'object') {
                deliveryInfo = message.delivery_info;
            }
        } catch (e) {
            console.log(`Ошибка парсинга delivery_info для ${message.id}`);
            return false;
        }
        
        // Если нет информации о доставке
        if (Object.keys(deliveryInfo).length === 0) {
            console.log(`Нет delivery_info для ${message.id}`);
            return false;
        }
        
        const methods = message.delivery_methods ? message.delivery_methods.split(',') : [];
        let allMethodsSuccessful = true;
        
        // Проверяем каждый метод доставки
        methods.forEach(method => {
            if (method === 'email') {
                // Проверяем оба email ящика
                let dadehardSuccess = false;
                let yandexSuccess = false;
                
                Object.values(deliveryInfo).forEach(recipientDelivery => {
                    if (recipientDelivery.email_dadehard && recipientDelivery.email_dadehard.success) {
                        dadehardSuccess = true;
                    }
                    if (recipientDelivery.email_yandex && recipientDelivery.email_yandex.success) {
                        yandexSuccess = true;
                    }
                });
                
                // Для email оба ящика должны быть успешны
                if (!dadehardSuccess || !yandexSuccess) {
                    allMethodsSuccessful = false;
                    console.log(`❌ Email не доставлен для ${message.id}: Dadehard=${dadehardSuccess}, Yandex=${yandexSuccess}`);
                } else {
                    console.log(`✅ Email доставлен для ${message.id}`);
                }
                
            } else if (method === 'telegram') {
                let telegramSuccess = false;
                
                Object.values(deliveryInfo).forEach(recipientDelivery => {
                    if (recipientDelivery.telegram && recipientDelivery.telegram.success) {
                        telegramSuccess = true;
                    }
                });
                
                if (!telegramSuccess) {
                    allMethodsSuccessful = false;
                    console.log(`❌ Telegram не доставлен для ${message.id}`);
                } else {
                    console.log(`✅ Telegram доставлен для ${message.id}`);
                }
            } else if (method === 'vk') {
                let vkSuccess = false;
                
                Object.values(deliveryInfo).forEach(recipientDelivery => {
                    if (recipientDelivery.vk && recipientDelivery.vk.success) {
                        vkSuccess = true;
                    }
                });
                
                if (!vkSuccess) {
                    allMethodsSuccessful = false;
                    console.log(`❌ VK не доставлен для ${message.id}`);
                } else {
                    console.log(`✅ VK доставлен для ${message.id}`);
                }
            }
        });
        
        console.log(`📊 Итог проверки доставки сообщения ${message.id}: ${allMethodsSuccessful}`);
        return allMethodsSuccessful;
    }

    async resendMessage(messageId) {
        if (!confirm('Вы уверены, что хотите повторить отправку этого сообщения?')) {
            return;
        }
        
        try {
            const response = await this.app.makeAuthenticatedRequest(`/api/messages/${messageId}/resend`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.app.showAlert('Повторная отправка запущена', 'success');
                // Обновляем историю через 2 секунды
                setTimeout(() => {
                    this.loadMessageHistory();
                }, 2000);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.app.showAlert('Ошибка при повторной отправке: ' + error.message, 'error');
        }
    }

    async showMessageHistory(messageId) {
        try {
            const response = await this.app.makeAuthenticatedRequest(`/api/messages/${messageId}/history`);
            const history = await response.json();
            
            this.showHistoryModal(messageId, history);
        } catch (error) {
            this.app.showAlert('Ошибка загрузки истории: ' + error.message, 'error');
        }
    }

    showHistoryModal(messageId, history) {
        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>История статусов сообщения #${messageId}</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${this.renderHistoryTable(history)}
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="this.closest('.modal').remove()">Закрыть</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    renderHistoryTable(history) {
        if (history.length === 0) {
            return '<p>История статусов отсутствует</p>';
        }
        
        return `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Дата и время</th>
                        <th>Статус</th>
                        <th>Действие</th>
                        <th>Детали</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(entry => `
                        <tr>
                            <td>${new Date(entry.timestamp).toLocaleString()}</td>
                            <td class="status-${entry.status}">${this.getStatusText(entry.status)}</td>
                            <td>${this.getActionText(entry.action)}</td>
                            <td>${entry.details || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    getStatusText(status) {
        const statusMap = {
            'pending': '⏳ В обработке',
            'sent': '✅ Отправлено',
            'partial': '⚠️ Частично отправлено',
            'failed': '❌ Ошибка'
        };
        return statusMap[status] || status;
    }

    getActionText(action) {
        const actionMap = {
            'create': 'Создание',
            'resend': 'Повторная отправка',
            'status_change': 'Изменение статуса'
        };
        return actionMap[action] || action;
    }
}