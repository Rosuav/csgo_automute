import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {P, AUDIO} = choc;

//set_content("p", AUDIO({controls: true, src: "/recordings/6/02 - R1 (0::0) spec-2-Gunner.flac"}));
//fetch("/recordings/6/metadata.json").then(r => r.json()).then(r => console.log(r))

const protocol = window.location.protocol == "https:" ? "wss://" : "ws://";
let socket;
function init_socket() {
	socket = new WebSocket(protocol + window.location.host + "/ws");
	socket.onopen = () => {socket.send(JSON.stringify({type: "init", block: 3}));};
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
init_socket();