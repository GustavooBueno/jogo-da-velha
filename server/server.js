const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt'); // Biblioteca MQTT

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configurações
const PORT = 3000;
const MQTT_BROKER_URL = 'mqtt://test.mosquitto.org';
const MQTT_TOPIC_LOGS = 'tic-tac-toe/logs';

// MQTT Client
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log('Conectado ao broker MQTT');
});

// Funções para logs e persistência com MQTT
const logEvent = (message) => {
    const logMessage = {
        timestamp: new Date().toISOString(),
        message,
    };
    console.log(`[LOG] ${logMessage.timestamp} - ${logMessage.message}`);
    mqttClient.publish(MQTT_TOPIC_LOGS, JSON.stringify(logMessage));
};

// Variáveis do jogo
let players = [];
let games = {};
let ranking = {}; // Armazenamento do ranking

// Servir arquivos estáticos para o cliente
app.use(express.static('../client'));

// Atualizar ranking
const updateRanking = (players, winnerSymbol) => {
    const winner = players.find((player) => player.symbol === winnerSymbol);
    if (winner) {
        ranking[winner.name] = (ranking[winner.name] || 0) + 1;
        logEvent(`Ranking atualizado: ${winner.name} agora tem ${ranking[winner.name]} pontos.`);
    }
};

const broadcastRanking = () => {
    const sortedRanking = Object.entries(ranking)
        .sort(([, pointsA], [, pointsB]) => pointsB - pointsA)
        .reduce((acc, [name, points]) => ({ ...acc, [name]: points }), {});
    io.emit('rankingUpdated', sortedRanking);

    // Publicar ranking atualizado no MQTT
    mqttClient.publish(MQTT_TOPIC_LOGS, JSON.stringify({ event: 'rankingUpdated', ranking: sortedRanking }));
};

// Lógica do WebSocket
io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('join_game', (playerName) => {
        players.push({ id: socket.id, name: playerName });
        ranking[playerName] = ranking[playerName] || 0; // Garante o jogador no ranking
    
        let gameId;
    
        // Procurar um jogo aguardando um jogador
        for (const [id, game] of Object.entries(games)) {
            if (game.players.length === 1) {
                game.players.push({ id: socket.id, name: playerName, symbol: 'O' }); // Jogador 2 é 'O'
                gameId = id;
                break;
            }
        }
    
        // Criar um novo jogo se nenhum estiver disponível
        if (!gameId) {
            gameId = socket.id; // Use o ID do socket como gameId
            games[gameId] = {
                players: [{ id: socket.id, name: playerName, symbol: 'X' }], // Jogador 1 é 'X'
                board: Array(9).fill(null),
                currentTurn: 'X',
            };
        }
    
        socket.join(gameId); // Adiciona o jogador à sala do jogo
        socket.emit('game_joined', { gameId, board: games[gameId].board });
        io.to(gameId).emit('update_board', games[gameId].board);
    
        // Log de entrada no MQTT
        logEvent(`Jogador ${playerName} entrou na sala ${gameId}`);
    });

    socket.on('make_move', ({ gameId, position }) => {
        const game = games[gameId];
        if (!game) return;

        const player = game.players.find((p) => p.id === socket.id);
        if (!player) return;

        if (game.currentTurn !== player.symbol) {
            socket.emit('error_message', 'Não é sua vez de jogar!');
            return;
        }

        if (!game.board[position]) {
            game.board[position] = game.currentTurn;
            game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

            const result = checkGameResult(game.board);
            if (result) {
                io.to(gameId).emit('game_over', { result, board: game.board });
                if (result !== 'Draw') {
                    updateRanking(game.players, result);
                    broadcastRanking();
                }
            } else {
                io.to(gameId).emit('update_board', { board: game.board, currentTurn: game.currentTurn });
            }
        }
    });

    socket.on('reset_game', (gameId) => {
        const game = games[gameId];
        if (!game) {
            socket.emit('error_message', 'Jogo não encontrado.');
            return;
        }
    
        // Reiniciar o estado do jogo
        game.board = Array(9).fill(null); // Tabuleiro vazio
        game.currentTurn = 'X'; // Reinicia o turno para 'X'
    
        // Notificar os jogadores da sala sobre o reset
        io.to(gameId).emit('game_reset', { board: game.board, currentTurn: game.currentTurn });
    
        // Log no MQTT
        logEvent(`O jogo ${gameId} foi reiniciado.`);
    });
    

    socket.on('disconnect', () => {
        const disconnectedPlayer = players.find((player) => player.id === socket.id);
        players = players.filter((player) => player.id !== socket.id);

        if (disconnectedPlayer) {
            logEvent(`Jogador ${disconnectedPlayer.name} desconectou.`);
        }
        console.log('Jogador desconectado:', socket.id);
    });
});

// Verificar resultados do jogo
function checkGameResult(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Linhas
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Colunas
        [0, 4, 8], [2, 4, 6],            // Diagonais
    ];

    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // Retorna 'X' ou 'O' como vencedor
        }
    }

    if (board.every((cell) => cell)) {
        return 'Draw'; // Empate
    }

    return null; // Jogo em andamento
}

// Inicializar servidor
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
