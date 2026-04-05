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

// 文件上传配置（用于图片）
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ============ 初始化SQLite数据库 ============
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // 用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
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
        )
    `);

    // 搭子帖子表
    db.run(`
        CREATE TABLE IF NOT EXISTS partners (
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
        )
    `);

    // 评论表
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partnerId INTEGER NOT NULL,
            text TEXT NOT NULL,
            userName TEXT NOT NULL,
            time TEXT NOT NULL,
            FOREIGN KEY (partnerId) REFERENCES partners(id) ON DELETE CASCADE
        )
    `);

    // 活动表（内置数据）
    db.run(`
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            time TEXT,
            location TEXT,
            max INTEGER,
            current INTEGER,
            img TEXT
        )
    `);

    // 插入默认活动（如果为空）
    db.get("SELECT COUNT(*) as count FROM activities", (err, row) => {
        if (row.count === 0) {
            const defaultActs = [
                { title: "🏸 羽毛球友谊赛", time: "4月10日 15:00", location: "闵行校区羽毛球馆", max: 8, current: 3, img: "/uploads/default-badminton.jpg" },
                { title: "📚 期末自习冲刺团", time: "每晚19-22点", location: "中北图书馆", max: 10, current: 5, img: "/uploads/default-study.jpg" },
                { title: "🎭 剧本杀周末局", time: "周六下午", location: "校内活动室", max: 6, current: 4, img: "/uploads/default-drama.jpg" }
            ];
            defaultActs.forEach(act => {
                db.run(`INSERT INTO activities (title, time, location, max, current, img) VALUES (?,?,?,?,?,?)`,
                    [act.title, act.time, act.location, act.max, act.current, act.img]);
            });
        }
    });
});

// ============ API 路由 ============

// 注册
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

// 登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (!user) return res.status(401).json({ error: '用户名或密码错误' });
        
        // 解析JSON字段
        user.interestTags = JSON.parse(user.interestTags || '[]');
        user.myJoins = JSON.parse(user.myJoins || '[]');
        user.myFavs = JSON.parse(user.myFavs || '[]');
        user.myApplications = JSON.parse(user.myApplications || '[]');
        user.notifications = JSON.parse(user.notifications || '[]');
        
        res.json({ success: true, user });
    });
});

// 更新用户信息
app.post('/api/updateUser', (req, res) => {
    const { username, name, avatar, bio, interestTags, myJoins, myFavs, myApplications, notifications } = req.body;
    
    db.run(`UPDATE users SET name=?, avatar=?, bio=?, interestTags=?, myJoins=?, myFavs=?, myApplications=?, notifications=? WHERE username=?`,
        [name, avatar, bio, JSON.stringify(interestTags), JSON.stringify(myJoins), JSON.stringify(myFavs), JSON.stringify(myApplications), JSON.stringify(notifications), username],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// 获取所有搭子帖子
app.get('/api/partners', (req, res) => {
    db.all(`SELECT p.*, 
            (SELECT json_group_array(json_object('id',c.id,'text',c.text,'userName',c.userName,'time',c.time)) 
             FROM comments c WHERE c.partnerId = p.id) as commentsJson
            FROM partners p ORDER BY p.createdAt DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const partners = rows.map(row => ({
            ...row,
            comments: row.commentsJson ? JSON.parse(row.commentsJson) : [],
            likes: row.likes || 0,
            currentMembers: row.currentMembers || 1
        }));
        res.json(partners);
    });
});

// 发布搭子（支持图片base64）
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

// 删除搭子
app.delete('/api/partners/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM partners WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 点赞/取消点赞
app.post('/api/partners/:id/like', (req, res) => {
    const { id } = req.params;
    const { increment } = req.body;
    db.run(`UPDATE partners SET likes = likes + ? WHERE id = ?`, [increment ? 1 : -1, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 添加评论
app.post('/api/partners/:id/comment', (req, res) => {
    const { id } = req.params;
    const { text, userName, time } = req.body;
    db.run(`INSERT INTO comments (partnerId, text, userName, time) VALUES (?,?,?,?)`,
        [id, text, userName, time], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, commentId: this.lastID });
        });
});

// 申请加入（增加currentMembers）
app.post('/api/partners/:id/join', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE partners SET currentMembers = currentMembers + 1 WHERE id = ? AND currentMembers < maxMembers`, [id], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ error: '人数已满或操作失败' });
        res.json({ success: true });
    });
});

// 获取活动列表
app.get('/api/activities', (req, res) => {
    db.all(`SELECT * FROM activities`, (err, rows) => {
        res.json(rows || []);
    });
});

// 报名活动
app.post('/api/activities/:id/join', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE activities SET current = current + 1 WHERE id = ? AND current < max`, [id], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ error: '活动已满员' });
        res.json({ success: true });
    });
});

// 图片上传（保留作为备选）
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '没有文件' });
    res.json({ imageUrl: '/uploads/' + req.file.filename });
});
// 在文件末尾，app.listen 之前加上这行
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT, () => {
    console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 数据存储在 database.sqlite`);
});
