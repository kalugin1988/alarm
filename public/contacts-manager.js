class ContactsManager {
    constructor(app) {
        this.app = app;
    }

    async loadContacts() {
        try {
            const response = await this.app.makeAuthenticatedRequest('/api/contacts');
            const contacts = await response.json();
            this.renderContacts(contacts);
        } catch (error) {
            this.app.showAlert('Ошибка загрузки контактов', 'error');
        }
    }

    renderContacts(contacts) {
        const contactsList = document.getElementById('contactsList');
        const contactsTable = document.getElementById('contactsTable');

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
                                <button class="btn-danger" onclick="app.contactsManager.deleteContact(${contact.id})">
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

        if (!name.trim()) {
            this.app.showAlert('Введите имя контакта', 'error');
            return;
        }

        try {
            const response = await this.app.makeAuthenticatedRequest('/api/contacts', {
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

            if (response.ok) {
                document.getElementById('contactForm').reset();
                this.loadContacts();
                this.app.showAlert('Контакт успешно добавлен', 'success');
            } else {
                throw new Error('Ошибка при добавлении контакта');
            }
        } catch (error) {
            this.app.showAlert('Ошибка при добавлении контакта', 'error');
        }
    }

    async deleteContact(contactId) {
        if (!confirm('Вы уверены, что хотите удалить этот контакт?')) {
            return;
        }

        try {
            const response = await this.app.makeAuthenticatedRequest(`/api/contacts/${contactId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.loadContacts();
                this.app.showAlert('Контакт успешно удален', 'success');
            } else {
                throw new Error('Ошибка при удалении контакта');
            }
        } catch (error) {
            this.app.showAlert('Ошибка при удалении контакта', 'error');
        }
    }
}