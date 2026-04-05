const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>测试页面</title></head>
        <body>
            <h1>✅ 服务器运行成功！</h1>
            <p>端口: ${PORT}</p>
            <p>如果你能看到这个页面，说明 Railway 部署正常。</p>
        </body>
        </html>
    `);
});

app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', port: PORT, message: 'API 正常工作' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器运行在端口 ${PORT}`);
});
