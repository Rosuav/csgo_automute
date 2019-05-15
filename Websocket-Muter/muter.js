console.log("Chrome:", chrome);
function mute(tab)
{
	if (tab.audible && !tab.mutedInfo.muted)
	{
		console.log("Noisy tab:", tab);
		chrome.tabs.update(tab.id, {"muted": true});
	}
}
function unmute(tab)
{
	if (tab.mutedInfo.muted &&
		tab.mutedInfo.reason === "extension" &&
		tab.mutedInfo.extensionId === chrome.runtime.id)
	{
		console.log("Muted tab:", tab);
		chrome.tabs.update(tab.id, {"muted": false});
	}
}
function manage(f)
{
	chrome.tabs.query({}, tabs => tabs.forEach(f));
}

//Connect to a web socket on localhost
//Adjust this if you put the server onto a different port
let socket = null;
function setup_socket() {
	socket = new WebSocket("ws://localhost:27013/ws");
	socket.onopen = () => console.log("Socket connection established.");
	socket.onmessage = ev => {
		const msg = JSON.parse(ev.data);
		if (msg && msg.type === "quiet") manage(msg.data ? mute : unmute);
	};
	socket.onclose = () => {socket = null; setTimeout(setup_socket, 5000);};
}
setup_socket();

function socksend(type, data) {
	if (socket) socket.send(JSON.stringify({type, data}));
}
