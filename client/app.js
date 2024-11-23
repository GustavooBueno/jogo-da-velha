const socket = io();
let playerName = '';
let gameId = '';
let currentTurn = 'X';

// Seletores de elementos
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const joinButton = document.getElementById('join-btn');
const board = document.getElementById('board');
const gameStatus = document.getElementById('game-status');
const resetButton = document.getElementById('reset-btn');
const playerInfo = document.getElementById('player-info');
const rankingScreen = document.getElementById('ranking-screen');
const rankingList = document.getElementById('ranking-list');

// Função para gerar o tabuleiro
function createBoard() {
    board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        board.appendChild(cell);

        // Adicionar evento de clique
        cell.addEventListener('click', () => makeMove(i));
    }
}


// Entrar no jogo
joinButton.addEventListener('click', () => {
    playerName = playerNameInput.value.trim();
    if (!playerName) return alert('Digite um nome para continuar!');

    socket.emit('join_game', playerName);
    loginScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    playerInfo.textContent = `Jogador: ${playerName}`;
});

socket.on('game_joined', ({ gameId: id, board }) => {
    gameId = id;
    createBoard();
    updateBoard(board); // Atualiza o tabuleiro inicial
});


// Fazer um movimento
function makeMove(index) {
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (!cell || cell.textContent) return;

    socket.emit('make_move', { gameId, position: index });
}

// Atualizações do servidor
socket.on('update_board', ({ board, currentTurn }) => {
    updateBoard(board); // Atualizar tabuleiro
    gameStatus.textContent = `Turno de: ${currentTurn}`; // Atualizar turno
});

socket.on('game_reset', ({ board, currentTurn }) => {
    updateBoard(board); // Limpa o tabuleiro visualmente
    gameStatus.textContent = `Novo jogo iniciado! Turno de: ${currentTurn}`;
    resetButton.style.display = 'none'; // Oculta o botão de reset
});

socket.on('game_over', ({ result, board: boardState }) => {
    boardState.forEach((mark, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        cell.textContent = mark;
        cell.classList.add('taken');
    });

    if (result === 'Draw') {
        gameStatus.textContent = 'Empate!';
    } else {
        gameStatus.textContent = `${result} venceu!`;
    }

    resetButton.style.display = 'block';
});

// Resetar o jogo
resetButton.addEventListener('click', () => {
    if (!gameId) {
        alert('O jogo não está ativo. Por favor, reconecte.');
        return;
    }
    socket.emit('reset_game', gameId); // Certifique-se de enviar o gameId correto
    gameStatus.textContent = 'Reiniciando o jogo...';
});

function updateBoard(boardState) {
    boardState.forEach((mark, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        cell.textContent = mark || ''; // Atualiza a célula com 'X', 'O' ou limpa
        cell.classList.toggle('taken', !!mark); // Adiciona a classe 'taken' se a célula estiver ocupada
    });
}

socket.on('error_message', (message) => {
    alert(message); // Exibe um alerta com o erro
});

const updateRankingDisplay = (ranking) => {
    rankingList.innerHTML = ''; // Limpa o ranking atual
    const sortedRanking = Object.entries(ranking).sort((a, b) => b[1] - a[1]); // Ordena por pontos

    sortedRanking.forEach(([player, points], index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${player}: ${points} pontos`;
        rankingList.appendChild(li);
    });
};

socket.on('rankingUpdated', (ranking) => {
    rankingScreen.style.display = 'block'; // Exibe o ranking
    updateRankingDisplay(ranking);
});

document.getElementById('reset-btn').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value || 'Jogador';
    socket.emit('gameWon', playerName);
});
