class MessageManager {
    constructor(app) {
        this.app = app;
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
            this.app.showAlert('Выберите хотя бы один способ доставки', 'error');
            return;
        }

        if (recipients.length === 0 && !customAddresses.trim()) {
            this.app.showAlert('Выберите получателей или укажите адреса', 'error');
            return;
        }

        if (!content.trim()) {
            this.app.showAlert('Введите текст сообщения', 'error');
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

            const response = await this.app.makeAuthenticatedRequest('/api/send-message', {
                method: 'POST',
                body: sendFormData
            });

            const result = await response.json();

            if (result.success) {
                document.getElementById('messageForm').reset();
                this.app.showAlert('Сообщение отправлено в обработку', 'success');
                this.app.historyManager.loadMessageHistory();
                
                // Переключаем на вкладку истории
                this.app.uiManager.switchTab('history');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.app.showAlert('Ошибка при отправке сообщения: ' + error.message, 'error');
        } finally {
            // Восстанавливаем кнопку
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }
}