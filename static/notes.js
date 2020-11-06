import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {AUDIO, B, BUTTON, DETAILS, DIV, INPUT, LI, P, PRE, SPAN, SUMMARY, VIDEO} = choc;

const block = parseInt(window.location.hash.substr(1), 10); //If NaN, we don't have block info

let current_recording = 0;
function select_recording(which, wrap) {
	current_recording = parseInt(which, 10);
	for (const li of document.getElementById("recordings").children) {
		const sel = parseInt(li.dataset.id, 10) === current_recording;
		li.firstChild.open = sel;
		if (sel) {
			wrap = false;
			const inp = li.querySelector("input")
			if (inp) inp.focus();
		}
	}
	if (wrap) select_recording(1); //Without wrap, so we can't infinitely loop on no recordings
}
function click_recording(ev) {
	ev.preventDefault();
	select_recording(ev.currentTarget.closest("li").dataset.id);
}
document.getElementById("nextbutton").onclick = () => select_recording(current_recording + 1, 1);
document.getElementById("playbutton").onclick = () => {
	const li = document.querySelector(`li[data-id="${current_recording}"]`);
	if (!li) {console.log("Nothing selected, can't play audio."); return;}
	li.querySelector("audio").play();
	li.querySelector("input").focus();
};

function update_summary() {
	set_content(this.closest("details").querySelector("summary b"), this.value);
}

let invert_live = 115, invert_bomb = 40; //Normal values for compet matchmaking; will be overridden by GSI if available.
function update_inversions(el) {
	if (!invert_live) return el;
	const tm = invert_live - el.dataset.time, bomb = invert_bomb - el.dataset.bombtime;
	if (tm < 0) return el; //If a recording happened post-round, don't say "-1:-2"
	const sec = Math.floor(tm) % 60;
	let msg = Math.floor(tm / 60) + (sec < 10 ? ":0" : ":") + sec;
	if (bomb === bomb) { //If el.dataset.bombtime is "null" (or invert_bomb is undefined) then bomb will be NaN
		//Bomb timer is usually less than a minute, so no mm:ss here.
		msg += " - bomb " + Math.floor(bomb) + "s";
	}
	return set_content(el, msg);
}

function render_recording(rec) {
	const times = {className: "inverted", "data-time": rec.time, "data-bombtime": rec.bombtime};
	return LI({"data-id": rec.id, "data-round": rec.round}, DETAILS({onclick: click_recording}, [
		SUMMARY( rec.type === "video" ? [
			"R" + rec.round + " ",
			"Video", //Should this be adorned or formatted in any way? NOT bold, that's for normal transcriptions.
		] : [
			"R" + rec.round + " ",
			B(rec.google),
			rec.spec[0] && ` (${rec.spec[1]}-${rec.spec[0]})`,
			rec.time && update_inversions(SPAN(times, rec.time.toFixed(1) + "s")),
		]),
		rec.type === "video" ?
			VIDEO({controls: true, preload: "auto", src: "/recordings/" + encodeURIComponent(block + rec.filename)})
		: DIV([ //Formatting shim b/c making details display:flex doesn't seem to work.
			rec.time && SPAN([`At ${rec.time.toFixed(1)}s `, update_inversions(B(times))]),
			rec.spec[0] && SPAN(`Spectating ${rec.spec[0]} (${rec.spec[1]})`),
			PRE(rec.sphinx.join("\n") + "\n" + rec.google),
			INPUT({value: rec.google, oninput: update_summary}),
			AUDIO({controls: true, preload: "auto", src: "/recordings/" + encodeURIComponent(block + rec.filename)}),
		]),
	]));
}

let metadata = {};
function update_meta(newmeta) {
	metadata = newmeta;
	if (!metadata.recordings) metadata.recordings = [];
	const ul = document.getElementById("recordings");
	for (let i = ul.children.length; i < metadata.recordings.length; ++i) {
		ul.appendChild(render_recording(metadata.recordings[i]));
		select_recording(metadata.recordings[i].id);
	}
}

function find_next(info) {
	//The round number in CS:GO is zero-based, but is incremented if phase is live.
	//This is correct for recording mode (since notes taken during freeze time are
	//associated with the PREVIOUS round), but for playback, we want to link freeze
	//to the UPCOMING round. So we increment the round number here to match.
	if (info.phase === "freezetime") info.round++;
	//If the next recording is for a future round, mark it as such.
	document.querySelectorAll("li[data-round]").forEach(li => {
		const rd = li.dataset.round - info.round;
		li.querySelector("summary").dataset.future = rd > 0 ? rd + " rd" : "";
	});
	//let msg = info.phase;
	metadata.recordings.forEach(rec => {
		let relation = "unknown";
		if (rec.round < info.round) relation = "past";
		else if (rec.round > info.round) relation = "future";
		else switch (info.phase) {
			case "freezetime": relation = "future"; break;
			case "live": relation = {false:"past", true:"future"}[info.phasetime < rec.time]; break;
			case "bomb": relation = {false:"past", true:"future"}[info.phasetime < rec.bombtime]; break;
			case "over": relation = "past"; break; //sigh... don't really have a good way to handle this
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
	//Update all the times based on the known inversions
	//console.log(info.inversions); //Could potentially have quite a few inversions incl freezetime, warmup, timeout_t/ct
	if (info.inversions.live !== invert_live || info.inversions.bomb !== invert_bomb)
	{
		invert_live = info.inversions.live; invert_bomb = info.inversions.bomb;
		//console.log("Live:", invert_live, "Bomb:", invert_bomb);
		document.querySelectorAll(".inverted").forEach(el => update_inversions(el));
	}
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
