/**
 * @file server.js
 * @description This file implements a basic multiplayer game server using Node.js, Express, and Socket.IO.
 * The server manages player connections, movements, chat, item interactions, combat, enemy AI, code rewards, and trading.
 * Players are assigned random names upon connection, and the server maintains the state of the game world, including
 * player positions, inventory, health, and copper.
 *
 * Key Features:
 * - Player management: Connect, disconnect, movement, health, and inventory.
 * - Item management: Spawn items, handle pickups.
 * - Enemy AI: Server-side enemies with movement, targeting, and attacking players.
 * - Combat system: Players can attack enemies and other players.
 * - Currency system: Players earn "copper" when they defeat enemies.
 * - Code rewards: Players earn codes when they defeat enemies.
 * - Trading system: Players can trade items with each other.
 * 
 * @dependencies
 * - express: Web framework for Node.js
 * - http: HTTP server library built into Node.js
 * - socket.io: Library for real-time, bidirectional communication between web clients and servers
 *
 * @function getRandomElement(arr)
 * Returns a random element from an array.
 *
 * @function generatePlayerName()
 * Generates a unique player name by combining a random adjective, noun, and number.
 *
 * @function generateItems()
 * Creates random items (sword, shield, potion, staff) and places them at random positions in the game world.
 *
 * @event 'connection'
 * Listens for new socket connections. When a player connects, they are assigned a name, and their position and state
 * are added to the game world. The server also sends the current state of all players, items, and enemies to the new player.
 *
 * @event 'playerMovement'
 * Updates player position and direction when a movement event is received from the client. Broadcasts the updated
 * information to all other connected players.
 *
 * @event 'chatMessage'
 * Handles chat messages sent by players and broadcasts them to all connected clients.
 *
 * @event 'pickupItem'
 * Handles item pickups by players. The item is removed from the game world and added to the player's inventory.
 *
 * @event 'attack'
 * Handles combat interactions between players and enemies. Reduces the health of the target, and if health reaches 0,
 * the target is removed from the game world or respawned.
 *
 * @event 'tradeRequest'
 * Handles trade requests between players.
 *
 * @event 'acceptTrade'
 * Handles acceptance of trade offers.
 *
 * @event 'declineTrade'
 * Handles decline of trade offers.
 *
 * @event 'disconnect'
 * Cleans up player data when a player disconnects, broadcasting the disconnection to all other players.
 *
 * @constant {string} serverUrl
 * The server URL is set dynamically based on the environment (production or development).
 *
 * @constant {number} PORT
 * The port number the server listens on, either from the environment or defaulting to 3000.
 *
 * @listens {socket.io} on 'connection', 'playerMovement', 'chatMessage', 'pickupItem', 'attack', 'tradeRequest', 'acceptTrade', 'declineTrade', 'disconnect'
 */
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Enable CORS for all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Directions based on sprite sheet layout
const DIRECTIONS = {
  DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN_LEFT: 4, DOWN_RIGHT: 5, UP_LEFT: 6, UP_RIGHT: 7
};

// Tile types
const TILE_WALL = 1;
const TILE_DOOR = 2;
const TILE_FLOOR = 3;

// Game constants
const TILE_SIZE = 64;
const WORLD_WIDTH = 200 * TILE_SIZE;
const WORLD_HEIGHT = 200 * TILE_SIZE;

// Structure to hold game data
let players = {};
let items = {};
let enemies = {};
let gameWorld = []; // Define the game world on the server for collision detection

// Arrays of adjectives and nouns for player name generation
const adjectives = ['Quick', 'Lazy', 'Jolly', 'Brave', 'Clever', 'Wise', 'Fierce', 'Gentle', 'Loyal'];
const nouns = ['Fox', 'Bear', 'Dragon', 'Wolf', 'Tiger', 'Rabbit', 'Eagle', 'Owl', 'Lion'];

// Safe zones
const safeZones = [
  { x: 20 * TILE_SIZE, y: 50 * TILE_SIZE, width: 40 * TILE_SIZE, height: 30 * TILE_SIZE },
  // Add more safe zones if needed
];

// Initialize the game world
initializeGameWorld();

// Initialize items and enemies
generateItems();
initializeEnemies();

// Function to initialize the game world
function initializeGameWorld() {
  const worldWidthInTiles = WORLD_WIDTH / TILE_SIZE;
  const worldHeightInTiles = WORLD_HEIGHT / TILE_SIZE;

  for (let y = 0; y < worldHeightInTiles; y++) {
    gameWorld[y] = [];
    for (let x = 0; x < worldWidthInTiles; x++) {
      if (x === 0 || x === worldWidthInTiles - 1 || y === 0 || y === worldHeightInTiles - 1) {
        gameWorld[y][x] = TILE_WALL;
      } else {
        gameWorld[y][x] = TILE_FLOOR;
      }
    }
  }

  // Create rooms and corridors (match with client)
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

// Helper function to get tile at a specific position
function getTileAt(x, y) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  if (tileX < 0 || tileX >= gameWorld[0].length || tileY < 0 || tileY >= gameWorld.length) {
    return TILE_WALL; // Treat out-of-bounds as wall
  }
  return gameWorld[tileY][tileX];
}

// Helper function to check if a position is within a safe zone
function isInSafeZone(x, y) {
  return safeZones.some(zone =>
    x >= zone.x && x <= zone.x + zone.width &&
    y >= zone.y && y <= zone.y + zone.height
  );
}

// Function to return a random element from an array
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generates a unique player name
function generatePlayerName() {
  return `${getRandomElement(adjectives)}${getRandomElement(nouns)}${Math.floor(Math.random() * 100)}`;
}

// Generate random items in the world
function generateItems() {
  const itemTypes = ['sword', 'shield', 'potion', 'staff'];
  for (let i = 0; i < 50; i++) {
    const id = `item${i}`;
    const type = getRandomElement(itemTypes);
    const item = {
      id,
      x: Math.floor(Math.random() * WORLD_WIDTH),
      y: Math.floor(Math.random() * WORLD_HEIGHT),
      type
    };
    if (type === 'sword' || type === 'staff') {
      item.damage = Math.floor(Math.random() * 20) + 10; // Damage between 10 and 30
    } else if (type === 'potion') {
      item.healing = Math.floor(Math.random() * 20) + 10; // Healing between 10 and 30
    } else if (type === 'shield') {
      item.defense = Math.floor(Math.random() * 5) + 5; // Defense between 5 and 10
    }
    items[id] = item;
  }
}

// Initialize enemies
function initializeEnemies() {
  for (let i = 0; i < 20; i++) {
    const id = `enemy${i}`;
    enemies[id] = {
      id,
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      width: 64,
      height: 64,
      health: 50,
      maxHealth: 50,
      speed: 100,
      targetPlayerId: null,
      direction: DIRECTIONS.DOWN,
      frameIndex: 0,
      frameCount: 8,
      aiState: {
        action: 'idle',
        timer: 0,
        direction: 0
      }
    };
  }
}

// Adjust player spawning to ensure they spawn inside valid areas (safe zones)
function getValidSpawnPoint() {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    const tile = getTileAt(x, y);
    if (tile === TILE_FLOOR && isInSafeZone(x, y)) {
      return { x, y };
    }
  }
  // If no valid spawn point found, return a default safe point
  return { x: safeZones[0].x + safeZones[0].width / 2, y: safeZones[0].y + safeZones[0].height / 2 };
}

// Generate a reward code
function generateRewardCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Update enemies with collision detection
function updateEnemies(deltaTime) {
  Object.values(enemies).forEach(enemy => {
    if (enemy.health <= 0) return;

    enemy.aiState.timer -= deltaTime;

    // Find the nearest player
    let nearestPlayer = null;
    let minDistance = Infinity;
    Object.values(players).forEach(player => {
      const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPlayer = player;
      }
    });

    if (nearestPlayer && minDistance < 500) {
      // Chase the nearest player
      enemy.aiState.action = 'chase';
      enemy.targetPlayerId = nearestPlayer.id;
    } else if (enemy.aiState.timer <= 0) {
      // Randomly decide next action
      const actions = ['idle', 'move'];
      enemy.aiState.action = actions[Math.floor(Math.random() * actions.length)];
      enemy.aiState.timer = Math.random() * 2 + 1; // 1 to 3 seconds
      enemy.aiState.direction = Math.floor(Math.random() * 4); // 0 to 3
      enemy.targetPlayerId = null;
    }

    let dx = 0, dy = 0;

    if (enemy.aiState.action === 'chase' && enemy.targetPlayerId) {
      const targetPlayer = players[enemy.targetPlayerId];
      if (targetPlayer) {
        const angle = Math.atan2(targetPlayer.y - enemy.y, targetPlayer.x - enemy.x);
        dx = Math.cos(angle) * enemy.speed * deltaTime;
        dy = Math.sin(angle) * enemy.speed * deltaTime;

        // Update enemy direction based on angle
        if (Math.abs(dx) > Math.abs(dy)) {
          enemy.direction = dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
        } else {
          enemy.direction = dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
        }
      }
    } else if (enemy.aiState.action === 'move') {
      const speed = enemy.speed * deltaTime;
      switch (enemy.aiState.direction) {
        case 0: dy = speed; enemy.direction = DIRECTIONS.DOWN; break; // Down
        case 1: dx = -speed; enemy.direction = DIRECTIONS.LEFT; break; // Left
        case 2: dx = speed; enemy.direction = DIRECTIONS.RIGHT; break; // Right
        case 3: dy = -speed; enemy.direction = DIRECTIONS.UP; break; // Up
      }
    }

    // Collision detection with walls
    const newX = enemy.x + dx;
    const newY = enemy.y + dy;

    const topLeftTile = getTileAt(newX - enemy.width / 2, newY - enemy.height / 2);
    const topRightTile = getTileAt(newX + enemy.width / 2, newY - enemy.height / 2);
    const bottomLeftTile = getTileAt(newX - enemy.width / 2, newY + enemy.height / 2);
    const bottomRightTile = getTileAt(newX + enemy.width / 2, newY + enemy.height / 2);

    const impassableTiles = [TILE_WALL];
    const collidesWithImpassable = [topLeftTile, topRightTile, bottomLeftTile, bottomRightTile].some(tile => impassableTiles.includes(tile));

    if (!collidesWithImpassable) {
      enemy.x = newX;
      enemy.y = newY;
    }

    // Handle attacking the player
    if (enemy.targetPlayerId) {
      const targetPlayer = players[enemy.targetPlayerId];
      if (targetPlayer) {
        const distanceToPlayer = Math.hypot(enemy.x - targetPlayer.x, enemy.y - targetPlayer.y);
        if (distanceToPlayer < 50) {
          // Attack the player
          if (!enemy.attackCooldown || Date.now() - enemy.attackCooldown > 1000) { // 1 second cooldown
            enemy.attackCooldown = Date.now();
            io.emit('enemyAttack', { enemyId: enemy.id });

            // Check if player is in safe zone
            if (isInSafeZone(targetPlayer.x, targetPlayer.y)) {
              // Player is invincible in safe zone
              // Do not apply damage
            } else {
              let damage = 10;
              // Apply shield defense if equipped
              const shield = targetPlayer.inventory.find(item => item.type === 'shield');
              if (shield) {
                damage -= shield.defense;
                damage = Math.max(0, damage);
              }
              targetPlayer.health -= damage;
              if (targetPlayer.health <= 0) {
                targetPlayer.health = 0;
                io.emit('playerKilled', targetPlayer.id);
                // Remove player data
                delete players[targetPlayer.id];
                io.emit('playerDisconnected', targetPlayer.id);
                const targetSocket = io.sockets.sockets.get(targetPlayer.id);
                if (targetSocket) {
                  targetSocket.disconnect(true);
                }
              } else {
                // Notify the player of the damage
                io.to(targetPlayer.id).emit('playerDamaged', {
                  playerId: targetPlayer.id,
                  health: targetPlayer.health
                });
              }
            }
          }
        }
      }
    }
  });
}

// Broadcast enemy data to clients
function broadcastEnemies() {
  io.emit('updateEnemies', enemies);
}

// Handle socket.io connections
io.on('connection', (socket) => {
  
  const playerName = generatePlayerName();
  console.log(`A user connected: Name: ${playerName} Socket ID:${socket.id}`);
  // Get a valid spawn point
  const spawnPoint = getValidSpawnPoint();
  
  // Initialize player data
  players[socket.id] = {
    id: socket.id,
    name: playerName,
    x: spawnPoint.x,
    y: spawnPoint.y,
    direction: DIRECTIONS.DOWN, // Default direction
    moving: false,
    width: 64,
    height: 64,
    health: 100,
    maxHealth: 100,
    inventory: [],
    equippedItem: null,
    copper: 0,
    frameIndex: 0
  };

  socket.emit('chatMessage', { playerId: socket.id, message: `You joined the game as ${playerName}` });

  // Function to get sanitized player data
  function getPlayerData(player) {
    return {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      direction: player.direction,
      moving: player.moving,
      width: player.width,
      height: player.height,
      health: player.health,
      maxHealth: player.maxHealth,
      frameIndex: player.frameIndex,
    };
  }

  // Emit current players to the newly connected player
  socket.emit('currentPlayers', Object.fromEntries(
    Object.values(players).map(p => [p.id, getPlayerData(p)])
  ));

  // Emit current items and enemies
  socket.emit('currentItems', items);
  socket.emit('updateEnemies', enemies);

  // Broadcast new player's arrival to other players
  socket.broadcast.emit('newPlayer', getPlayerData(players[socket.id]));

  // Remove health update from playerMovement
  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].direction = data.direction;
      players[socket.id].frameIndex = data.frameIndex;
      players[socket.id].moving = data.moving;

      // Broadcast position and movement without health
      socket.broadcast.emit('playerMoved', {
        playerId: socket.id,
        x: data.x,
        y: data.y,
        direction: data.direction,
        frameIndex: data.frameIndex,
        moving: data.moving
      });
    }
  });

  // Handle chat messages
  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', { playerId: socket.id, message: data.message });
  });

  // Handle private messages
  socket.on('privateMessage', data => {
    const recipientSocket = io.sockets.sockets.get(data.recipientId);
    if (recipientSocket) {
      recipientSocket.emit('privateMessage', {
        senderId: socket.id,
        message: data.message
      });
      socket.emit('privateMessageSent', {
        recipientId: data.recipientId,
        message: data.message
      });
    } else {
      socket.emit('chatError', 'Recipient not found.');
    }
  });

  // Handle item pickup
  socket.on('pickupItem', (itemId) => {
    if (items[itemId]) {
      const item = items[itemId];
      players[socket.id].inventory.push(item);
      delete items[itemId];
      io.emit('itemPickedUp', { playerId: socket.id, itemId, item });
    }
  });

  // Updated attack handler to award a code instead of copper when an enemy is defeated
  socket.on('attack', (data) => {
    const attacker = players[socket.id];
    const targetId = data.targetId;
    const weapon = data.weapon;
    let damage = 10; // Default damage
    if (weapon && weapon.damage) {
      damage = weapon.damage;
    }
  
    if (players[targetId]) {
      // Player is attacking another player
      const targetPlayer = players[targetId];
      // If target is in safe zone, prevent damage
      if (isInSafeZone(targetPlayer.x, targetPlayer.y)) {
        socket.emit('attackError', 'You cannot attack players in a safe zone.');
      } else {
        // Apply damage to target player
        let finalDamage = damage;
        // Apply shield defense if equipped
        const shield = targetPlayer.inventory.find(item => item.type === 'shield');
        if (shield) {
          finalDamage -= shield.defense;
          finalDamage = Math.max(0, finalDamage);
        }
        targetPlayer.health -= finalDamage;
        if (targetPlayer.health <= 0) {
          targetPlayer.health = 0;
          io.emit('playerKilled', targetPlayer.id);
          // Remove player data
          delete players[targetPlayer.id];
          io.emit('playerDisconnected', targetPlayer.id);
          const targetSocket = io.sockets.sockets.get(targetPlayer.id);
          if (targetSocket) {
            targetSocket.disconnect(true);
          }
        } else {
          // Notify the target player of the damage
          io.to(targetPlayer.id).emit('playerDamaged', {
            playerId: targetPlayer.id,
            health: targetPlayer.health
          });
        }
        // Notify attacker of successful attack
        socket.emit('attackSuccess', { targetId: targetId, damage: finalDamage });
      }
    } else if (enemies[targetId]) {
      const enemy = enemies[targetId];
      enemy.health -= damage;
      if (enemy.health <= 0) {
        enemy.health = 0;
  
        // Award copper to player
        attacker.copper += 10; // Award 10 copper
        io.to(socket.id).emit('updateCopper', attacker.copper);
  
        // Remove the enemy from the game
        delete enemies[targetId];
        io.emit('enemyKilled', targetId);
      }
    }
  });
  

  // Heal players in safe zones
  setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; // Convert to seconds
    lastUpdateTime = now;

    // Update enemies and broadcast their state
    updateEnemies(deltaTime);
    broadcastEnemies();

    // Heal players in safe zones
    Object.values(players).forEach(player => {
      if (isInSafeZone(player.x, player.y)) {
        player.health += 1; // Heal rate per update
        if (player.health > player.maxHealth) {
          player.health = player.maxHealth;
        }
        // Send updated health to the player
        io.to(player.id).emit('playerHealed', { health: player.health });
      }
    });
  }, 1000 / 5); // 5 updates per second


  // Handle trade requests
socket.on('tradeRequest', (data) => {
  const recipientId = data.recipientId;
  const offeredItemIndex = data.offeredItemIndex;
  const offeredCopper = data.offeredCopper || 0;
  const sender = players[socket.id];
  const recipient = players[recipientId];

  if (sender && recipient && (sender.inventory[offeredItemIndex] || offeredCopper > 0)) {
    // Send trade request to recipient
    io.to(recipientId).emit('tradeRequest', {
      senderId: socket.id,
      senderName: sender.name,
      offeredItem: sender.inventory[offeredItemIndex],
      offeredCopper: offeredCopper
    });

    // Store trade request data
    sender.pendingTrade = {
      recipientId,
      offeredItemIndex,
      offeredCopper
    };
  } else {
    socket.emit('tradeError', 'Invalid trade request.');
  }
});

socket.on('acceptTrade', (data) => {
  const senderId = data.senderId;
  const requestedItemIndex = data.requestedItemIndex;
  const requestedCopper = data.requestedCopper || 0;
  const sender = players[senderId];
  const recipient = players[socket.id];

  if (sender && recipient && sender.pendingTrade && sender.pendingTrade.recipientId === socket.id) {
    const { offeredItemIndex, offeredCopper } = sender.pendingTrade;

    // Validate that both players have the items/copper they are trading
    const offeredItem = sender.inventory[offeredItemIndex];
    const recipientItem = recipient.inventory[requestedItemIndex];
    if ((offeredItem || offeredCopper > 0) && (recipientItem || requestedCopper > 0)) {
      if (offeredItem) {
        sender.inventory.splice(offeredItemIndex, 1);
        recipient.inventory.push(offeredItem);
      }
      if (offeredCopper > 0) {
        sender.copper -= offeredCopper;
        recipient.copper += offeredCopper;
      }
      if (recipientItem) {
        recipient.inventory.splice(requestedItemIndex, 1);
        sender.inventory.push(recipientItem);
      }
      if (requestedCopper > 0) {
        recipient.copper -= requestedCopper;
        sender.copper += requestedCopper;
      }

      // Notify both players
      io.to(senderId).emit('tradeSuccess', { newInventory: sender.inventory, copper: sender.copper });
      io.to(socket.id).emit('tradeSuccess', { newInventory: recipient.inventory, copper: recipient.copper });

      // Clear pending trade
      delete sender.pendingTrade;
    } else {
      io.to(senderId).emit('tradeError', 'Trade failed. Items or copper no longer available.');
      io.to(socket.id).emit('tradeError', 'Trade failed. Items or copper no longer available.');
    }
  } else {
    socket.emit('tradeError', 'No valid trade to accept.');
  }
});

  // Handle trade decline
  socket.on('declineTrade', (senderId) => {
    const sender = players[senderId];
    const recipientId = socket.id;

    if (sender && sender.pendingTrade && sender.pendingTrade.recipientId === recipientId) {
      io.to(senderId).emit('tradeDeclined', { recipientId });
      delete sender.pendingTrade;
    } else {
      socket.emit('tradeError', 'No valid trade to decline.');
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Game loop for server-side updates
let lastUpdateTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaTime = (now - lastUpdateTime) / 1000; // Convert to seconds
  lastUpdateTime = now;

  // Update enemies and broadcast their state
  updateEnemies(deltaTime);
  broadcastEnemies();
}, 1000 / 30); // 30 updates per second

// Listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
