const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

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
        ranking[winner.name] = (ranking[winner.name] || 0) + 1; // Adiciona ou incrementa pontuação
    }
};

const broadcastRanking = () => {
    // Ordena o ranking por pontuação antes de enviar
    const sortedRanking = Object.entries(ranking)
        .sort(([, pointsA], [, pointsB]) => pointsB - pointsA)
        .reduce((acc, [name, points]) => ({ ...acc, [name]: points }), {});
    io.emit('rankingUpdated', sortedRanking);
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
                currentTurn: 'X'
            };
        }
    
        socket.join(gameId); // Adiciona o jogador à sala do jogo
        socket.emit('game_joined', { gameId, board: games[gameId].board });
        io.to(gameId).emit('update_board', games[gameId].board);
    
        console.log(`Jogador ${playerName} (${gameId}) entrou no jogo`);
    });

    socket.on('reset_game', (gameId) => {
        const game = games[gameId];
        if (!game) {
            socket.emit('error_message', 'O jogo não foi encontrado. Por favor, reconecte.');
            return;
        }
    
        // Reiniciar o estado do jogo
        game.board = Array(9).fill(null); // Limpar o tabuleiro
        game.currentTurn = 'X'; // O turno inicial volta para 'X'
    
        // Notificar todos os jogadores na sala do novo estado
        io.to(gameId).emit('game_reset', { board: game.board, currentTurn: game.currentTurn });
    
        console.log(`Jogo ${gameId} reiniciado com sucesso.`);
    });

    socket.on('make_move', ({ gameId, position }) => {
        const game = games[gameId];
        if (!game) return;
    
        const player = game.players.find((p) => p.id === socket.id);
        if (!player) return;
    
        // Validar turno
        if (game.currentTurn !== player.symbol) {
            socket.emit('error_message', 'Não é sua vez de jogar!');
            return;
        }
    
        // Atualizar tabuleiro
        if (!game.board[position]) {
            game.board[position] = game.currentTurn;
            game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';
    
            // Verificar vitória ou empate
            const result = checkGameResult(game.board);
            if (result) {
                io.to(gameId).emit('game_over', { result, board: game.board });
                if (result !== 'Draw') {
                    updateRanking(game.players, result); // Atualiza o ranking se houver um vencedor
                    broadcastRanking(); // Envia o ranking atualizado para todos os clientes
                }
            } else {
                io.to(gameId).emit('update_board', { board: game.board, currentTurn: game.currentTurn });
            }
        }
    });

    socket.on('disconnect', () => {
        players = players.filter((player) => player.id !== socket.id);
        console.log('Jogador desconectado:', socket.id);
    });
});

// Verificar resultados do jogo
function checkGameResult(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Linhas
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Colunas
        [0, 4, 8], [2, 4, 6]            // Diagonais
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
