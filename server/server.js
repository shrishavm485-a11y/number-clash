// Entry point: static hosting + Socket.IO. All game logic lives in gameManager.js
const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const game = require('./gameManager');
const app = express(), server = http.createServer(app), io = new Server(server);
app.use(express.static(path.join(__dirname, '../client')));
io.on('connection', s => game.attach(io, s));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('NUMBER CLASH on http://localhost:' + PORT));
