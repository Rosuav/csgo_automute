//TODO: Have some hotkeys:
//1) Local to Chrome: Toggle mute of this tab (even if not muted by this extn)
//2) Local to Chrome: Flag this tab to not be muted for the next 30 secs
//3) Global: Mute everything ==> alltabs(mute)
//4) Global: Unmute everything, ditto
console.log("Chrome:", chrome);

//Map tab IDs to the time when they may again be automuted
const nomute = {};
//Map tab IDs to true if they were automuted, false if not
//If absent from this mapping, assume false. Note that any
//muting done outside of this extension should also imply
//'false' here, but must be checked for separately.
const automuted = {};
function automute(tab)
{
	if (tab.audible && !tab.mutedInfo.muted && +new Date >= (nomute[tab.id]||0))
	{
		console.log("Noisy tab:", tab);
		automuted[tab.id] = true;
		chrome.tabs.update(tab.id, {"muted": true});
	}
}
function autounmute(tab)
{
	if (tab.mutedInfo.muted &&
		tab.mutedInfo.reason === "extension" &&
		tab.mutedInfo.extensionId === chrome.runtime.id &&
		automuted[tab.id])
	{
		console.log("Muted tab:", tab);
		chrome.tabs.update(tab.id, {"muted": false});
	}
}
function togglemute(tab)
{
	automuted[tab.id] = false;
	chrome.tabs.update(tab.id, {"muted": !tab.mutedInfo.muted});
}
function keep(tab)
{
	automuted[tab.id] = false;
	chrome.tabs.update(tab.id, {"muted": false}); //Force it to be unmuted
	nomute[tab.id] = 30000 + +new Date; //30,000 ms or 30 seconds
}
const alltabs = f => chrome.tabs.query({}, tabs => tabs.forEach(f));
const curtab = f => chrome.tabs.query({active: true, currentWindow: true}, tabs => tabs[0] && f(tabs[0]));

const commands = {
	"mute-tab": () => curtab(togglemute),
	"keep-tab": () => curtab(keep),
	"mute-now": () => alltabs(automute),
	"unmute-now": () => alltabs(autounmute), //TODO: Maintain a separate record of what got mute-now'd
	"...": cmd => console.log("Command", cmd, "fired"),
};
chrome.commands.onCommand.addListener(cmd => (commands[cmd] || commands["..."])(cmd));
chrome.commands.onCommand.addListener(cmd => console.log(cmd, "happened"));

//Connect to a web socket on localhost
//Adjust this if you put the server onto a different port
let socket = null;
function setup_socket() {
	socket = new WebSocket("ws://localhost:27013/ws");
	socket.onopen = () => console.log("Socket connection established.");
	socket.onmessage = ev => {
		const msg = JSON.parse(ev.data);
		console.log("WS:", msg);
		if (msg && msg.type === "quiet") alltabs(msg.data ? automute : autounmute);
	};
	socket.onclose = () => {socket = null; setTimeout(setup_socket, 5000);};
}
setup_socket();

function socksend(type, data) {
	if (socket) socket.send(JSON.stringify({type, data}));
}
