var socket = io();
var canvas = document.getElementById("canvas");
canvas.width = 800;
canvas.height = 600;
canvas.style.width = canvas.width;
canvas.style.height = canvas.height;
var top_offset = 16;
var context = canvas.getContext("2d");
var fps = 45;
var interval = 1000 / fps;
var needsRepaint = false;

var mapArray, activeEntities;

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

// if receiving a disconnect message from the server, shut down the socket

// draw received map
socket.on('initialdata', function(data) {
    mapArray = data.map.mapArray;
    activeEntities = data.activeEntities;
    needsRepaint = true;
    // start the draw loop (and remove everything above)
    draw();

    // set up keypresses
    window.addEventListener('keydown', handleKeyDown, false);
    window.addEventListener('keyup', handleKeyUp, false);

});

// update game data when receiving server 'update'
socket.on('update', function(updateData) {
    console.log('Received update from server');
    activeEntities = updateData;
    needsRepaint = true;
});

function handleKeyDown(keyEvent) {
    keyEvent.preventDefault();

    // tell the server a direction button was pressed
    if(keyEvent.keyCode == 68 || keyEvent.keyCode == 65 || keyEvent.keyCode == 83 || keyEvent.keyCode == 87)
        socket.emit('key', keyEvent.keyCode);
}

function handleKeyUp(keyEvent) {
    keyEvent.preventDefault();
}

// draw loop
function draw() {
    setTimeout(function() {
        window.requestAnimationFrame(draw);

        if(!needsRepaint) return;

        // clear canvas
        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // draw map
        context.fillStyle = "white";
        context.font = "16px monospace";
        var spc = 16;
        for(var i = 0; i < mapArray.length; i++)
            for(var j = 0; j < mapArray[i].length; j++) {
                context.fillText(mapArray[i][j], i * spc, j * spc + top_offset);
            }

        // draw entities over map
        for(var id in activeEntities)
            if(activeEntities.hasOwnProperty(id)) {
                ent = activeEntities[id];
                context.fillStyle = 'rgba(255, 255, 255, .8)';
                context.fillText(ent.symbol, ent.position.x * spc, ent.position.y * spc + top_offset);
            }
        needsRepaint = false;
    }, interval);
}
