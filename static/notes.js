import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {AUDIO, B, BUTTON, DETAILS, DIV, INPUT, LI, P, PRE, SUMMARY} = choc;

const block = parseInt(window.location.hash.substr(1), 10); //If NaN, we don't have block info

let current_recording = 0;
function select_recording(which) {
	current_recording = parseInt(which, 10);
	for (const li of document.getElementById("recordings").children) {
		const sel = parseInt(li.dataset.id, 10) === current_recording;
		li.firstChild.open = sel;
		if (sel) li.querySelector("input").focus();
	}
}
function click_recording(ev) {
	ev.preventDefault();
	select_recording(ev.currentTarget.closest("li").dataset.id);
}
document.getElementById("nextbutton").onclick = () => select_recording(current_recording + 1);
document.getElementById("playbutton").onclick = () => {
	const li = document.querySelector(`li[data-id="${current_recording}"]`);
	if (!li) {console.log("Nothing selected, can't play audio."); return;}
	li.querySelector("audio").play();
	li.querySelector("input").focus();
};

function render_recording(rec) {
	return LI({"data-id": rec.id}, DETAILS({onclick: click_recording}, [
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
			case "metadata": update_meta(msg.metadata); break;
			//On GSI position signal (round and time-within-round):
			//Locate the first recording that is in the current round,
			//and is after the current time. If that is ahead of the
			//currently selected recording, advance to it.
			case "position": console.log("Position:", msg); break;
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
