import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {AUDIO, B, BUTTON, DETAILS, DIV, INPUT, LI, P, PRE, SPAN, SUMMARY} = choc;

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

function update_summary() {
	set_content(this.closest("details").querySelector("summary b"), this.value);
}

function render_recording(rec) {
	return LI({"data-id": rec.id}, DETAILS({onclick: click_recording}, [
		SUMMARY([B(rec.google), " " + rec.desc]),
		DIV([ //Formatting shim b/c making details display:flex doesn't seem to work.
			rec.time && SPAN(`At ${rec.time.toFixed(1)}s`),
			rec.spec[0] && SPAN(`Spectating ${rec.spec[0]} (${rec.spec[1]})`),
			PRE(rec.sphinx.join("\n") + "\n" + rec.google),
			INPUT({value: rec.google, oninput: update_summary}),
			AUDIO({controls: true, src: `/recordings/${block}${rec.filename}`}),
		]),
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

function find_next(info) {
	//let msg = info.phase;
	metadata.recordings.forEach(rec => {
		let relation = "unknown";
		if (rec.round < info.round) relation = "past";
		else if (rec.round > info.round) relation = "future";
		else switch (info.phase) {
			case "freezetime": relation = "future"; break;
			case "live": relation = {false:"past", true:"future"}[info.phasetime < rec.time]; break;
			case "bomb": relation = {false:"past", true:"future"}[info.phasetime < rec.bombtime]; break;
			default: relation = "unknown_within_round";
		}
		//msg += " " + rec.id + " " + relation;
		//Okay, so.... we can't be certain. But let's do what we can.
		const cur = metadata.recordings.find(r => r.id === current_recording);
		//If the currently-selected one isn't for the current round (or there's
		//none selected), and there is a recording for the current round, select
		//it. (Since we work sequentially, it'll pick the first.)
		if (rec.round === info.round && (!cur || cur.round !== info.round))
			select_recording(rec.id);
		//If we're definitely past this point, pick the next one.
		if (rec.id === current_recording && relation === "past")
			select_recording(current_recording + 1);
		//Otherwise, leave the current one selected.
	});
	//console.log(msg);
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
			case "position": find_next(msg); break;
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
