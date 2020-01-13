import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {AUDIO, B, DETAILS, DIV, INPUT, LI, P, PRE, SUMMARY} = choc;

const block = parseInt(window.location.hash.substr(1), 10); //If NaN, we don't have block info

function render_recording(rec) {
	return LI(DETAILS([
		SUMMARY([B(rec.google), " " + rec.desc]),
		rec.time && P(`At ${rec.time.toFixed(1)}s`),
		rec.spec[0] && P(`Spectating ${rec.spec[0]} (${rec.spec[1]})`),
		PRE(rec.sphinx.join("\n") + "\n" + rec.google),
		DIV(INPUT({value: rec.google})),
		DIV(AUDIO({controls: true, src: `/recordings/${block}${rec.filename}`})),
	]));
}

let metadata = {};
function update_meta(newmeta) {
	metadata = newmeta;
	if (!metadata.recordings) metadata.recordings = [];
	const ul = document.getElementById("recordings");
	if (ul.children.length === metadata.recordings.length) return;
	for (let i = ul.children.length; i < metadata.recordings.length; ++i)
		ul.appendChild(render_recording(metadata.recordings[i]));
}

const protocol = window.location.protocol == "https:" ? "wss://" : "ws://";
let socket;
function init_socket() {
	socket = new WebSocket(protocol + window.location.host + "/ws");
	socket.onopen = () => {socket.send(JSON.stringify({type: "init", block}));};
	socket.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		switch (msg.type) {
			case "quiet": break //Ignore the mute/unmute signals
			case "inited": console.log("Connected."); break;
			case "hello": console.log("Hello, world"); break;
		}
	};
	//Automatically reconnect (after a one-second delay to prevent spinning)
	socket.onclose = ev => setTimeout(init_socket, 1000);
}
if (block) {
	init_socket();
	fetch("/recordings/" + block + "/metadata.json").then(r => r.json()).then(r => update_meta(r));
} else {
	set_content("#recordings", LI("No recordings. Refresh to show info."));
}
