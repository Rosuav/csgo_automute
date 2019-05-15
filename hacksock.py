# Simple socket server to test the VLC client
import socket

main = socket.socket()
main.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
main.bind(("0.0.0.0", 27012))
print("Listening.")
main.listen()
quiet = False
while True:
	sock, addr = main.accept()
	print("Got connection", addr)
	sock.send(b"1" if quiet else b"0")
	while True:
		cmd = input("Hit Enter to toggle, or dc to kick client: ")
		if cmd == "dc": break
		quiet = not quiet
		sock.send(b"1" if quiet else b"0")
	print("Disconnected.")
	sock.close()
