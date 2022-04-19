
function roundTo(n, digits) {
    if (digits === undefined) {
        digits = 0;
    }

    var multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    return Math.round(n) / multiplicator;
}

function isTouchDevice() {
    return (('ontouchstart' in window) ||
       (navigator.maxTouchPoints > 0) ||
       (navigator.msMaxTouchPoints > 0));
}  

let drawing_colors = {
    lighter: "#D3D3D3",
    darker: "#808080"
}

if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // dark mode
    document.body.classList.add("dark");
    drawing_colors = {
        lighter: "#007a7a", //C0E8F9
        darker: "#EEEBD0"
    }
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let mouseDown = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

const endpoint = "wss://portfolio-backend.io.srg.id.au/ws";
const socket = new WebSocket(endpoint);

socket.onerror = function (error) {
    console.error(error);
    document.getElementById("br-message").innerHTML =
        "Websocket failed to connect. <a href='/'>Retry?</a>";
};

socket.onclose = function (event) {
    console.log("WebSocket closed");
    document.getElementById("br-message").innerHTML =
        "Websocket connection closed. <a href='/'>Re-open?</a>";
};

// Send a message over the socket every n events
// Prevents the browser from sending too many messages and causing
// the server to lag. There is a transition on the cursor element that
// "smoothly" moves the cursor to the new position.
//
// Decreasing this number will make the transition smoother, but will
// also increase the amount of messages sent to the server.
const sendEvery = 1;

// Unique identifier for the user
// Changes every time the user refreshes the page
const clientId = "client-" + btoa(Math.random() * 1e5).replace(/=/g, "");

// Keep track of the number of clients and sent events.
let events = 0;
let registeredClients = {};
let myPreviousPosition;

let acl = new Accelerometer({frequency: 60});
acl.addEventListener('reading', () => {
  console.log("Acceleration along the X-axis " + acl.x);
  console.log("Acceleration along the Y-axis " + acl.y);
  console.log("Acceleration along the Z-axis " + acl.z);
});

acl.start();

document.body.onmousemove = (e) => {
    events++;

    let x = e.clientX / window.innerWidth;
    let y = e.clientY / window.innerHeight;

    if (socket.readyState === 1 && events % sendEvery === 0) {
        socket.send(
            JSON.stringify({
                x, y,
                clientId: clientId,
                type: "mousemove",
                mouseDown: mouseDown,
            })
        );
    }

    // Draw a line from the previous position to the new position
    // ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.beginPath();
    ctx.strokeStyle = mouseDown ? drawing_colors.darker : drawing_colors.lighter;
    ctx.moveTo(
        (myPreviousPosition?.x || x) *
            window.innerWidth,
        (myPreviousPosition?.y || y) *
            window.innerHeight
    );
    ctx.lineTo(x * window.innerWidth, y * window.innerHeight);
    ctx.stroke();

    myPreviousPosition = {x, y};
};

document.body.onmousedown = (e) => {
    mouseDown = true;

    let x = e.clientX / window.innerWidth;
    let y = e.clientY / window.innerHeight;

    if (socket.readyState === 1) {
        socket.send(
            JSON.stringify({
                x: x,
                y: y,
                clientId: clientId,
                type: "mousedown",
                mouseDown: mouseDown,
            })
        );
    }
};

document.body.onmouseup = (e) => {
    mouseDown = false;

    let x = e.clientX / window.innerWidth;
    let y = e.clientY / window.innerHeight;

    if (socket.readyState === 1) {
        socket.send(
            JSON.stringify({
                x: x,
                y: y,
                clientId: clientId,
                type: "mouseup",
                mouseDown: mouseDown,
            })
        );
    }
};

socket.onmessage = ({ data }) => {
    try {
        data = JSON.parse(data);
    } catch (e) {
        data = JSON.parse(data.split("\n")[0]);
    }

    if (data.clientId === clientId) {
        return;
    }

    if (!(data.clientId in registeredClients)) {
        registeredClients[data.clientId] = {};

        const cursor = document.createElement("img");
        cursor.src = "/cursor.png";
        cursor.classList.add("cursor");
        cursor.id = data.clientId;

        document.getElementById("cursors-overlay").appendChild(cursor);
    }

    document.getElementById("number-of-cursors").innerText =
        Object.keys(registeredClients).length +
        " " +
        (Object.keys(registeredClients).length === 1 ? "person" : "people");

    const cursor = document.getElementById(data.clientId);
    cursor.style.left = data.x * window.innerWidth + "px";
    cursor.style.top = data.y * window.innerHeight + "px";

    // Draw a line from the previous position to the new position
    // ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.beginPath();
    ctx.strokeStyle = data.mouseDown ? drawing_colors.darker : drawing_colors.lighter;
    ctx.moveTo(
        (registeredClients[data.clientId]?.lastPosition?.x || data.x) *
            window.innerWidth,
        (registeredClients[data.clientId]?.lastPosition?.y || data.y) *
            window.innerHeight
    );
    ctx.lineTo(data.x * window.innerWidth, data.y * window.innerHeight);
    ctx.stroke();

    switch (data.type) {
        case "mousemove":
            cursor.classList.add("move");
            break;
        case "mousedown":
            cursor.classList.add("down");
            break;
        case "mouseup":
            cursor.classList.remove("down");
            break;
    }

    registeredClients[data.clientId].time = Date.now();
    registeredClients[data.clientId].lastPosition = {
        x: data.x,
        y: data.y,
    };
};

setInterval(() => {
    for (let clientId in registeredClients) {
        if (Date.now() - registeredClients[clientId].time > 5000) {
            document.getElementById(clientId).remove();
            delete registeredClients[clientId];
        }
    }

    document.getElementById("number-of-cursors").innerText =
        Object.keys(registeredClients).length +
        " " +
        (Object.keys(registeredClients).length === 1 ? "person" : "people");
}, 500);
