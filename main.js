
const format = Intl.NumberFormat().format;

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
let socket;

if (!localStorage.getItem("no-interaction")) {
    socket = new WebSocket(endpoint);
} else {
    document.getElementById("br-message").innerHTML =
        "Interactivity disabled. <a href='/' onclick='localStorage.clearItem(`no-interactivity`);'>Re-enable?</a>";
    document.getElementById("canvas-overlay").remove();
}

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

let totalMessagesReceived = 0;

const people = () => Object.keys(registeredClients).length + 1;

document.body.onmousemove = (e) => {
    events++;

    let x = e.clientX / window.innerWidth;
    let y = e.clientY / window.innerHeight;

    if (socket.readyState === 1 && events % sendEvery === 0) {
        socket.send(
            JSON.stringify({
                x: x,
                y: y,
                cid: clientId,
                type: "mousemove",
                md: mouseDown,
                t: Date.now(),
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
                cid: clientId,
                type: "mousedown",
                md: mouseDown,
                t: Date.now(),
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
                cid: clientId,
                type: "mouseup",
                md: mouseDown,
                t: Date.now()
            })
        );
    }
};

socket.onmessage = ({ data }) => {

    totalMessagesReceived++;
    document.getElementById("recieved-count").innerText = format(totalMessagesReceived);

    try {
        data = JSON.parse(data);
    } catch (e) {
        data = JSON.parse(data.split("\n")[0]);
    }

    console.log(Date.now(), data.t)
    document.getElementById("ping").innerText = format(Date.now() - data.t);

    if (data.cid === clientId) {
        return;
    }

    if (!(data.cid in registeredClients)) {
        registeredClients[data.cid] = {};

        const cursor = document.createElement("img");
        cursor.src = "/cursor.png";
        cursor.classList.add("cursor");
        cursor.id = data.cid;

        document.getElementById("cursors-overlay").appendChild(cursor);
    }

    document.getElementById("number-of-cursors").innerText =
        people() +
        " " +
        (people() === 1 ? "person" : "people");

    const cursor = document.getElementById(data.cid);
    cursor.style.left = data.x * window.innerWidth + "px";
    cursor.style.top = data.y * window.innerHeight + "px";

    // Draw a line from the previous position to the new position
    // ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.beginPath();
    ctx.strokeStyle = data.md ? drawing_colors.darker : drawing_colors.lighter;
    ctx.moveTo(
        (registeredClients[data.cid]?.lastPosition?.x || data.x) *
            window.innerWidth,
        (registeredClients[data.cid]?.lastPosition?.y || data.y) *
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

    registeredClients[data.cid].time = Date.now();
    registeredClients[data.cid].lastPosition = {
        x: data.x,
        y: data.y,
    };
};

const removeInactiveClients = setInterval(() => {
    for (let clientId in registeredClients) {
        if (Date.now() - registeredClients[clientId].time > 5000) {
            document.getElementById(clientId).remove();
            delete registeredClients[clientId];
        }
    }

    document.getElementById("number-of-cursors").innerText =
        people() +
        " " +
        (people() === 1 ? "person" : "people");
}, 500);

localStorage.getItem("no-interaction") && clearInterval(removeInactiveClients);

// If control + c is pressed, clear the canvas and disconnect from the server
document.body.onkeydown = (e) => {
    console.log(e)
    if (e.shiftKey && e.key == "Escape") {
        if (document.getElementById("canvas-overlay")) {
            socket.close();
            document.getElementById("canvas-overlay").remove();
            clearInterval(removeInactiveClients);
        } else {
            localStorage.setItem("no-interaction", true);
        }
        e.preventDefault();
    }
}

document.querySelectorAll("a").forEach(e => {

    if (e.href && e.href != "#") {

        e.outerHTML = `${e.outerHTML}<span class="location"> (${e.href})</span>`;

    }

})