class MessageApp {
    constructor() {
        this.authEnabled = false;
        this.authHeader = null;
        this.init();
    }

    async init() {
        console.log('🚀 Инициализация приложения...');
        await this.checkAuthStatus();
        this.setupEventListeners();
        this.loadContacts();
        this.loadMessageHistory();
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/config-status');
            if (response.status === 401) {
                this.authEnabled = true;
                this.showLoginPrompt();
            } else {
                const config = await response.json();
                this.authEnabled = config.auth.enabled;
            }
        } catch (error) {
            console.log('Не удалось проверить статус аутентификации');
        }
    }

    showLoginPrompt() {
        const username = prompt('Введите имя пользователя:');
        const password = prompt('Введите пароль:');
        
        if (username && password) {
            this.setBasicAuth(username, password);
        } else {
            alert('Требуется аутентификация');
            this.showLoginPrompt();
        }
    }

    setBasicAuth(username, password) {
        this.authHeader = 'Basic ' + btoa(username + ':' + password);
        this.loadContacts();
        this.loadMessageHistory();
    }

    async makeAuthenticatedRequest(url, options = {}) {
        if (this.authEnabled && this.authHeader) {
            options.headers = {
                ...options.headers,
                'Authorization': this.authHeader
            };
        }

        const response = await fetch(url, options);
        
        if (response.status === 401) {
            this.showLoginPrompt();
            throw new Error('Требуется аутентификация');
        }

        return response;
    }

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        
        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Форма контакта
        document.getElementById('contactForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addContact();
        });

        // Форма сообщения
        document.getElementById('messageForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        console.log('✅ Обработчики событий настроены');
    }

    switchTab(tabName) {
        console.log('🔄 Переключение на вкладку:', tabName);
        
        // Обновляем активные кнопки навигации
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Показываем активный контент
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Загружаем данные для вкладки
        if (tabName === 'contacts') {
            this.loadContacts();
        } else if (tabName === 'history') {
            this.loadMessageHistory();
        }
    }

    async loadContacts() {
        try {
            console.log('📋 Загрузка контактов...');
            const response = await this.makeAuthenticatedRequest('/api/contacts');
            const contacts = await response.json();
            this.renderContacts(contacts);
        } catch (error) {
            this.showAlert('Ошибка загрузки контактов', 'error');
        }
    }

    renderContacts(contacts) {
        const contactsList = document.getElementById('contactsList');
        const contactsTable = document.getElementById('contactsTable');

        if (!contactsList || !contactsTable) {
            console.error('❌ Элементы для контактов не найдены');
            return;
        }

        // Для формы отправки
        contactsList.innerHTML = contacts.map(contact => `
            <div class="contact-item">
                <input type="checkbox" name="recipients" value="${contact.id}">
                <span>${contact.name} (${contact.email || contact.telegram_chat_id || contact.vk_id || 'нет контакта'})</span>
            </div>
        `).join('');

        // Для таблицы адресной книги
        contactsTable.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Имя</th>
                        <th>Email</th>
                        <th>Telegram Chat ID</th>
                        <th>VK ID</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${contacts.map(contact => `
                        <tr>
                            <td>${contact.name}</td>
                            <td>${contact.email || '-'}</td>
                            <td>${contact.telegram_chat_id || '-'}</td>
                            <td>${contact.vk_id || '-'}</td>
                            <td>
                                <button class="btn-danger" onclick="app.deleteContact(${contact.id})">
                                    Удалить
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

async addContact() {
    const name = document.getElementById('contactName').value;
    const email = document.getElementById('contactEmail').value;
    const telegram = document.getElementById('contactTelegram').value;
    const vkId = document.getElementById('contactVK').value;

    console.log('📝 Данные для добавления контакта:', {
        name, email, telegram, vkId
    });

    if (!name.trim()) {
        this.showAlert('Введите имя контакта', 'error');
        return;
    }

    try {
        const response = await this.makeAuthenticatedRequest('/api/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name.trim(),
                email: email ? email.trim() : null,
                telegram_chat_id: telegram ? telegram.trim() : null,
                vk_id: vkId ? vkId.trim() : null
            })
        });

        console.log('📡 Ответ сервера:', response.status, response.statusText);

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Контакт добавлен:', result);
            document.getElementById('contactForm').reset();
            this.loadContacts();
            this.showAlert('Контакт успешно добавлен', 'success');
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', errorText);
            throw new Error('Ошибка при добавлении контакта: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка при добавлении контакта:', error);
        this.showAlert('Ошибка при добавлении контакта: ' + error.message, 'error');
    }
}

    async deleteContact(contactId) {
        if (!confirm('Вы уверены, что хотите удалить этот контакт?')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/contacts/${contactId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.loadContacts();
                this.showAlert('Контакт успешно удален', 'success');
            } else {
                throw new Error('Ошибка при удалении контакта');
            }
        } catch (error) {
            this.showAlert('Ошибка при удалении контакта', 'error');
        }
    }

    async sendMessage() {
        const formData = new FormData(document.getElementById('messageForm'));
        
        // Собираем получателей
        const recipients = Array.from(document.querySelectorAll('input[name="recipients"]:checked'))
            .map(checkbox => checkbox.value);

        const deliveryMethods = Array.from(document.querySelectorAll('input[name="deliveryMethods"]:checked'))
            .map(checkbox => checkbox.value);

        const customAddresses = document.getElementById('customAddresses').value;
        const content = document.getElementById('content').value;
        const subject = document.getElementById('subject').value;

        // Валидация
        if (deliveryMethods.length === 0) {
            this.showAlert('Выберите хотя бы один способ доставки', 'error');
            return;
        }

        if (recipients.length === 0 && !customAddresses.trim()) {
            this.showAlert('Выберите получателей или укажите адреса', 'error');
            return;
        }

        if (!content.trim()) {
            this.showAlert('Введите текст сообщения', 'error');
            return;
        }

        // Показываем индикатор загрузки
        const submitBtn = document.querySelector('#messageForm button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Отправка...';
        submitBtn.disabled = true;

        try {
            // Правильно формируем FormData
            const sendFormData = new FormData();
            
            // Добавляем текстовые поля
            sendFormData.append('subject', subject || '');
            sendFormData.append('content', content);
            sendFormData.append('recipients', JSON.stringify(recipients));
            sendFormData.append('deliveryMethods', JSON.stringify(deliveryMethods));
            sendFormData.append('customAddresses', JSON.stringify(
                customAddresses.trim() ? 
                customAddresses.split(',').map(addr => addr.trim()).filter(addr => addr) : 
                []
            ));

            // Добавляем файлы
            const fileInput = document.getElementById('attachments');
            for (let i = 0; i < fileInput.files.length; i++) {
                sendFormData.append('attachments', fileInput.files[i]);
            }

            const response = await this.makeAuthenticatedRequest('/api/send-message', {
                method: 'POST',
                body: sendFormData
            });

            const result = await response.json();

            if (result.success) {
                document.getElementById('messageForm').reset();
                this.showAlert('Сообщение отправлено в обработку', 'success');
                this.loadMessageHistory();
                
                // Переключаем на вкладку истории
                this.switchTab('history');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showAlert('Ошибка при отправке сообщения: ' + error.message, 'error');
        } finally {
            // Восстанавливаем кнопку
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async loadMessageHistory() {
        try {
            console.log('📜 Загрузка истории сообщений...');
            const response = await this.makeAuthenticatedRequest('/api/messages');
            const messages = await response.json();
            this.renderMessageHistory(messages);
        } catch (error) {
            this.showAlert('Ошибка загрузки истории', 'error');
        }
    }

    renderMessageHistory(messages) {
        const messagesTable = document.getElementById('messagesTable');
        
        if (!messagesTable) {
            console.error('❌ Элемент для истории сообщений не найден');
            return;
        }
        
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
                        <th>Методы доставки</th>
                        <th>Статус</th>
                        <th>Дата</th>
                    </tr>
                </thead>
                <tbody>
                    ${messages.map(message => `
                        <tr>
                            <td>${message.id}</td>
                            <td>${message.subject || 'Без темы'}</td>
                            <td>${message.recipient_names ? message.recipient_names.split(',').slice(0, 2).join(', ') : 'Пользовательские адреса'} ${message.recipient_count > 2 ? `и еще ${message.recipient_count - 2}` : ''}</td>
                            <td>${message.delivery_methods}</td>
                            <td class="status-${message.status}">${this.getStatusText(message.status)}</td>
                            <td>${new Date(message.created_at).toLocaleString()}</td>
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
            'failed': '❌ Ошибка'
        };
        return statusMap[status] || status;
    }

    showAlert(message, type, timeout = 5000) {
        // Удаляем существующие алерты
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <span>${message}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">×</button>
        `;

        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            activeTab.insertBefore(alert, activeTab.firstChild);
        }

        // Автоматически скрываем через указанное время
        if (timeout > 0) {
            setTimeout(() => {
                if (alert.parentElement) {
                    alert.remove();
                }
            }, timeout);
        }
    }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, инициализация приложения...');
    window.app = new MessageApp();
});

// Глобальные функции для обработки событий в HTML
function deleteContact(contactId) {
    if (window.app) {
        window.app.deleteContact(contactId);
    }
}