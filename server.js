const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 数据库路径（Railway 兼容）
const dbPath = '/tmp/database.sqlite';
const db = new sqlite3.Database(dbPath);

console.log(`📁 数据库路径: ${dbPath}`);

// 创建表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT DEFAULT '🧑',
        bio TEXT DEFAULT '未设置个人简介',
        interestTags TEXT DEFAULT '["羽毛球","自习"]',
        myJoins TEXT DEFAULT '[]',
        myFavs TEXT DEFAULT '[]',
        myApplications TEXT DEFAULT '[]',
        notifications TEXT DEFAULT '[]',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hobby TEXT NOT NULL,
        freeTime TEXT NOT NULL,
        contact TEXT NOT NULL,
        campus TEXT,
        note TEXT,
        type TEXT,
        maxMembers INTEGER DEFAULT 4,
        currentMembers INTEGER DEFAULT 1,
        img TEXT,
        likes INTEGER DEFAULT 0,
        createdBy TEXT NOT NULL,
        createdByUser TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partnerId INTEGER NOT NULL,
        text TEXT NOT NULL,
        userName TEXT NOT NULL,
        time TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        time TEXT,
        location TEXT,
        max INTEGER,
        current INTEGER,
        img TEXT
    )`);

    console.log('✅ 数据库表创建成功');
});

// ============ API 路由 ============
app.post('/api/register', (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名密码不能为空' });
    
    db.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
        if (row) return res.status(400).json({ error: '用户名已存在' });
        
        db.run(`INSERT INTO users (username, password, name) VALUES (?,?,?)`,
            [username, password, name || username], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, userId: this.lastID });
            });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (!user) return res.status(401).json({ error: '用户名或密码错误' });
        
        try {
            user.interestTags = JSON.parse(user.interestTags || '[]');
            user.myJoins = JSON.parse(user.myJoins || '[]');
            user.myFavs = JSON.parse(user.myFavs || '[]');
            user.myApplications = JSON.parse(user.myApplications || '[]');
            user.notifications = JSON.parse(user.notifications || '[]');
        } catch(e) {}
        
        res.json({ success: true, user });
    });
});

app.post('/api/updateUser', (req, res) => {
    const { username, name, avatar, bio, interestTags, myJoins, myFavs, myApplications, notifications } = req.body;
    
    db.run(`UPDATE users SET name=?, avatar=?, bio=?, interestTags=?, myJoins=?, myFavs=?, myApplications=?, notifications=? WHERE username=?`,
        [name, avatar, bio, JSON.stringify(interestTags), JSON.stringify(myJoins), JSON.stringify(myFavs), JSON.stringify(myApplications), JSON.stringify(notifications), username],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.get('/api/partners', (req, res) => {
    db.all(`SELECT * FROM partners ORDER BY createdAt DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/partners', (req, res) => {
    const { hobby, freeTime, contact, campus, note, type, maxMembers, img, createdBy, createdByUser } = req.body;
    
    db.run(`INSERT INTO partners (hobby, freeTime, contact, campus, note, type, maxMembers, currentMembers, img, likes, createdBy, createdByUser)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [hobby, freeTime, contact, campus, note, type, maxMembers, 1, img || '', 0, createdBy, createdByUser],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.delete('/api/partners/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM partners WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/partners/:id/like', (req, res) => {
    const { id } = req.params;
    const { increment } = req.body;
    db.run(`UPDATE partners SET likes = likes + ? WHERE id = ?`, [increment ? 1 : -1, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/partners/:id/comment', (req, res) => {
    const { id } = req.params;
    const { text, userName, time } = req.body;
    db.run(`INSERT INTO comments (partnerId, text, userName, time) VALUES (?,?,?,?)`,
        [id, text, userName, time], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.post('/api/partners/:id/join', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE partners SET currentMembers = currentMembers + 1 WHERE id = ? AND currentMembers < maxMembers`, [id], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ error: '人数已满或操作失败' });
        res.json({ success: true });
    });
});

app.get('/api/activities', (req, res) => {
    db.all(`SELECT * FROM activities`, (err, rows) => {
        res.json(rows || []);
    });
});

// 静态文件服务 + 前端路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ⭐ 关键：监听所有网络接口
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器运行在 http://0.0.0.0:${PORT}`);
    console.log(`📁 数据库路径: ${dbPath}`);
});
