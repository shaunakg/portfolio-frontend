const format = Intl.NumberFormat().format;

const noc = (document.getElementById("number-of-cursors") || {});
const br_message = (document.getElementById("br-message") || {});
const ping = (document.getElementById("ping") || {});
const recieved_count = (document.getElementById("recieved-count") || {});

function roundTo(n, digits) {
    if (digits === undefined) {
        digits = 0;
    }

    var multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    return Math.round(n) / multiplicator;
}

function isTouchDevice() {
    return (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
    );
}

let drawing_colors = {
    lighter: "#D3D3D3", // shown on mouse movement
    darker: "#808080", // shown on click-and-drag
};

if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
) {
    // dark mode
    document.body.classList.add("dark");
    drawing_colors = {
        lighter: "#007a7a",
        darker: "#EEEBD0",
    };
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let mouseDown = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Causes issues on mobile devices where the window can be resized very quickly
// window.onresize = () => {
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;
// }

const endpoint = "wss://portfolio-backend.io.srg.id.au/ws";
let socket;

if (!localStorage.getItem("no-interaction")) {
    socket = new WebSocket(endpoint);
} else {
    socket = {};
    br_message.innerHTML =
        "Interactivity disabled. <a href='#' onclick='localStorage.removeItem(`no-interaction`);location.reload()'>Re-enable?</a>";
    document.getElementById("canvas-overlay").remove();
}

socket.onerror = function (error) {
    console.error(error);
    br_message.innerHTML =
        "Websocket failed to connect. <a href='/'>Retry?</a>";
};

socket.onclose = function (event) {
    console.log("WebSocket closed");
    br_message.innerHTML =
        "Websocket connection closed. <a href='/'>Re-open?</a>";
};

// Send a message over the socket every n events
// Prevents the browser from sending too many messages and causing
// the server to lag. There is a transition on the cursor element that
// "smoothly" moves the cursor to the new position.
//
// Decreasing this number will make the transition smoother, but will
// also increase the amount of messages sent to the server.
const sendEvery = {
    draw: 1, // When click-and-dragging, send every event
    move: 2, // When moving the mouse, send every other event. Reduces load, but might make lines more "blocky"
};

// Unique identifier for the user
// Changes every time the user refreshes the page
const clientId = "client-" + btoa(Math.random() * 1e5).replace(/=/g, "");

// Keep track of the number of clients and sent events.
let events = 0;
let registeredClients = {};
// let myPreviousPosition;

let totalMessagesReceived = 0;

const people = () => Object.keys(registeredClients).length;

document.body.onmousemove = (e) => {
    events++;

    let x = e.clientX / window.innerWidth;
    let y = e.clientY / window.innerHeight;

    if (
        socket.readyState === 1 &&
        events % sendEvery[mouseDown ? "draw" : "move"] === 0
    ) {
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
                t: Date.now(),
            })
        );
    }
};

socket.onmessage = ({ data }) => {
    totalMessagesReceived++;
    recieved_count.innerText = format(
        totalMessagesReceived
    );

    try {
        data = JSON.parse(data);
    } catch (e) {
        data = JSON.parse(data.split("\n")[0]);
    }

    let txtime = Date.now() - data.t;

    if (txtime > 500) {
        if (data.cid === clientId) {
            console.debug(
                `[WARN] Round-trip packet from self->server->self took ${txtime}ms (may indicate network latency).`
            );
        } else {
            console.debug(
                `[WARN] Packet from ${data.cid} took ${txtime}ms to arrive. (Severe UX impact)`
            );
        }
    } else if (txtime > 100) {
        if (data.cid === clientId) {
            console.debug(
                `[WARN] Round-trip packet from self->server->self took ${txtime}ms (severe network latency).`
            );
        } else {
            console.debug(
                `[WARN] Packet from ${data.cid} took ${txtime}ms to arrive. (>100ms for delayed response)`
            );
        }
    }

    ping.innerText = format(txtime);

    if (!(data.cid in registeredClients)) {
        registeredClients[data.cid] = {};

        const cursor = document.createElement("img");
        cursor.src = "/cursor.png";
        cursor.classList.add("cursor");
        cursor.id = data.cid;

        document.getElementById("cursors-overlay").appendChild(cursor);
    }

    noc.innerText =
        people() + " " + (people() === 1 ? "person" : "people");

    const cursor = document.getElementById(data.cid);
    cursor.style.left = data.x * window.innerWidth + "px";
    cursor.style.top = data.y * window.innerHeight + "px";

    if (data.cid === clientId) {
        cursor.style.display = "none";
    }

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

    noc.innerText =
        people() + " " + (people() === 1 ? "person" : "people");
}, 500);

localStorage.getItem("no-interaction") && clearInterval(removeInactiveClients);

// If control + c is pressed, clear the canvas and disconnect from the server
document.body.onkeydown = (e) => {
    console.log(e);
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
};

document.querySelectorAll("a").forEach((e) => {
    if (e.href && e.href != "#") {
        e.outerHTML = `${e.outerHTML}<span class="location"> (${e.href})</span>`;
    }
});

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, "-") // Replace spaces with -
        .replace(/[^\w\-]+/g, "") // Remove all non-word chars
        .replace(/\-\-+/g, "-") // Replace multiple - with single -
        .replace(/^-+/, "") // Trim - from start of text
        .replace(/-+$/, ""); // Trim - from end of text
}

if (document.getElementById("toc")) {
    document.getElementById("toc").style.paddingInlineStart = "16px";
    document.getElementById("toc").style.fontSize = "0.9em";

    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((x, i) => {

        x.id = x.id || slugify(x.innerText);
        let title = x.innerText;
        let link = "#" + x.id;

        let li = document.createElement("li");
        li.innerText = title;

        let a = document.createElement("a");
        a.innerText = " #";
        a.href = link;
        a.style.textDecoration = "none";

        li.appendChild(a.cloneNode(true));
        x.appendChild(a.cloneNode(true));

        document.getElementById("toc").appendChild(li);

        li.style.margin = "0 0";
        li.style.marginLeft = ((parseInt(x.tagName[1]) - 1) * 15).toString() + "px";
    });
}