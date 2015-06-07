
var gameport = 8080;
var verbose = false;
var fps = 60; // (game loop) frames per second
var bps = 45; // broadcasts per second
var interval = 1000 / fps;
var broadcastInterval = 1000 / bps;

var movementDelay = 5;

var mapFile = '/testMap.json';
var max_players = 4;
var players = new Array(max_players);
var activeEntities = {}; // holds all in-game entities
var needsBroadcast = false;
var map;

var pjson = require(__dirname + '/package.json');
// prefix for console.log-ing
var prefix = function() { return ':: ' + pjson.name + ' v' + pjson.version + (verbose ? ' | ' + new Date().toString() : '') + ' :: '};
var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var uuid = require('node-uuid');

// the client can access everything in static/
app.use(express.static('static'));

// Timer polyfill
// window.requestAnimationFrame polyfill: http://creativejs.com/resources/requestanimationframe/
global.window = global.document = global;
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
    || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback, element) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
            timeToCall);
        lastTime = currTime + timeToCall;
        return id;
    };

if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
        clearTimeout(id);
    };
}());

// read in the map
console.log(prefix() + 'Setting up game...');
fs.readFile(__dirname + mapFile, function(err, data) {
    if(err) throw err;
    var jsonData = JSON.parse(data);
    map = new GameMap(jsonData.map.split('\\n').map(function(e) {
        return e.split('');
    }), jsonData.spawns);
    console.log(prefix() + 'Map ' + mapFile + ' loaded.');
    // start the main game loop
    mainGameLoop();
    console.log(prefix() + 'Starting server...');
    server.listen(gameport);
    console.log(prefix() + 'Server listening on port ' + gameport + '.');
    // start the broadcast loop
    sendUpdates();
    console.log(prefix() + 'Started game and broadcast loops.');
});

// game loop
function mainGameLoop() {
	for(var i = 0; i < max_players; i++) {
		if (players[i] == null) continue;
		if (players[i].restCounter > 0) players[i].restCounter--;
		else {
            var px = players[i].entity.position.x;
            var py = players[i].entity.position.y;
			if (players[i].left && !players[i].right && isOccupiable(px - 1, py)) {
				players[i].entity.position.x -= 1;
				players[i].restCounter = players[i].movementDelay;
			} else if (!players[i].left && players[i].right && isOccupiable(px + 1, py)) {
				players[i].entity.position.x += 1;
				players[i].restCounter = players[i].movementDelay;
			} else if (players[i].up && !players[i].down && isOccupiable(px, py - 1)) {
				players[i].entity.position.y -= 1;
				players[i].restCounter = players[i].movementDelay;
			} else if (!players[i].up && players[i].down && isOccupiable(px, py + 1)) {
				players[i].entity.position.y += 1;
				players[i].restCounter = players[i].movementDelay;
			}
		}
		players[i].socket.emit('update', activeEntities);
	}
    setTimeout(function() {
        window.requestAnimationFrame(mainGameLoop);
    }, interval);
}

// broadcast loop
function sendUpdates() {
    setTimeout(function() {
        window.requestAnimationFrame(sendUpdates);

        // do updates here
        
        if(!needsBroadcast) return;
        // to each active player, send a message of type 'update'
        // which contains the list of active entities
        for(var i = 0; i < max_players; i++) {
            if(players[i] == null) continue;
            players[i].socket.emit('update', activeEntities);
        }
        needsBroadcast = false;
    }, broadcastInterval);
}

// redirect requests for root to index.html
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/static/index.html');
});

io.on('connection', function (socket) {
    // search for open spots
    var i = -1;
    for(i = 0; i < max_players; i++) {
        if(players[i] == null) break;
    }
    // if i != max_players after the loop, there is an empty spot
    if(i != max_players) {
        // generate a game entity representing the player with uuid
        entity = new Entity(uuid.v4(), i);
        entity.position.x = map.spawns[i].x;
        entity.position.y = map.spawns[i].y;
        players[i] = new Player(socket, i, entity);
        activeEntities[entity.id] = entity;
        // send client game data
        // TODO eventually get rid of the next line and integrate it into the needsBroadcast (make first time update and usual update the same)
        socket.emit('initialdata', { 'map' : map, 'activeEntities' : activeEntities });
        // start listening for keypresses
        socket.on('keyDown', function(keyData) {
            switch(keyData) {
                case 68:  // d
					players[i].right = true;
                    break;
                case 65: // a
                    players[i].left = true;
                    break;
                case 83: // s
                    players[i].down = true;
                    break;
                case 87: // w
                    players[i].up = true;
                    break;
            }
		});
		socket.on('keyUp', function(keyData) {
            switch(keyData) {
                case 68:  // d
					players[i].right = false;
                    break;
                case 65: // a
                    players[i].left = false;
                    break;
                case 83: // s
                    players[i].down = false;
                    break;
                case 87: // w
                    players[i].up = false;
                    break;
            }
        });
        // make sure everyone gets the update
        needsBroadcast = true;
    } else {
        // TODO change this to an error and display it prominently in the client
        socket.emit('log', {message: 'There are already 4 players online!'});
        socket.disconnect();
        console.log(prefix() + 'Connection received, but the game is full. Socket disconnected.');
    }
});

// used for movement collision detection
function isOccupiable(x, y) {
    // is it a wall?
    if(map.mapArray[x][y] == '█')
        return false;
    // is there another entity there?
    for(var id in activeEntities)
        if(activeEntities.hasOwnProperty(id))
            if(activeEntities[id].position.x == x && activeEntities[id].position.y == y)
                return false;

    // no collisions found
    return true;
}

// abstracts the data associated with a human player
function Player(socket, num, entity) {
    this.socket = socket;
    this.id = socket.id;
    this.num = num;
    this.entity = entity;
	// keys currently pressed
	this.up = false;
	this.down = false;
	this.left = false;
	this.right = false;
	// frames between moves
	this.movementDelay = movementDelay;
	// # of frames until next move permitted
	this.restCounter = 0;
    console.log(prefix() + 'Player ' + this.id + ' connected. Assigned player number ' + this.num + '.');
    console.log(prefix() + 'Player ' + this.num + ' spawns at (' + this.entity.position.x + ', ' + this.entity.position.y + ').');
    socket.emit('log', {message: 'Connected as Player ' + this.num + ' with id ' + this.id + '.'});
    // when the player disconnects...
    socket.on('disconnect', function() {
        console.log(prefix() + 'Player ' + num + ', id ' + this.id + ', disconnected.');
        // remove the player's game entity
        delete activeEntities[players[num].entity.id];
        // remove player from game logic
        players[num] = null;
        needsBroadcast = true;
    });
}

// abstracts the data associated to anything that can appear on screen
function Entity(id, symbol) {
    this.id = id;
    this.symbol = symbol;
    this.position = {"x": -1, "y": -1};
    this.oldPosition = this.position;
}

// holds the map as well as the spawn points
function GameMap(mapArray, spawns) {
    this.mapArray = mapArray;
    this.spawns = spawns;
}

// TODO
// graceful server quit -- disconnect all players and close sockets etc
