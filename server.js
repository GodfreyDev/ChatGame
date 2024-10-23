/**
 * @file server.js
 * @description This file implements a basic multiplayer game server using Node.js, Express, and Socket.IO. 
 * The server allows players to connect, move around a game world, chat, and interact with items and other players.
 * Players are assigned random names upon connection, and the server maintains the state of the game world, including 
 * player positions, inventory, and health.
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
 * Creates 50 random items (sword, shield, potion) and places them at random positions in the game world.
 *
 * @event 'connection'
 * Listens for new socket connections. When a player connects, they are assigned a name, and their position and state
 * are added to the game world. The server also sends the current state of all players and items to the new player.
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
 * Handles combat interactions between players. Reduces the health of the target player, and if health reaches 0, the
 * target player is removed from the game world.
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
 * @listens {socket.io} on 'connection', 'playerMovement', 'chatMessage', 'pickupItem', 'attack', 'disconnect'
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Structure to hold player data
let players = {};
let items = {}; // To store items on the server

// Arrays of adjectives and nouns for player name generation
const adjectives = ['Quick', 'Lazy', 'Jolly', 'Brave', 'Clever', 'Wise', 'Fierce', 'Gentle', 'Loyal'];
const nouns = ['Fox', 'Bear', 'Dragon', 'Wolf', 'Tiger', 'Rabbit', 'Eagle', 'Owl', 'Lion'];

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
  for (let i = 0; i < 50; i++) {
    const id = `item${i}`;
    items[id] = {
      id,
      x: Math.floor(Math.random() * 200 * 64),
      y: Math.floor(Math.random() * 200 * 64),
      type: getRandomElement(['sword', 'shield', 'potion'])
    };
  }
}

// Handle socket.io connections
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);
  const playerName = generatePlayerName();

  // Initialize player data
  players[socket.id] = {
    id: socket.id,
    name: playerName,
    x: 400,
    y: 300,
    direction: 0, // Default direction
    moving: false,
    width: 64, // Sprite width
    height: 64, // Sprite height
    health: 100, // Player health
    inventory: [] // Player inventory
  };

  // Emit current players and items to the newly connected player
  socket.emit('currentPlayers', players);
  socket.emit('currentItems', items);

  // Broadcast new player's arrival to other players
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Update player position and direction based on movement
  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].direction = data.direction;
      players[socket.id].frameIndex = data.frameIndex;

      // Broadcast the updated player position and frameIndex to other players
      socket.broadcast.emit('playerMoved', {
        playerId: socket.id,
        x: data.x,
        y: data.y,
        direction: data.direction,
        frameIndex: data.frameIndex
      });
    }
  });

  // Handle chat messages
  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', { playerId: socket.id, message: data.message });
  });

  // Handle item pickup
  socket.on('pickupItem', (itemId) => {
    if (items[itemId]) {
      players[socket.id].inventory.push(items[itemId].type);
      delete items[itemId];
      io.emit('itemPickedUp', { playerId: socket.id, itemId });
    }
  });

  // Handle combat
  socket.on('attack', (targetId) => {
    if (players[targetId]) {
      players[targetId].health -= 10; // Example damage value
      if (players[targetId].health <= 0) {
        io.emit('playerKilled', targetId);
        delete players[targetId];
      } else {
        io.emit('playerDamaged', { targetId, health: players[targetId].health });
      }
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Initialize items
generateItems();

// Determine the server URL based on the environment
const serverUrl = process.env.NODE_ENV === 'production'
  ? 'https://cool-accessible-pint.glitch.me'
  : 'http://localhost:3000';

// Listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${serverUrl}:${PORT}`));
