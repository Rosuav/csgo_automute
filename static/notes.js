import choc, {set_content} from "https://rosuav.github.io/shed/chocfactory.js";
const {P} = choc;

const protocol = window.location.protocol == "https:" ? "wss://" : "ws://";
let socket;
function init_socket() {
	socket = new WebSocket(protocol + window.location.host + "/wsnotes");
	socket.onopen = () => {socket.send(JSON.stringify({type: "init", block: 3}));};
	socket.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		switch (msg.type) {
			case "hello": console.log("Hello, world"); break;
		}
	};
	//Automatically reconnect (after a one-second delay to prevent spinning)
	socket.onclose = ev => setTimeout(init_socket, 1000);
}
init_socket();