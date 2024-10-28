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
const TILE_WALL = 1;
const TILE_DOOR = 2;
const TILE_FLOOR = 3;

// Game world array
let gameWorld = [];
// Safe zones
const safeZones = [
  { x: 25 * TILE_SIZE, y: 25 * TILE_SIZE, width: 30 * TILE_SIZE, height: 30 * TILE_SIZE },
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
const tileImages = {};
const tileTypes = [TILE_FLOOR, TILE_WALL, TILE_DOOR];

function loadTileImages(callback) {
  let loadedImages = 0;
  tileTypes.forEach(type => {
    tileImages[type] = new Image();
    tileImages[type].src = `Images/tile_${type}.png`;
    tileImages[type].onload = () => {
      loadedImages++;
      if (loadedImages === tileTypes.length) {
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
  gameWorld[y + Math.floor(height / 2)][x] = TILE_DOOR; // Place door on the left wall
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
  enemies = {};
  Object.values(serverEnemies).forEach(enemyData => {
    const enemy = { ...enemyData };
    enemy.sprite = spriteImages.enemy;
    enemy.frameCount = spritesToLoad.find(s => s.key === 'enemy').frames;
    enemy.animationTimer = 0;
    enemies[enemy.id] = enemy;
  });
});

// Handle enemy killed
socket.on('enemyKilled', enemyId => {
  delete enemies[enemyId];
});

// Handle attack errors from the server
socket.on('attackError', message => {
  showMessage(message);
});

// **Updated updatePlayerPosition function with improved collision handling**
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

  // Impassable tiles (doors are now pass-through)
  const impassableTiles = [TILE_WALL];

  const collidesWithImpassable = [topLeftTile, topRightTile, bottomLeftTile, bottomRightTile]
    .some(tile => impassableTiles.includes(tile));

  if (!collidesWithImpassable) {
    player.x = newX;
    player.y = newY;
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
  ctx.strokeStyle = 'green';
  ctx.lineWidth = 2;

  safeZones.forEach(zone => {
    ctx.strokeRect(zone.x - cameraX, zone.y - cameraY, zone.width, zone.height);
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
      // Check if the player is in a safe zone
      if (isInSafeZone(player.x, player.y)) {
        showMessage('You cannot attack in a safe zone!');
        return;
      }
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

      // If no enemy is close, check for players
      if (!targetId) {
        Object.values(players).forEach(p => {
          if (p.id !== player.id) {
            const distance = Math.hypot(player.x - p.x, player.y - p.y);
            if (distance < attackRange && distance < minDistance) {
              minDistance = distance;
              targetId = p.id;
            }
          }
        });
      }

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

// Function to initiate a trade
function initiateTrade(offeredItemIndex) {
  const nearbyPlayers = getNearbyPlayers(100); // Replace 100 with your trade range
  if (nearbyPlayers.length === 0) {
    alert('No players nearby to trade with.');
    return;
  }

  const playerNames = nearbyPlayers.map(p => `${p.name} (ID: ${p.id})`).join('\n');
  const recipientChoice = prompt(`Choose a player to trade with:\n${playerNames}`);
  const recipient = nearbyPlayers.find(p => `${p.name} (ID: ${p.id})` === recipientChoice);

  if (recipient) {
    const requestedItemIndex = prompt('Enter the index of the item you want from the other player:');
    socket.emit('tradeRequest', {
      recipientId: recipient.id,
      offeredItemIndex,
      requestedItemIndex: parseInt(requestedItemIndex)
    });
  } else {
    alert('Invalid selection.');
  }
}

// Function to get nearby players within a certain distance
function getNearbyPlayers(range) {
  return Object.values(players).filter(p => {
    if (p.id !== player.id) {
      const distance = Math.hypot(player.x - p.x, player.y - p.y);
      return distance <= range;
    }
    return false;
  });
}

// Handle incoming trade requests
socket.on('tradeRequest', data => {
  const accept = confirm(`${data.senderName} wants to trade their ${data.offeredItem.type} for your ${data.requestedItem.type}. Accept?`);
  if (accept) {
    socket.emit('acceptTrade', data.senderId);
  } else {
    socket.emit('declineTrade', data.senderId);
  }
});

// Handle trade success
socket.on('tradeSuccess', data => {
  player.inventory = data.newInventory;
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

    // Add an Equip button
    const equipButton = document.createElement('button');
    equipButton.textContent = 'Equip';
    equipButton.onclick = () => {
      player.equippedItem = item;
      updateInventoryDisplay();
    };
    li.appendChild(equipButton);

    // Add a Trade button
    const tradeButton = document.createElement('button');
    tradeButton.textContent = 'Trade';
    tradeButton.onclick = () => {
      initiateTrade(index);
    };
    li.appendChild(tradeButton);

    inventoryList.appendChild(li);
  });
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

  let hudX = 10; // Adjusted X position to prevent cutoff
  let hudY = 10; // Starting Y position

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
