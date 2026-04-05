const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// 模拟数据
let partners = [
    { id: 1, hobby: "🏸 羽毛球", freeTime: "周二周四下午", contact: "wechat123", campus: "闵行校区", note: "寻找球友", maxMembers: 4, currentMembers: 2, likes: 3, comments: [] }
];

// API 路由
app.get('/api/partners', (req, res) => {
    res.json(partners);
});

app.post('/api/partners', (req, res) => {
    const newPartner = { id: Date.now(), ...req.body, currentMembers: 1, likes: 0, comments: [] };
    partners.unshift(newPartner);
    res.json({ success: true, id: newPartner.id });
});

app.post('/api/register', (req, res) => {
    res.json({ success: true, message: "注册成功" });
});

app.post('/api/login', (req, res) => {
    res.json({ success: true, user: { username: req.body.username, name: req.body.username, avatar: "🧑", notifications: [] } });
});

// 前端路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器运行在端口 ${PORT}`);
});
