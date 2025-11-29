class UIManager {
    constructor(app) {
        this.app = app;
    }

    setupEventListeners() {
        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Форма контакта
        document.getElementById('contactForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.contactsManager.addContact();
        });

        // Форма сообщения
        document.getElementById('messageForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.app.messageManager.sendMessage();
        });

        // Обновление статуса методов доставки
        this.updateDeliveryMethodsStatus();
    }

    switchTab(tabName) {
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
            this.app.contactsManager.loadContacts();
        } else if (tabName === 'history') {
            this.app.historyManager.loadMessageHistory();
        }
    }

    async updateDeliveryMethodsStatus() {
        try {
            const response = await this.app.makeAuthenticatedRequest('/api/config-status');
            const config = await response.json();
            
            // Обновляем подписи методов доставки
            const emailCheckbox = document.querySelector('input[value="email"]');
            const telegramCheckbox = document.querySelector('input[value="telegram"]');
            const vkCheckbox = document.querySelector('input[value="vk"]');
            
            if (emailCheckbox) {
                const emailLabel = emailCheckbox.parentElement;
                const isConfigured = config.email.dadehard.configured || config.email.yandex.configured;
                emailLabel.innerHTML = `<input type="checkbox" name="deliveryMethods" value="email"> 
                    Email ${isConfigured ? '✅' : '❌'}`;
            }
            
            if (telegramCheckbox) {
                const telegramLabel = telegramCheckbox.parentElement;
                telegramLabel.innerHTML = `<input type="checkbox" name="deliveryMethods" value="telegram"> 
                    Telegram ${config.telegram.configured ? '✅' : '❌'}`;
            }
            
            if (vkCheckbox) {
                const vkLabel = vkCheckbox.parentElement;
                vkLabel.innerHTML = `<input type="checkbox" name="deliveryMethods" value="vk"> 
                    VK ${config.vk.configured ? '✅' : '❌'}`;
            }
            
            // Переустанавливаем обработчики событий
            this.setupCheckboxEventListeners();
            
        } catch (error) {
            console.log('Не удалось загрузить статус методов доставки');
        }
    }

    setupCheckboxEventListeners() {
        // Обработчики для чекбоксов методов доставки
        document.querySelectorAll('input[name="deliveryMethods"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.validateDeliveryMethods();
            });
        });
    }

    validateDeliveryMethods() {
        const selectedMethods = Array.from(document.querySelectorAll('input[name="deliveryMethods"]:checked'))
            .map(checkbox => checkbox.value);
        
        if (selectedMethods.length === 0) {
            this.app.showAlert('Выберите хотя бы один способ доставки', 'error', 3000);
        }
    }

    updateUIForAuth() {
        if (this.app.authEnabled) {
            document.body.classList.add('auth-enabled');
        }
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
        activeTab.insertBefore(alert, activeTab.firstChild);

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