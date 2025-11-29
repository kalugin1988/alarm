const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'messages.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Инициализация БД
function initialize() {
    db.serialize(() => {
        // Создаем таблицу contacts если не существует (добавляем vk_id)
        db.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            telegram_chat_id TEXT,
            vk_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Создаем таблицу messages если не существует (с delivery_info)
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT,
            content TEXT NOT NULL,
            delivery_methods TEXT NOT NULL,
            delivery_info TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending'
        )`);

        // Создаем таблицу message_recipients если не существует
        db.run(`CREATE TABLE IF NOT EXISTS message_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            contact_id INTEGER,
            custom_address TEXT,
            FOREIGN KEY (message_id) REFERENCES messages (id),
            FOREIGN KEY (contact_id) REFERENCES contacts (id)
        )`);

        // Создаем таблицу attachments если не существует
        db.run(`CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            path TEXT NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages (id)
        )`);

        // Таблица для истории статусов
        db.run(`CREATE TABLE IF NOT EXISTS message_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT,
            action TEXT,
            details TEXT,
            FOREIGN KEY (message_id) REFERENCES messages (id)
        )`);

        console.log('✅ База данных инициализирована');
    });
}

// Контакты
function getAllContacts(callback) {
    db.all('SELECT * FROM contacts ORDER BY name', callback);
}

function addContact(name, email, telegram_chat_id, vk_id, callback) {
    db.run('INSERT INTO contacts (name, email, telegram_chat_id, vk_id) VALUES (?, ?, ?, ?)',
        [name, email, telegram_chat_id, vk_id],
        function(err) {
            callback(err, this.lastID);
        });
}

function deleteContact(id, callback) {
    db.run('DELETE FROM contacts WHERE id = ?', id, function(err) {
        callback(err, this.changes);
    });
}

// Сообщения
function addMessage(subject, content, delivery_methods, callback) {
    db.run('INSERT INTO messages (subject, content, delivery_methods) VALUES (?, ?, ?)',
        [subject, content, delivery_methods],
        function(err) {
            callback(err, this.lastID);
        });
}

function getMessage(id, callback) {
    db.get('SELECT * FROM messages WHERE id = ?', [id], callback);
}

function updateMessageStatus(id, status, delivery_info) {
    db.run('UPDATE messages SET status = ?, delivery_info = ? WHERE id = ?', 
        [status, delivery_info, id], function(err) {
            if (err) {
                console.error('Error updating message status:', err);
            } else {
                console.log(`✅ Статус сообщения ${id} обновлен на: ${status}`);
            }
        });
}

function getAllMessages(callback) {
    db.all(`SELECT m.*, 
                   GROUP_CONCAT(DISTINCT c.name) as recipient_names,
                   COUNT(DISTINCT mr.id) as recipient_count
            FROM messages m
            LEFT JOIN message_recipients mr ON m.id = mr.message_id
            LEFT JOIN contacts c ON mr.contact_id = c.id
            GROUP BY m.id
            ORDER BY m.created_at DESC`, callback);
}

function getMessageDetails(messageId, callback) {
    db.get(`SELECT m.*, 
                   GROUP_CONCAT(DISTINCT c.name) as recipient_names,
                   COUNT(DISTINCT mr.id) as recipient_count
            FROM messages m
            LEFT JOIN message_recipients mr ON m.id = mr.message_id
            LEFT JOIN contacts c ON mr.contact_id = c.id
            WHERE m.id = ?
            GROUP BY m.id`, [messageId], callback);
}

// Получатели сообщений
function addMessageRecipient(message_id, contact_id, custom_address) {
    db.run('INSERT INTO message_recipients (message_id, contact_id, custom_address) VALUES (?, ?, ?)',
        [message_id, contact_id, custom_address], function(err) {
            if (err) {
                console.error('Error adding message recipient:', err);
            }
        });
}

function getMessageRecipients(message_id, callback) {
    db.all(`SELECT mr.*, c.name, c.email, c.telegram_chat_id, c.vk_id
            FROM message_recipients mr 
            LEFT JOIN contacts c ON mr.contact_id = c.id 
            WHERE mr.message_id = ?`, [message_id], callback);
}

// Вложения
function addAttachment(message_id, filename, original_name, path) {
    db.run('INSERT INTO attachments (message_id, filename, original_name, path) VALUES (?, ?, ?, ?)',
        [message_id, filename, original_name, path], function(err) {
            if (err) {
                console.error('Error adding attachment:', err);
            }
        });
}

function getAttachments(message_id, callback) {
    db.all('SELECT * FROM attachments WHERE message_id = ?', [message_id], callback);
}

// История статусов
function addStatusHistory(message_id, historyEntry) {
    const { timestamp, action, status, details } = historyEntry;
    
    db.run(`INSERT INTO message_status_history 
            (message_id, timestamp, status, action, details) 
            VALUES (?, ?, ?, ?, ?)`,
        [message_id, timestamp, status, action, details || ''],
        function(err) {
            if (err) {
                console.error('Error adding status history:', err);
            }
        });
}

function getStatusHistory(message_id, callback) {
    db.all(`SELECT * FROM message_status_history 
            WHERE message_id = ? 
            ORDER BY timestamp DESC`, 
        [message_id], callback);
}

module.exports = {
    initialize,
    getAllContacts,
    addContact,
    deleteContact,
    addMessage,
    getMessage,
    updateMessageStatus,
    getAllMessages,
    getMessageDetails,
    addMessageRecipient,
    getMessageRecipients,
    addAttachment,
    getAttachments,
    addStatusHistory,
    getStatusHistory
};