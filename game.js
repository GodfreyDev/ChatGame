// # game.js
//
// This JavaScript file defines the core functionality for an online multiplayer game.
// It sets up the game environment, player interactions, and communication with the server.
// The game world consists of tiles, rooms, corridors, and objects that players can interact with.
//
// Features include:
// - Player movement and direction management with collision detection for walls and doors.
// - Dynamic canvas resizing for responsiveness.
// - Rendering game elements such as players, items, enemies, and the environment on a canvas.
// - Communication with a server via WebSockets for real-time updates between players.
// - Inventory system for managing items that players collect.
// - Combat mechanics allowing players to attack others using equipped weapons.
// - Death mechanics where players can die and respawn.
// - Item usage, such as potions for healing and shields for defense.
// - Projectile mechanics for ranged weapons like staffs.
// - Basic enemies (NPCs) that roam and can be attacked.
//
// Key Variables:
// - serverUrl: Dynamically sets the server URL depending on the environment (development or production).
// - TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT: Define the dimensions of the game world and tiles.
// - player: Object storing player-specific properties such as position, direction, health, and sprite animation state.
// - items, inventory, players, enemies: Manage the various objects and characters present in the game world.
// - equippedItem: Stores the currently equipped item that affects combat.
// - projectiles: Array storing active projectiles in the game.
//
// Functions Overview:
// - adjustCanvasSize: Adjusts the canvas dimensions dynamically based on window size.
// - loadTileImages: Loads the images representing various tiles in the game.
// - loadSpriteImages: Loads all sprite images required for the game.
// - initializeGameWorld, createRoom, createCorridor: Build the structure of the game world with walls, doors, and corridors.
// - gameLoop: The main loop that updates player movement, renders the game, and handles animations.
// - updatePlayerPosition: Moves the player based on input and checks for collisions.
// - handleAnimation: Manages sprite animations for player movement and attacks.
// - updateCameraPosition: Keeps the player's position centered on the screen.
// - drawBackground, drawItems, drawEnemies, drawProjectiles: Renders the game world and in-game elements.
// - handleAttack: Processes attack inputs and interactions with other players and enemies.
// - useItem: Allows players to use consumable items like potions.

// game.js

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
const tileImages = {};

const TILE_WALL = 1;
const TILE_DOOR = 2;
const TILE_FLOOR = 3;
const TILE_WATER = 4;
const TILE_GRASS = 5;
const TILE_SAND = 6;
const TILE_BRIDGE = 7;

const tileTypes = [TILE_WALL, TILE_DOOR, TILE_FLOOR, TILE_WATER, TILE_GRASS, TILE_SAND, TILE_BRIDGE];
const impassableTiles = [TILE_WALL, TILE_WATER];

// Game world array
let gameWorld = [];

// Safe zones
const safeZones = [
  { x: 20 * TILE_SIZE, y: 50 * TILE_SIZE, width: 40 * TILE_SIZE, height: 30 * TILE_SIZE },
  // Add more safe zones if needed
];

// Player object
let player = {
  id: null,
  x: 100,
  y: 100,
  width: 64,
  height: 64,
  direction: DIRECTIONS.DOWN,
  moving: false,
  sprite: null,
  frameIndex: 0,
  frameCount: 8,
  health: 100,
  maxHealth: 100,
  inventory: [],
  equippedItem: null,
  isAttacking: false,
  attackFrameIndex: 0,
  copper: 0
};

let players = {};
let playerMessages = {};
let items = {};
let enemies = {};
let projectiles = [];
let keysPressed = {};
const movementSpeed = 200;
const animationSpeed = 0.1;
let lastRenderTime = 0;
let animationTimer = 0;

const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');

// Adjust the canvas size dynamically
function adjustCanvasSize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
adjustCanvasSize();
window.addEventListener('resize', adjustCanvasSize);

// Load tile images
function loadTileImages(callback) {
  let loadedImages = 0;
  const totalImages = tileTypes.length;

  tileTypes.forEach(type => {
    tileImages[type] = new Image();
    tileImages[type].src = `Images/tile_${type}.png`;
    tileImages[type].onload = () => {
      loadedImages++;
      if (loadedImages === totalImages) {
        callback();
      }
    };
    tileImages[type].onerror = () => {
      console.error(`Failed to load tile image: Images/tile_${type}.png`);
    };
  });
}

// Load sprite images
const spritesToLoad = [
  { key: 'player', src: 'Images/player_sprite_frames.png', frames: 8 },
  { key: 'enemy', src: 'Images/player_sprite_frames.png', frames: 8 } // Enemies use the same sprite as players
];
const spriteImages = {};

function loadSpriteImages(callback) {
  let loadedSprites = 0;
  spritesToLoad.forEach(sprite => {
    spriteImages[sprite.key] = new Image();
    spriteImages[sprite.key].src = sprite.src;
    spriteImages[sprite.key].onload = () => {
      loadedSprites++;
      if (loadedSprites === spritesToLoad.length) {
        callback();
      }
    };
    spriteImages[sprite.key].onerror = () => {
      console.error(`Failed to load sprite image: ${sprite.src}`);
    };
  });
}

// Initialize the game world
function initializeGameWorld() {
  // Fill the world with grass
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    gameWorld[y] = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
      gameWorld[y][x] = TILE_GRASS;
    }
  }

  // Add borders
  for (let x = 0; x < WORLD_WIDTH; x++) {
    gameWorld[0][x] = TILE_WALL;
    gameWorld[WORLD_HEIGHT - 1][x] = TILE_WALL;
  }
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    gameWorld[y][0] = TILE_WALL;
    gameWorld[y][WORLD_WIDTH - 1] = TILE_WALL;
  }

    // Predefined rooms and structures
  createRoom(10, 10, 30, 20); // Main hall
  createRoom(50, 5, 20, 15);  // Library
  createRoom(80, 20, 25, 25); // Armory
  createRoom(20, 50, 40, 30); // Dining hall
  createRoom(70, 60, 30, 20); // Throne room

  // Corridors connecting rooms
  createCorridor(40, 20, 50, 20); // Main hall to library
  createCorridor(70, 30, 80, 30); // Library to armory
  createCorridor(30, 30, 30, 50); // Main hall to dining hall
  createCorridor(60, 65, 70, 65); // Dining hall to throne room

  // Rivers
  createRiver(0, 40, WORLD_WIDTH - 1, 40);
  createRiver(60, 0, 60, WORLD_HEIGHT - 1);

  // Horizontal bridge spanning across at y = 40 (for vertical river)
  gameWorld[40][30] = TILE_BRIDGE; // Left bridge tile
  gameWorld[41][30] = TILE_BRIDGE; // Right bridge tile

  // Another horizontal bridge spanning across at y = 40 (for vertical river)
  gameWorld[40][70] = TILE_BRIDGE; // Left bridge tile
  gameWorld[41][70] = TILE_BRIDGE; // Right bridge tile

  // Vertical bridge spanning across at x = 60 (for horizontal river)
  gameWorld[12][60] = TILE_BRIDGE; // Top bridge tile
  gameWorld[12][61] = TILE_BRIDGE; // Bottom bridge tile

  // Another vertical bridge spanning across at x = 60 (for horizontal river)
  gameWorld[65][60] = TILE_BRIDGE; // Top bridge tile
  gameWorld[65][61] = TILE_BRIDGE; // Bottom bridge tile



  // Sand areas (beach)
  createArea(TILE_SAND, 0, WORLD_HEIGHT - 10, WORLD_WIDTH, 10);

  // Forests
  createForest(15, 15, 20, 20);
  createForest(65, 50, 15, 15);

}

// Create a room with walls and doors at fixed positions
function createRoom(x, y, width, height) {
  // Build the room with walls and floors
  for (let i = y; i < y + height; i++) {
    for (let j = x; j < x + width; j++) {
      if (i === y || i === y + height - 1 || j === x || j === x + width - 1) {
        gameWorld[i][j] = TILE_WALL;
      } else {
        gameWorld[i][j] = TILE_FLOOR;
      }
    }
  }

  // Place doors at fixed positions
  placeDoor('top', x, y, width, height);
  placeDoor('bottom', x, y, width, height);
  placeDoor('left', x, y, width, height);
  placeDoor('right', x, y, width, height);
}

// Place doors at fixed positions
function placeDoor(wall, x, y, width, height) {
  let doorX, doorY;
  switch (wall) {
    case 'top':
      doorX = x + Math.floor(width / 2);
      doorY = y;
      break;
    case 'bottom':
      doorX = x + Math.floor(width / 2);
      doorY = y + height - 1;
      break;
    case 'left':
      doorX = x;
      doorY = y + Math.floor(height / 2);
      break;
    case 'right':
      doorX = x + width - 1;
      doorY = y + Math.floor(height / 2);
      break;
    default:
      return;
  }
  if (gameWorld[doorY][doorX] === TILE_WALL) {
    gameWorld[doorY][doorX] = TILE_DOOR;
  }
}

// Create a river horizontally or vertically
function createRiver(x1, y1, x2, y2) {
  if (x1 === x2) {
    // Vertical river
    for (let y = y1; y <= y2; y++) {
      gameWorld[y][x1] = TILE_WATER;
      gameWorld[y][x1 + 1] = TILE_WATER;
    }
  } else if (y1 === y2) {
    // Horizontal river
    for (let x = x1; x <= x2; x++) {
      gameWorld[y1][x] = TILE_WATER;
      gameWorld[y1 + 1][x] = TILE_WATER;
    }
  }
}

// Create a forest area
function createForest(x, y, width, height) {
  for (let i = y; i < y + height; i++) {
    for (let j = x; j < x + width; j++) {
      gameWorld[i][j] = TILE_GRASS; // Use a different tile if you have a forest tile
    }
  }
}

// Create an area with a specific tile type
function createArea(tileType, x, y, width, height) {
  for (let i = y; i < y + height; i++) {
    for (let j = x; j < x + width; j++) {
      if (i >= 0 && i < WORLD_HEIGHT && j >= 0 && j < WORLD_WIDTH) {
        gameWorld[i][j] = tileType;
      }
    }
  }
}

// Create a corridor between two points
function createCorridor(x1, y1, x2, y2) {
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
    handleAttack();
    updateProjectiles(deltaTime);
    updateEnemyAnimations(deltaTime); // Update enemy animations
    updateCameraPosition();
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawItems();
  drawEnemies();
  drawProjectiles();
  drawPlayers();
  drawHUD();
  lastRenderTime = timeStamp;
}

// Function to draw items
function drawItems() {
  Object.values(items).forEach(item => {
    const itemX = item.x - cameraX - TILE_SIZE / 2;
    const itemY = item.y - cameraY - TILE_SIZE / 2;
    ctx.fillStyle = item.type === 'potion' ? 'red' : item.type === 'sword' ? 'silver' : item.type === 'staff' ? 'purple' : 'blue';
    ctx.fillRect(itemX, itemY, TILE_SIZE, TILE_SIZE);
  });
}

// Function to draw enemies
function drawEnemies() {
  Object.values(enemies).forEach(enemy => {
    if (!enemy.sprite || !enemy.sprite.complete) {
      // Draw a placeholder rectangle if sprite is not available
      ctx.fillStyle = 'red';
      ctx.fillRect(enemy.x - cameraX - enemy.width / 2, enemy.y - cameraY - enemy.height / 2, enemy.width, enemy.height);
      return;
    }
    const srcX = enemy.frameIndex * enemy.width;
    const srcY = enemy.direction * enemy.height;
    const screenX = enemy.x - enemy.width / 2 - cameraX;
    const screenY = enemy.y - enemy.height / 2 - cameraY;

    ctx.drawImage(enemy.sprite, srcX, srcY, enemy.width, enemy.height, screenX, screenY, enemy.width, enemy.height);

    // Draw health bar
    const healthBarWidth = 50;
    const healthBarHeight = 5;
    const healthPercentage = enemy.health / enemy.maxHealth;
    ctx.fillStyle = 'red';
    ctx.fillRect(screenX + enemy.width / 2 - healthBarWidth / 2, screenY - 10, healthBarWidth, healthBarHeight);
    ctx.fillStyle = 'green';
    ctx.fillRect(screenX + enemy.width / 2 - healthBarWidth / 2, screenY - 10, healthBarWidth * healthPercentage, healthBarHeight);
  });
}

// Function to draw projectiles
function drawProjectiles() {
  projectiles.forEach(projectile => {
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(projectile.x - cameraX, projectile.y - cameraY, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Send chat message to the server
function sendMessage() {
  const messageInput = document.getElementById('chatInput');
  const message = messageInput.value.trim();
  if (message) {
    if (message.startsWith('/')) {
      handleCommand(message);
    } else {
      socket.emit('chatMessage', { message });
    }
    messageInput.value = '';
  }
}

// Handle chat commands
function handleCommand(message) {
  const parts = message.split(' ');
  const command = parts[0].substring(1).toLowerCase();
  const args = parts.slice(1);

  if (command === 'msg' || command === 'w') {
    const recipientName = args[0];
    const messageText = args.slice(1).join(' ');
    if (recipientName && messageText) {
      const recipient = Object.values(players).find(p => p.name === recipientName);
      if (recipient) {
        socket.emit('privateMessage', { recipientId: recipient.id, message: messageText });
      } else {
        showMessage(`Player '${recipientName}' not found.`);
      }
    } else {
      showMessage('Usage: /msg <playerName> <message>');
    }
  } else if (command === 'list' || command === 'players') {
    const playerNames = Object.values(players).map(p => p.name).join(', ');
    showMessage(`Online players: ${playerNames}`);
  } else {
    showMessage(`Unknown command: ${command}`);
  }
}

// Function to show messages in the dialogue box
function showMessage(message) {
  const dialogueBox = document.getElementById('dialogueBox');
  dialogueBox.textContent = message;
  dialogueBox.style.display = 'block';
  // Hide the message after some time
  setTimeout(() => {
    dialogueBox.style.display = 'none';
  }, 5000); // Hide after 5 seconds
}

// Handle 'playerKilled' event to refresh the page when the player dies
socket.on('playerKilled', playerId => {
  if (playerId === player.id) {
    alert('You have died! The game will now reload.');
    window.location.reload();
  } else {
    delete players[playerId];
  }
});

// Handle player damage
socket.on('playerDamaged', data => {
  if (data.playerId === player.id) {
    player.health = data.health;
  } else if (players[data.playerId]) {
    players[data.playerId].health = data.health;
  }
});

// Adjust enemy properties upon receiving data from server
socket.on('updateEnemies', serverEnemies => {
  // Update existing enemies and add new ones
  Object.values(serverEnemies).forEach(enemyData => {
    let enemy = enemies[enemyData.id];
    if (enemy) {
      // Update enemy properties
      Object.assign(enemy, enemyData);
    } else {
      // New enemy
      enemy = { ...enemyData };
      enemy.sprite = spriteImages.enemy;
      enemy.frameCount = spritesToLoad.find(s => s.key === 'enemy').frames;
      enemy.animationTimer = 0;
      enemy.frameIndex = 0;
      enemies[enemy.id] = enemy;
    }
  });
  // Remove enemies not in serverEnemies
  Object.keys(enemies).forEach(id => {
    if (!serverEnemies[id]) {
      delete enemies[id];
    }
  });
});

// Handle 'updateCopper' event to update player's copper amount
socket.on('updateCopper', (copper) => {
  player.copper = copper;
  updateInventoryDisplay(); // Update inventory display to show new copper amount
}); 

// Handle enemy killed
socket.on('enemyKilled', enemyId => {
  delete enemies[enemyId];
});

// Handle attack errors from the server
socket.on('attackError', message => {
  showMessage(message);
});

// Handle 'playerHealed' event from server
socket.on('playerHealed', data => {
  if (player.id === socket.id) {
    player.health = data.health;
  }
});

// Modified updatePlayerPosition function to handle door alignment and safe zone spawning
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
  const topLeftTile = getTileAt(newX - player.width / 2, newY - player.height / 2);
  const topRightTile = getTileAt(newX + player.width / 2 - 1, newY - player.height / 2);
  const bottomLeftTile = getTileAt(newX - player.width / 2, newY + player.height / 2 - 1);
  const bottomRightTile = getTileAt(newX + player.width / 2 - 1, newY + player.height / 2 - 1);

  const collidesWithImpassable = [topLeftTile, topRightTile, bottomLeftTile, bottomRightTile]
    .some(tile => impassableTiles.includes(tile));

  if (!collidesWithImpassable) {
    player.x = newX;
    player.y = newY;
  } else {
    // Check for doors or bridges
    const passableTiles = [TILE_DOOR, TILE_BRIDGE];
    const passableCollision = [topLeftTile, topRightTile, bottomLeftTile, bottomRightTile]
      .some(tile => passableTiles.includes(tile));

    if (passableCollision) {
      const passablePosition = findNearestPassableTile(player.x, player.y);
      if (passablePosition) {
        player.x = passablePosition.x;
        player.y = passablePosition.y;
      }
    }
  }


  // Function to find the nearest passable tile and align player to it
function findNearestPassableTile(x, y) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);

  // Check adjacent tiles for a door or bridge
  const directions = [
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 },  // Right
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 },  // Down
  ];

  for (let dir of directions) {
    const nx = tileX + dir.dx;
    const ny = tileY + dir.dy;
    if (gameWorld[ny] && (gameWorld[ny][nx] === TILE_DOOR || gameWorld[ny][nx] === TILE_BRIDGE)) {
      return { x: nx * TILE_SIZE + TILE_SIZE / 2, y: ny * TILE_SIZE + TILE_SIZE / 2 };
    }
  }
  return null;
}

  // Check for item pickup
  Object.values(items).forEach(item => {
    if (Math.abs(player.x - item.x) < TILE_SIZE && Math.abs(player.y - item.y) < TILE_SIZE) {
      socket.emit('pickupItem', item.id);
    }
  });

  // Emit movement if position or frameIndex changed
  if (dx !== 0 || dy !== 0 || player.frameIndex !== player.lastFrameIndex) {
    player.lastFrameIndex = player.frameIndex;
    socket.emit('playerMovement', { x: player.x, y: player.y, direction: player.direction, frameIndex: player.frameIndex, health: player.health });
  }
}

// Function to find the nearest door and align player to it
function findNearestDoor(x, y) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);

  // Check adjacent tiles for a door
  const directions = [
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 },  // Right
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 },  // Down
  ];

  for (let dir of directions) {
    const nx = tileX + dir.dx;
    const ny = tileY + dir.dy;
    if (gameWorld[ny] && gameWorld[ny][nx] === TILE_DOOR) {
      return { x: nx * TILE_SIZE + TILE_SIZE / 2, y: ny * TILE_SIZE + TILE_SIZE / 2 };
    }
  }
  return null;
}

// Helper function to check collision at a given position
function getTileAt(x, y) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  if (tileX < 0 || tileX >= WORLD_WIDTH || tileY < 0 || tileY >= WORLD_HEIGHT) {
    return TILE_WALL; // Treat out-of-bounds as wall
  }
  return gameWorld[tileY][tileX];
}

// Handle animation based on player movement and attacking
function handleAnimation(deltaTime) {
  if (player.isAttacking) {
    // Handle attack animation
    animationTimer += deltaTime;
    if (animationTimer >= animationSpeed) {
      player.attackFrameIndex++;
      animationTimer = 0;
      if (player.attackFrameIndex >= player.frameCount) {
        player.attackFrameIndex = 0;
        player.isAttacking = false;
      }
    }
  } else if (player.moving) {
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

// Draw the safe zone outlines
function drawSafeZones() {
  safeZones.forEach(zone => {
    // Fill the safe zone with a semi-transparent green
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    
    // Draw the border
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 2;
    ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
  });
}


// Updated drawBackground function to include safe zone outlines
function drawBackground() {
  const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE));
  const endCol = Math.min(WORLD_WIDTH - 1, Math.ceil((cameraX + canvas.width) / TILE_SIZE));
  const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE));
  const endRow = Math.min(WORLD_HEIGHT - 1, Math.ceil((cameraY + canvas.height) / TILE_SIZE));

  ctx.save();
  ctx.translate(-cameraX, -cameraY);

  // Fill the canvas with black
  ctx.fillStyle = 'black';
  ctx.fillRect(cameraX, cameraY, canvas.width, canvas.height);

  for (let y = startRow; y <= endRow; y++) {
    for (let x = startCol; x <= endCol; x++) {
      const tileX = x * TILE_SIZE;
      const tileY = y * TILE_SIZE;

      if (gameWorld[y] && gameWorld[y][x]) {
        const tile = gameWorld[y][x];
        if (tileImages[tile]) {
          ctx.drawImage(tileImages[tile], tileX, tileY, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  // Draw safe zone outlines
  drawSafeZones();

  ctx.restore();
}

// Render players on canvas
function drawPlayers() {
  Object.values(players).forEach(p => {
    if (p.id !== player.id) drawPlayer(p);
  });
  drawPlayer(player); // Draw current player last to be on top
}

// Draw a single player on the canvas
function drawPlayer(p) {
  if (!p.sprite || !p.sprite.complete || p.frameIndex === undefined) return;
  const srcX = p.frameIndex * p.width;
  const srcY = p.direction * p.height;
  const screenX = p.x - p.width / 2;
  const screenY = p.y - p.height / 2;

  ctx.drawImage(p.sprite, srcX, srcY, p.width, p.height, screenX - cameraX, screenY - cameraY, p.width, p.height);
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.font = '16px Arial';
  ctx.fillText(p.name, screenX - cameraX + p.width / 2, screenY - cameraY - 20);

  // Draw health bar
  const healthBarWidth = 50;
  const healthBarHeight = 5;
  const healthPercentage = p.health / p.maxHealth;
  ctx.fillStyle = 'red';
  ctx.fillRect(screenX - cameraX + p.width / 2 - healthBarWidth / 2, screenY - cameraY - 10, healthBarWidth, healthBarHeight);
  ctx.fillStyle = 'green';
  ctx.fillRect(screenX - cameraX + p.width / 2 - healthBarWidth / 2, screenY - cameraY - 10, healthBarWidth * healthPercentage, healthBarHeight);

  if (playerMessages[p.id]) {
    ctx.fillStyle = 'yellow';
    ctx.fillText(playerMessages[p.id], screenX - cameraX + p.width / 2, screenY - cameraY - 40);
  }
}

// Helper function to check if a position is within a safe zone
function isInSafeZone(x, y) {
  return safeZones.some(zone =>
    x >= zone.x && x <= zone.x + zone.width &&
    y >= zone.y && y <= zone.y + zone.height
  );
}

// Handle attack input and interactions
function handleAttack() {
  if (keysPressed[' ']) { // Spacebar for attack
    if (!player.attackCooldown || Date.now() - player.attackCooldown > 500) { // 500ms cooldown
      player.attackCooldown = Date.now();
      player.isAttacking = true;
      player.attackFrameIndex = 0;

      // Send attack to server
      let targetId = null;
      let minDistance = Infinity;
      const attackRange = 100;

      // Check for enemies first
      Object.values(enemies).forEach(enemy => {
        const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distance < attackRange && distance < minDistance) {
          minDistance = distance;
          targetId = enemy.id;
        }
      });

      // Check for players
      Object.values(players).forEach(p => {
        if (p.id !== player.id) {
          const distance = Math.hypot(player.x - p.x, player.y - p.y);
          if (distance < attackRange && distance < minDistance) {
            minDistance = distance;
            targetId = p.id;
          }
        }
      });

      if (targetId) {
        socket.emit('attack', { targetId, weapon: player.equippedItem });
      }

      // Handle projectiles if staff is equipped
      if (player.equippedItem && player.equippedItem.type === 'staff') {
        const projectile = {
          x: player.x,
          y: player.y,
          direction: player.direction,
          speed: 300,
          ownerId: player.id,
          damage: player.equippedItem.damage || 10
        };
        projectiles.push(projectile);
      }
    }
  }
}

// Update projectiles
function updateProjectiles(deltaTime) {
  projectiles = projectiles.filter(projectile => {
    let dx = 0, dy = 0;
    const moveDistance = projectile.speed * deltaTime;

    switch (projectile.direction) {
      case DIRECTIONS.UP:
        dy = -moveDistance;
        break;
      case DIRECTIONS.DOWN:
        dy = moveDistance;
        break;
      case DIRECTIONS.LEFT:
        dx = -moveDistance;
        break;
      case DIRECTIONS.RIGHT:
        dx = moveDistance;
        break;
      case DIRECTIONS.UP_LEFT:
        dx = -moveDistance / Math.sqrt(2);
        dy = -moveDistance / Math.sqrt(2);
        break;
      case DIRECTIONS.UP_RIGHT:
        dx = moveDistance / Math.sqrt(2);
        dy = -moveDistance / Math.sqrt(2);
        break;
      case DIRECTIONS.DOWN_LEFT:
        dx = -moveDistance / Math.sqrt(2);
        dy = moveDistance / Math.sqrt(2);
        break;
      case DIRECTIONS.DOWN_RIGHT:
        dx = moveDistance / Math.sqrt(2);
        dy = moveDistance / Math.sqrt(2);
        break;
    }

    projectile.x += dx;
    projectile.y += dy;

    // Check collision with walls
    const tileX = Math.floor(projectile.x / TILE_SIZE);
    const tileY = Math.floor(projectile.y / TILE_SIZE);

    if (
      tileY < 0 || tileY >= WORLD_HEIGHT ||
      tileX < 0 || tileX >= WORLD_WIDTH ||
      gameWorld[tileY][tileX] === TILE_WALL
    ) {
      // Projectile hits a wall
      return false;
    }

    // Check collision with enemies
    let hit = false;
    Object.values(enemies).forEach(enemy => {
      const distance = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
      if (distance < 20) {
        socket.emit('attack', { targetId: enemy.id, weapon: { damage: projectile.damage } });
        hit = true;
      }
    });

    // Check collision with players
    Object.values(players).forEach(p => {
      if (p.id !== projectile.ownerId) {
        const distance = Math.hypot(projectile.x - p.x, projectile.y - p.y);
        if (distance < 20) {
          socket.emit('attack', { targetId: p.id, weapon: { damage: projectile.damage } });
          hit = true;
        }
      }
    });

    // Remove projectile if it hits something
    return !hit;
  });
}

// Handle receiving items from the server
socket.on('currentItems', serverItems => {
  items = serverItems;
});

// Handle item pickup
socket.on('itemPickedUp', data => {
  delete items[data.itemId];
  if (data.playerId === player.id) {
    player.inventory.push(data.item); // Add item to inventory if it's the local player
    updateInventoryDisplay();
  }
});

// Keyboard event listeners for movement and item usage
document.addEventListener('keydown', e => {
  keysPressed[e.key] = true;

  // Use item (e.g., potion) when pressing 'e'
  if (e.key === 'e') {
    useItem();
  }
});

document.addEventListener('keyup', e => {
  delete keysPressed[e.key];
});

// Event listener for inventory item click to equip or initiate trade
document.getElementById('inventoryList').addEventListener('click', e => {
  if (e.target && e.target.nodeName === 'LI') {
    const itemIndex = e.target.dataset.index;
    const item = player.inventory[itemIndex];

    if (e.shiftKey) {
      // Initiate trade when Shift-clicking an item
      initiateTrade(itemIndex);
    } else {
      // Equip item on normal click
      player.equippedItem = item;
      updateInventoryDisplay();
    }
  }
});

// Function to open the trade modal
function openTradeModal() {
  const tradeModal = document.getElementById('tradeModal');
  const playerSelect = document.getElementById('playerSelect');
  const yourItems = document.getElementById('yourItems');

  // Populate player list
  playerSelect.innerHTML = '';
  Object.values(players).forEach(p => {
    if (p.id !== player.id) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      playerSelect.appendChild(option);
    }
  });

  // Populate your items
  yourItems.innerHTML = '';
  player.inventory.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item.type;
    li.dataset.index = index;
    yourItems.appendChild(li);
  });

  tradeModal.style.display = 'flex';
}

// Event listener to open trade modal
document.getElementById('tradeButton').addEventListener('click', openTradeModal);

// Event listener for sending trade request
document.getElementById('sendTradeRequest').addEventListener('click', () => {
  const playerSelect = document.getElementById('playerSelect');
  const selectedPlayerId = playerSelect.value;
  const yourItems = document.getElementById('yourItems');
  const selectedItemIndex = yourItems.querySelector('li.selected')?.dataset.index;
  const offeredCopper = parseInt(document.getElementById('offerCopper').value) || 0;

  if (selectedPlayerId && (selectedItemIndex !== undefined || offeredCopper > 0)) {
    socket.emit('tradeRequest', {
      recipientId: selectedPlayerId,
      offeredItemIndex: selectedItemIndex ? parseInt(selectedItemIndex) : null,
      offeredCopper: offeredCopper
    });
    closeTradeModal();
  } else {
    alert('Please select a player and an item or copper to offer.');
  }
});

// Event listener for closing trade modal
document.getElementById('closeTradeModal').addEventListener('click', closeTradeModal);

function closeTradeModal() {
  document.getElementById('tradeModal').style.display = 'none';
}

// Handle item selection in trade modal
document.getElementById('yourItems').addEventListener('click', e => {
  if (e.target && e.target.nodeName === 'LI') {
    const lis = document.querySelectorAll('#yourItems li');
    lis.forEach(li => li.classList.remove('selected'));
    e.target.classList.add('selected');
  }
});

// Handle incoming trade requests
socket.on('tradeRequest', data => {
  const acceptTrade = confirm(`${data.senderName} wants to trade with you. Do you accept?`);
  if (acceptTrade) {
    // Open trade accept modal
    openTradeAcceptModal(data);
  } else {
    socket.emit('declineTrade', data.senderId);
  }
});

function openTradeAcceptModal(data) {
  // Implement the trade accept modal where you can select items or copper to trade
  // For simplicity, let's assume you can select an item or enter copper to trade back

  const acceptModal = document.createElement('div');
  acceptModal.id = 'acceptTradeModal';
  acceptModal.style.position = 'fixed';
  acceptModal.style.top = '0';
  acceptModal.style.left = '0';
  acceptModal.style.width = '100%';
  acceptModal.style.height = '100%';
  acceptModal.style.backgroundColor = 'rgba(0,0,0,0.5)';
  acceptModal.style.display = 'flex';
  acceptModal.style.justifyContent = 'center';
  acceptModal.style.alignItems = 'center';
  acceptModal.style.zIndex = '30';

  const content = document.createElement('div');
  content.style.backgroundColor = 'white';
  content.style.padding = '20px';
  content.style.borderRadius = '5px';

  content.innerHTML = `
    <h2>Trade Offer from ${data.senderName}</h2>
    <p>They offer: ${data.offeredItem ? data.offeredItem.type : ''} ${data.offeredCopper ? 'and ' + data.offeredCopper + ' copper' : ''}</p>
    <h3>Select Item to Trade</h3>
    <ul id="theirItems"></ul>
    <h3>Offer Copper</h3>
    <input type="number" id="requestedCopper" min="0" value="0" />
    <button id="confirmTrade">Confirm Trade</button>
    <button id="cancelTrade">Cancel</button>
  `;

  acceptModal.appendChild(content);
  document.body.appendChild(acceptModal);

  const theirItems = content.querySelector('#theirItems');
  player.inventory.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item.type;
    li.dataset.index = index;
    theirItems.appendChild(li);
  });

  theirItems.addEventListener('click', e => {
    if (e.target && e.target.nodeName === 'LI') {
      const lis = theirItems.querySelectorAll('li');
      lis.forEach(li => li.classList.remove('selected'));
      e.target.classList.add('selected');
    }
  });

  content.querySelector('#confirmTrade').addEventListener('click', () => {
    const selectedItemIndex = theirItems.querySelector('li.selected')?.dataset.index;
    const requestedCopper = parseInt(content.querySelector('#requestedCopper').value) || 0;

    socket.emit('acceptTrade', {
      senderId: data.senderId,
      requestedItemIndex: selectedItemIndex ? parseInt(selectedItemIndex) : null,
      requestedCopper: requestedCopper
    });
    document.body.removeChild(acceptModal);
  });

  content.querySelector('#cancelTrade').addEventListener('click', () => {
    socket.emit('declineTrade', data.senderId);
    document.body.removeChild(acceptModal);
  });
}

// Handle trade success
socket.on('tradeSuccess', data => {
  player.inventory = data.newInventory;
  player.copper = data.copper || player.copper;
  updateInventoryDisplay();
  alert('Trade successful!');
});

// Handle trade errors
socket.on('tradeError', message => {
  alert(`Trade error: ${message}`);
});

// Handle trade declined
socket.on('tradeDeclined', data => {
  alert(`Player declined your trade request.`);
});

// Handle code rewards
socket.on('rewardCode', code => {
  alert(`You have received a reward code: ${code}`);
});

// After receiving the current players from the server and setting up the local player
socket.on('currentPlayers', playersData => {
  Object.values(playersData).forEach(p => {
    if (p.id === socket.id) {
      player = { ...player, ...p };
      player.sprite = spriteImages.player;

      // Emit the player's initial state
      socket.emit('playerMovement', {
        x: player.x,
        y: player.y,
        direction: player.direction,
        moving: player.moving,
        frameIndex: player.frameIndex,
        health: player.health
      });
    } else {
      p.sprite = spriteImages.player;
      players[p.id] = p;
    }
  });
});

socket.on('newPlayer', playerData => {
  playerData.sprite = spriteImages.player;
  players[playerData.id] = playerData;
});

socket.on('playerMoved', data => {
  if (data.playerId in players) {
    const p = players[data.playerId];
    p.x = data.x;
    p.y = data.y;
    p.direction = data.direction;
    p.frameIndex = data.frameIndex;
    p.health = data.health;
  }
});

socket.on('playerDisconnected', id => delete players[id]);

// Handle incoming chat messages and update chat log
socket.on('chatMessage', data => {
  const chatLog = document.getElementById('chatLog');
  let playerName;
  if (data.playerId === player.id) {
    playerName = player.name;
  } else if (players[data.playerId]) {
    playerName = players[data.playerId].name;
  } else {
    playerName = 'Unknown';
  }
  const messageElement = document.createElement('p');
  const timestamp = new Date().toLocaleTimeString();
  messageElement.innerHTML = `<span class="timestamp">[${timestamp}]</span> <strong>${playerName}:</strong> ${data.message}`;
  chatLog.appendChild(messageElement);
  chatLog.scrollTop = chatLog.scrollHeight;

  // Optionally display the message above the player's head for a few seconds
  playerMessages[data.playerId] = data.message;
  setTimeout(() => delete playerMessages[data.playerId], 5000);
});

// Handle private messages
socket.on('privateMessage', data => {
  const senderName = players[data.senderId] ? players[data.senderId].name : 'Unknown';
  const chatLog = document.getElementById('chatLog');
  const messageElement = document.createElement('p');
  const timestamp = new Date().toLocaleTimeString();
  messageElement.innerHTML = `<span class="timestamp">[${timestamp}]</span> <em>Private message from ${senderName}:</em> ${data.message}`;
  chatLog.appendChild(messageElement);
  chatLog.scrollTop = chatLog.scrollHeight;
});

// Initialize the game after all assets are loaded
function startGame() {
  initializeGameWorld();
  requestAnimationFrame(gameLoop);
}

// Load all assets and then start the game
loadTileImages(() => {
  loadSpriteImages(() => {
    startGame();
  });
});

// Update inventory display
function updateInventoryDisplay() {
  const inventoryList = document.getElementById('inventoryList');
  inventoryList.innerHTML = '';
  player.inventory.forEach((item, index) => {
    const li = document.createElement('li');
    if (item.type === 'potion') {
      li.textContent = `Potion (Healing: ${item.healing})`;
    } else if (item.type === 'shield') {
      li.textContent = `Shield (Defense: ${item.defense})`;
    } else if (item.type === 'sword' || item.type === 'staff') {
      li.textContent = `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} (Damage: ${item.damage})`;
    } else {
      li.textContent = item.type;
    }
    li.dataset.index = index;
    if (player.equippedItem === item) {
      li.style.backgroundColor = 'yellow';
    }

    inventoryList.appendChild(li);
  });
  // Update HUD to display copper
  drawHUD();
}

// Use item (e.g., potion)
function useItem() {
  const potionIndex = player.inventory.findIndex(item => item.type === 'potion');
  if (potionIndex !== -1) {
    const potion = player.inventory.splice(potionIndex, 1)[0];
    player.health = Math.min(player.maxHealth, player.health + potion.healing);
    updateInventoryDisplay();
    // Emit health update to server
    socket.emit('playerMovement', {
      x: player.x,
      y: player.y,
      direction: player.direction,
      frameIndex: player.frameIndex,
      health: player.health
    });
  }
}

// Draw Heads-Up Display (HUD) for the player
function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let hudX = 10;
  let hudY = 10;

  ctx.fillText(`Health: ${player.health}/${player.maxHealth}`, hudX, hudY);
  hudY += 30;

  if (player.equippedItem) {
    ctx.fillText(`Equipped: ${player.equippedItem.type}`, hudX, hudY);
    hudY += 30;
  }

  // Display copper
  ctx.fillText(`Copper: ${player.copper || 0}`, hudX, hudY);
  hudY += 30;

  ctx.restore();
}

function updateEnemyAnimations(deltaTime) {
  Object.values(enemies).forEach(enemy => {
    enemy.animationTimer = (enemy.animationTimer || 0) + deltaTime;
    if (enemy.animationTimer >= animationSpeed) {
      enemy.frameIndex = (enemy.frameIndex + 1) % enemy.frameCount;
      enemy.animationTimer = 0;
    }
  });
}

// Function to open the trade modal
function openTradeModal() {
  const tradeModal = document.getElementById('tradeModal');
  const playerSelect = document.getElementById('playerSelect');
  const yourItems = document.getElementById('yourItems');

  // Populate player list
  playerSelect.innerHTML = '';
  Object.values(players).forEach(p => {
    if (p.id !== player.id) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      playerSelect.appendChild(option);
    }
  });

  // Populate your items
  yourItems.innerHTML = '';
  player.inventory.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item.type;
    li.dataset.index = index;
    yourItems.appendChild(li);
  });

  tradeModal.style.display = 'flex';
}