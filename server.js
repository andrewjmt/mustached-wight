
var gameport = 8080;
var verbose = false;
var fps = 60;
var bps = 45; // broadcasts per second
var interval = 1000 / fps;
var broadcastInterval = 1000 / bps;

var mapFile = '/testMap.json';
var max_players = 4;
var players = new Array(max_players);
var activeEntities = {};
var needsBroadcast = false;
var map;

var pjson = require(__dirname + '/package.json');
var prefix = function() { return ':: ' + pjson.name + ' v' + pjson.version + (verbose ? ' | ' + new Date().toString() : '') + ' :: '};
var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var uuid = require('node-uuid');

app.use(express.static('static'));
// if receiving a disconnect message from the server, shut down the socket
global.window = global.document = global;

// window.requestAnimationFrame polyfill: http://creativejs.com/resources/requestanimationframe/
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

console.log(prefix() + 'Setting up game...');
fs.readFile(__dirname + mapFile, function(err, data) {
    if(err) throw err;
    var jsonData = JSON.parse(data);
    map = new GameMap(jsonData.map.split('\\n').map(function(e) {
        return e.split('');
    }), jsonData.spawns);
    console.log(prefix() + 'Map ' + mapFile + ' loaded.');
    mainGameLoop();
    console.log(prefix() + 'Starting server...');
    server.listen(gameport);
    console.log(prefix() + 'Server listening on port ' + gameport + '.');
    sendUpdates();
    console.log(prefix() + 'Started game and broadcast loops.');
});

function mainGameLoop() {
    setTimeout(function() {
        window.requestAnimationFrame(mainGameLoop);

        // do updates here
    }, interval);
}

function sendUpdates() {
    setTimeout(function() {
        window.requestAnimationFrame(sendUpdates);

        // do updates here
        if(!needsBroadcast) return;
        for(var i = 0; i < max_players; i++) {
            if(players[i] == null) continue;
            players[i].socket.emit('update', activeEntities);
        }
        needsBroadcast = false;
    }, broadcastInterval);
}

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/static/index.html');
});

io.on('connection', function (socket) {
    // search for open spots
    var i = -1;
    for(i = 0; i < max_players; i++) {
        if(players[i] == null) break;
    }
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
        socket.on('key', function(keyData) {
            var px = players[i].entity.position.x;
            var py = players[i].entity.position.y;
            switch(keyData) {
                case 68:  // d
                    if(isOccupiable(px + 1, py))
                        players[i].entity.position.x += 1;
                    break;
                case 65: // a
                    if(isOccupiable(px - 1, py))
                        players[i].entity.position.x -= 1;
                    break;
                case 83: // s
                    if(isOccupiable(px, py + 1))
                        players[i].entity.position.y += 1;
                    break;
                case 87: // w
                    if(isOccupiable(px, py - 1))
                        players[i].entity.position.y -= 1;
                    break;
            }
            needsBroadcast = true;
        });
        // make sure everyone gets the update
        needsBroadcast = true;
    } else {
        socket.emit('log', {message: 'There are already 4 players online!'});
        socket.disconnect();
        console.log(prefix() + 'Connection received, but the game is full. Socket disconnected.');
    }
});

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

function Player(socket, num, entity) {
    this.socket = socket;
    this.id = socket.id;
    this.num = num;
    this.entity = entity;
    console.log(prefix() + 'Player ' + this.id + ' connected. Assigned player number ' + this.num + '.');
    console.log(prefix() + 'Player ' + this.num + ' spawns at (' + this.entity.position.x + ', ' + this.entity.position.y + ').');
    socket.emit('log', {message: 'Connected as Player ' + this.num + ' with id ' + this.id + '.'});
    socket.on('disconnect', function() {
        console.log(prefix() + 'Player ' + num + ', id ' + this.id + ', disconnected.');
        // remove the player's game entity
        delete activeEntities[players[num].entity.id];
        // remove player from game logic
        players[num] = null;
        needsBroadcast = true;
    });
}

function Entity(id, symbol) {
    this.id = id;
    this.symbol = symbol;
    this.position = {"x": -1, "y": -1};
    this.oldPosition = this.position;
}

function GameMap(mapArray, spawns) {
    this.mapArray = mapArray;
    this.spawns = spawns;
}

// TODO
// graceful server quit -- disconnect all players and close sockets etc
