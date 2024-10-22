// # game.js

const serverUrl = window.location.hostname === 'godfreydev.github.io'
  ? 'https://cool-accessible-pint.glitch.me'
  : 'http://localhost:3000';

const socket = io.connect(serverUrl);

// Directions based on sprite sheet layout
const DIRECTIONS = {
  DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN_LEFT: 4, DOWN_RIGHT: 5, UP_LEFT: 6, UP_RIGHT: 7
};

// Game world configuration
const TILE_SIZE = 64;
const WORLD_WIDTH = 200;
const WORLD_HEIGHT = 200;

// Tile types
const TILE_WALL = 1;
const TILE_DOOR = 2;
const TILE_FLOOR = 3;

// Game world array
let gameWorld = [];

// Adjust the player's initial position here
// Set initial position to the bottom right, but keep it centered in the viewport initially
let player = {
  id: null, x: 100, y: 100, width: 64, height: 64, // Adjust initial x, y to move player down and right from the center
  direction: DIRECTIONS.DOWN, moving: false, sprite: new Image(),
  frameIndex: 0, frameCount: 8
};
player.sprite.src = 'Images/player_sprite_frames.png';
player.sprite.onload = () => requestAnimationFrame(gameLoop);
player.sprite.onerror = e => console.error("Failed to load player sprite:", e);

let players = {}, playerMessages = {}, items = {}, inventory = [], keysPressed = {};
const movementSpeed = 200, animationSpeed = 0.1;
let lastRenderTime = 0, animationTimer = 0;

const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');

// Function to adjust the canvas size dynamically
function adjustCanvasSize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
adjustCanvasSize(); // Adjust canvas size on initial load
window.addEventListener('resize', adjustCanvasSize); // Adjust canvas size on window resize

// Load tile images
const tileImages = {};
const tileTypes = [TILE_FLOOR, TILE_WALL, TILE_DOOR];
let loadedImages = 0;

function loadTileImage(type) {
    tileImages[type] = new Image();
    tileImages[type].src = `Images/tile_${type}.png`;
    tileImages[type].onload = () => {
        loadedImages++;
        if (loadedImages === tileTypes.length) {
          requestAnimationFrame(gameLoop);
        }
      };      
    tileImages[type].onerror = () => {
      console.error(`Failed to load tile image: Images/tile_${type}.png`);
    };
  }
  

tileTypes.forEach(loadTileImage);

// Initialize the game world
function initializeGameWorld() {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    gameWorld[y] = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (x === 0 || x === WORLD_WIDTH - 1 || y === 0 || y === WORLD_HEIGHT - 1) {
        gameWorld[y][x] = TILE_WALL;
      } else {
        gameWorld[y][x] = TILE_FLOOR;
      }
    }
  }
  
  // Create rooms and corridors
  createRoom(20, 20, 40, 40);
  createRoom(80, 80, 60, 60);
  createRoom(20, 120, 50, 50);
  createRoom(120, 20, 60, 40);
  
  createCorridor(50, 30, 80, 30);
  createCorridor(30, 50, 30, 120);
  createCorridor(130, 50, 130, 80);
  createCorridor(70, 110, 120, 110);
}

// Create a room with walls and a door
function createRoom(x, y, width, height) {
  for (let i = y; i < y + height; i++) {
    for (let j = x; j < x + width; j++) {
      if (i === y || i === y + height - 1 || j === x || j === x + width - 1) {
        gameWorld[i][j] = TILE_WALL;
      } else {
        gameWorld[i][j] = TILE_FLOOR;
      }
    }
  }
  gameWorld[y + Math.floor(height / 2)][x] = TILE_DOOR;
}

// Create a corridor between two points
function createCorridor(x1, y1, x2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  
  for (let i = 0; i <= length; i++) {
    const x = x1 + Math.round(i * dx / length);
    const y = y1 + Math.round(i * dy / length);
    gameWorld[y][x] = TILE_FLOOR;
  }
}

// Game loop for rendering and updating
function gameLoop(timeStamp) {
    const deltaTime = (timeStamp - lastRenderTime) / 1000;
    requestAnimationFrame(gameLoop);
    if (player.id) {
      updatePlayerPosition(deltaTime);
      handleAnimation(deltaTime);
      updateCameraPosition();
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updatePlayerPosition(deltaTime);
    handleAnimation(deltaTime);
    updateCameraPosition();
    drawBackground();
    drawItems();
    drawPlayers();
    lastRenderTime = timeStamp;
}

// Function to draw items
function drawItems() {
  Object.values(items).forEach(item => {
    ctx.fillStyle = item.type === 'potion' ? 'red' : item.type === 'sword' ? 'silver' : 'blue';
    ctx.fillRect(item.x - cameraX, item.y - cameraY, TILE_SIZE, TILE_SIZE);
  });
}

// Send chat message to the server
function sendMessage() {
  const messageInput = document.getElementById('chatInput'), message = messageInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { message });
    messageInput.value = '';
  }
}

// Update player position based on input with adjusted collision detection
function updatePlayerPosition(deltaTime) {
    let dx = 0, dy = 0;
    player.moving = false;
  
    if (keysPressed['a'] || keysPressed['ArrowLeft']) { dx -= movementSpeed; player.moving = true; }
    if (keysPressed['d'] || keysPressed['ArrowRight']) { dx += movementSpeed; player.moving = true; }
    if (keysPressed['w'] || keysPressed['ArrowUp']) { dy -= movementSpeed; player.moving = true; }
    if (keysPressed['s'] || keysPressed['ArrowDown']) { dy += movementSpeed; player.moving = true; }
  
    if (dy < 0 && dx < 0) player.direction = DIRECTIONS.UP_LEFT;
    else if (dy < 0 && dx > 0) player.direction = DIRECTIONS.UP_RIGHT;
    else if (dy > 0 && dx < 0) player.direction = DIRECTIONS.DOWN_LEFT;
    else if (dy > 0 && dx > 0) player.direction = DIRECTIONS.DOWN_RIGHT;
    else if (dy < 0) player.direction = DIRECTIONS.UP;
    else if (dy > 0) player.direction = DIRECTIONS.DOWN;
    else if (dx < 0) player.direction = DIRECTIONS.LEFT;
    else if (dx > 0) player.direction = DIRECTIONS.RIGHT;
  
    const newX = player.x + dx * deltaTime;
    const newY = player.y + dy * deltaTime;
  
    // Check collision for each corner of the player sprite
    const topLeftTile = gameWorld[Math.floor((newY - player.height / 2) / TILE_SIZE)][Math.floor((newX - player.width / 2) / TILE_SIZE)];
    const topRightTile = gameWorld[Math.floor((newY - player.height / 2) / TILE_SIZE)][Math.floor((newX + player.width / 2) / TILE_SIZE)];
    const bottomLeftTile = gameWorld[Math.floor((newY + player.height / 2) / TILE_SIZE)][Math.floor((newX - player.width / 2) / TILE_SIZE)];
    const bottomRightTile = gameWorld[Math.floor((newY + player.height / 2) / TILE_SIZE)][Math.floor((newX + player.width / 2) / TILE_SIZE)];
  
    // Check if any of the corners collide with a wall
    const collidesWithWall = topLeftTile === TILE_WALL || topRightTile === TILE_WALL || bottomLeftTile === TILE_WALL || bottomRightTile === TILE_WALL;
  
    // Check if the player is colliding with a door
    const collidesWithDoor = topLeftTile === TILE_DOOR || topRightTile === TILE_DOOR || bottomLeftTile === TILE_DOOR || bottomRightTile === TILE_DOOR;
  
    if (!collidesWithWall && !collidesWithDoor) {
      player.x = newX;
      player.y = newY;
    }
  
    if (collidesWithDoor) {
        // Calculate the door's center position
        const doorCenterX = Math.floor((newX + player.width / 2) / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
        const doorCenterY = Math.floor((newY + player.height / 2) / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    
        // Calculate the player's distance from the door's center
        const distanceX = doorCenterX - player.x;
        const distanceY = doorCenterY - player.y;
    
        // Adjust the player's position to smoothly pass through the door
        if (Math.abs(distanceX) < TILE_SIZE / 4) {
          player.x += distanceX * 0.2; // Adjust the player's x-position gradually
        }
        if (Math.abs(distanceY) < TILE_SIZE / 4) {
          player.y += distanceY * 0.2; // Adjust the player's y-position gradually
        }
    
        // Move the player through the door based on their direction
        if (player.direction === DIRECTIONS.UP) {
          player.y -= player.height / 4; // Adjust the player's y-position gradually
        } else if (player.direction === DIRECTIONS.DOWN) {
          player.y += player.height / 4; // Adjust the player's y-position gradually
        } else if (player.direction === DIRECTIONS.LEFT) {
          player.x -= player.width / 4; // Adjust the player's x-position gradually
        } else if (player.direction === DIRECTIONS.RIGHT) {
          player.x += player.width / 4; // Adjust the player's x-position gradually
        }
      }
  
    // Check for item pickup
    Object.values(items).forEach(item => {
      if (Math.abs(player.x - item.x) < TILE_SIZE && Math.abs(player.y - item.y) < TILE_SIZE) {
        socket.emit('pickupItem', item.id);
      }
    });
  
    // Emit movement if position or frameIndex changed
    if (newX !== player.x || newY !== player.y || player.frameIndex !== player.lastFrameIndex) {
      player.lastFrameIndex = player.frameIndex;
      socket.emit('playerMovement', { x: player.x, y: player.y, direction: player.direction, frameIndex: player.frameIndex });
    }
  }  

// Handle animation based on player movement
function handleAnimation(deltaTime) {
  if (player.moving) {
    animationTimer += deltaTime;
    if (animationTimer >= animationSpeed) {
      player.frameIndex = (player.frameIndex + 1) % player.frameCount;
      animationTimer = 0;
    }
  } else {
    player.frameIndex = 0; // Reset animation frame if not moving
  }
  player.frameIndex = Math.max(0, Math.min(player.frameIndex, player.frameCount - 1)); // Ensure frameIndex is within valid range
}

let cameraX = 0;
let cameraY = 0;
const cameraEasing = 0.1;

function updateCameraPosition() {
  const targetX = player.x - canvas.width / 2;
  const targetY = player.y - canvas.height / 2;
  cameraX += (targetX - cameraX) * cameraEasing;
  cameraY += (targetY - cameraY) * cameraEasing;
}

function drawBackground() {
    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE));
    const endCol = Math.min(WORLD_WIDTH - 1, Math.ceil((cameraX + canvas.width) / TILE_SIZE));
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE));
    const endRow = Math.min(WORLD_HEIGHT - 1, Math.ceil((cameraY + canvas.height) / TILE_SIZE));
  
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
  
    // Fill the canvas with black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        const tileX = x * TILE_SIZE;
        const tileY = y * TILE_SIZE;
  
        // Check if the tile exists in the gameWorld array
        if (gameWorld[y] && gameWorld[y][x]) {
            const tile = gameWorld[y][x];
            if (tileImages[tile]) {
              ctx.drawImage(tileImages[tile], tileX, tileY, TILE_SIZE, TILE_SIZE);
            }            
        }
      }
    }
  
    ctx.restore();
  }  

// Render players on canvas
function drawPlayers() {
  Object.values(players).forEach(drawPlayer);
  drawPlayer(player); // Draw current player last to be on top
}

// Draw a single player on the canvas
function drawPlayer(p) {
    if (!p.sprite.complete || p.frameIndex === undefined) return;
    const srcX = p.frameIndex * p.width;
    const srcY = p.direction * p.height;
    const screenX = p.x - p.width / 2;
    const screenY = p.y - p.height / 2;
  
    ctx.drawImage(p.sprite, srcX, srcY, p.width, p.height, screenX - cameraX, screenY - cameraY, p.width, p.height);
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '16px Arial';
    ctx.fillText(p.name, screenX - cameraX + p.width / 2, screenY - cameraY - 20);
    if (playerMessages[p.id]) {
      ctx.fillStyle = 'yellow';
      ctx.fillText(playerMessages[p.id], screenX - cameraX + p.width / 2, screenY - cameraY - 40);
    }
  }

// Handle receiving items from the server
socket.on('currentItems', serverItems => {
  items = serverItems;
});

// Handle item pickup
socket.on('itemPickedUp', data => {
  delete items[data.itemId];
  if (data.playerId === player.id) {
    inventory.push(data.itemId); // Add item to inventory if it's the local player
    updateInventoryDisplay();
  }
});

// Handle player damage
socket.on('playerDamaged', data => {
  if (players[data.targetId]) {
    players[data.targetId].health = data.health;
  }
});

// Handle player killed
socket.on('playerKilled', playerId => {
  delete players[playerId];
});

// Keyboard event listeners for movement
document.addEventListener('keydown', e => keysPressed[e.key] = true);
document.addEventListener('keyup', e => delete keysPressed[e.key]);

// After receiving the current players from the server and setting up the local player
socket.on('currentPlayers', playersData => {
    Object.values(playersData).forEach(p => {
      p.sprite = new Image();
      p.sprite.src = player.sprite.src;
      if (p.id === socket.id) {
        // This part assumes you somehow receive your own player data back from the server
        player = { ...player, ...p };
        player.sprite = new Image();
        player.sprite.src = 'Images/player_sprite_frames.png'; // Ensure the sprite is correctly assigned
        
        // Emit the player's initial state right after receiving it
        socket.emit('playerMovement', {
          x: player.x,
          y: player.y,
          direction: player.direction,
          moving: player.moving,
          frameIndex: player.frameIndex
        });
      } else {
        players[p.id] = p;
      }
    });
  });
  

socket.on('newPlayer', playerData => {
  players[playerData.id] = Object.assign(playerData, { sprite: new Image(), frameIndex: 0, direction: DIRECTIONS.DOWN });
  players[playerData.id].sprite.src = player.sprite.src;
});

socket.on('playerMoved', data => {
  if (data.playerId in players) {
    players[data.playerId].x = data.x;
    players[data.playerId].y = data.y;
    players[data.playerId].direction = data.direction;
    players[data.playerId].frameIndex = data.frameIndex;
  }
});

socket.on('playerDisconnected', id => delete players[id]);
socket.on('chatMessage', data => {
  playerMessages[data.playerId] = data.message;
  setTimeout(() => delete playerMessages[data.playerId], 5000);
});

// Initialize the game world
initializeGameWorld();
requestAnimationFrame(gameLoop);

// Update inventory display
function updateInventoryDisplay() {
  const inventoryList = document.getElementById('inventoryList');
  inventoryList.innerHTML = '';
  inventory.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    inventoryList.appendChild(li);
  });
}
