import os
import re
import sys
import json
import socket
import asyncio
import hashlib
from aiohttp import web, WSMsgType, WSCloseCode

QUIET_PHASES = {"warmup", "live", "gameover", "intermission"} # Could be a frozenset but there's no literal for it

app = web.Application()
route = web.RouteTableDef()
runner = web.AppRunner(app)
clients = []
quiet = False

async def broadcast(msg, origin=None):
	"""Broadcast a message to all clients, except its origin (if applicable)"""
	for client in clients:
		if client is not origin:
			await client.send_json(msg)

@route.get("/")
async def home(req):
	return web.Response(text="TODO: Have mute and unmute buttons, maybe tick boxes to control which things are managed")

@route.get("/ws")
async def websocket(req):
	ws = web.WebSocketResponse()
	await ws.prepare(req)
	clients.append(ws)

	await ws.send_json({"type": "quiet", "data": quiet})
	async for msg in ws:
		# Ignore non-JSON messages
		if msg.type != WSMsgType.TEXT: continue
		try: msg = json.loads(msg.data)
		except ValueError: continue
		print("MESSAGE", msg)
		# Currently no incoming messages have meaning

	clients.remove(ws)
	await ws.close()
	return ws

def lookup(data, arg):
	for piece in arg.split(":"):
		data = data.get(piece)
		if data is None: return "##"
	return data

import time
last_stats_time = None
def show_stats(data, fmt, *args):
	global last_stats_time
	t = time.time()
	if last_stats_time is None: tm = 0.0
	else: tm = t - last_stats_time
	last_stats_time = t
	print("%.1f" % tm, fmt % tuple(lookup(data, arg) for arg in args))

''' If phase is 'over' or 'freezetime', most likely any comments relate to the PREVIOUS round.
But the round number starts from zero, so in human terms, it's actually necessary to *add* one
to the round number whenever the phase is 'live'.

R0 live (0::0) - 2+0 for 0 - 4 points - {'phase': 'live'}
R0 live (0::0) - 2+0 for 0 - 4 points - {'phase': 'live'}
R0 live (0::0) - 2+0 for 0 - 4 points - {'phase': 'live'}
R1 live (0::0) - 3+0 for 0 - 6 points - {'phase': 'over', 'win_team': 'CT'}
R1 live (1::0) - 3+0 for 0 - 6 points - {'phase': 'over', 'win_team': 'CT'}
R1 live (1::0) - 3+0 for 0 - 6 points - {'phase': 'over', 'win_team': 'CT'}
R1 live (1::0) - 3+0 for 0 - 6 points - {'phase': 'freezetime'}
R1 live (1::0) - 3+0 for 0 - 6 points - {'phase': 'freezetime'}

TODO: Notetaker.
* Unrelated to CS:GO, a program that, when run, listens to the microphone and transcribes.
  - If given args, it can incorporate those into the file name.
  - Must be able to be run multiple times with the same args and store multiple
  - Must be able to create multiple "blocks" of notes, independently ordered
* Triggered within the CS:GO ecosystem, a way to take notes on the current round.
  - See above re round numbers
  - If warmup, report round zero
  - If spectating, say who's being spec'd, just in case
* It's not possible while playing to get the current round timers, I believe. It IS,
  however, possible to notice the round number change (and freeze time end), and record
  the time. For the purposes of note-taking, a few seconds here or there doesn't matter.
* After notes have been taken, the text form should be shown in some visible way. This
  is probably best just done by writing to a file, and then tailing that file - would
  play nicely with CroppedTerm for the stream.

Would be REALLY cool if it could also record any typed text for those few seconds. During
freeze time, I would have to be aware of hitting G but most other keys would be safe.
'''

@route.post("/gsi")
async def update_configs(req):
	data = await req.json()
	if "previously" in data: del data["previously"] # These two are always uninteresting.
	if "added" in data: del data["added"]
	# from pprint import pprint; pprint(data)
	if 0: show_stats(data, "R%s (%s::%s) - %s/%s",
		"map:round", "map:team_ct:score", "map:team_t:score",
		"map:phase", "round:phase",
	)
	phase = data.get("map", {}).get("phase")
	new_quiet = phase in QUIET_PHASES
	if "allplayers" in data and data.get("map", {}).get("mode") == "competitive":
		# In competitive mode, if we're able to see every player's info,
		# we must be spectating - possibly watching a replay - and so the
		# normal muting rules don't apply.
		new_quiet = False
	global quiet
	if new_quiet != quiet:
		quiet = new_quiet
		if quiet: print("Muting - phase is", phase)
		else: print("Unmuting - phase is", phase)
		await broadcast({"type": "quiet", "data": quiet})
	return web.Response(text="") # Response doesn't matter

app.router.add_routes(route) # Has to be _after_ all the routes are created
async def on_shutdown(app):
	for client in clients:
		await client.close(code=WSCloseCode.GOING_AWAY, message="Server shutting down")
app.on_shutdown.append(on_shutdown)

async def serve_http(loop, port, sock=None):
	await runner.setup()
	if sock:
		await web.SockSite(runner, sock).start()
		print("Listening on", sock)
	else:
		await web.TCPSite(runner, "0.0.0.0", port).start()
		print("Listening on port", port)

class ByteClient:
	def __init__(self, writer):
		self.writer = writer
	async def send_json(self, msg): # A bit hacky but whatever
		self.writer.write(b"1" if msg["data"] else b"0")
		await self.writer.drain()
	async def close(self, *a, **kw): self.writer.close()
async def byteclient(reader, writer):
	peer = writer.transport.get_extra_info("peername")[:2]
	print("Received connection from %s:%s" % peer)
	writer.write(b"1" if quiet else b"0")
	await writer.drain()
	cli = ByteClient(writer)
	clients.append(cli)
	while True:
		data = await reader.read(256)
		if not data: break
		# No backflow info as yet
	clients.remove(cli)
	writer.close()
	print("Disconnected from %s:%s" % peer)

async def listen(port):
	mainsock = await asyncio.start_server(byteclient, port=port)
	print("Listening:", ", ".join("%s:%s" % s.getsockname()[:2] for s in mainsock.sockets))
	await mainsock.serve_forever()

def run(*, httpport=27013, byteport=27012, sock=None):
	loop = asyncio.get_event_loop()
	loop.run_until_complete(serve_http(loop, httpport, sock))
	# asyncio.ensure_future(listen(byteport)) # Disabled for testing
	# TODO: Announce that we're "ready" in whatever way
	try: loop.run_forever()
	except KeyboardInterrupt: pass
	print("Done running")
	loop.run_until_complete(runner.cleanup())

if __name__ == '__main__':
	# Look for a socket provided by systemd
	sock = None
	try:
		pid = int(os.environ.get("LISTEN_PID", ""))
		fd_count = int(os.environ.get("LISTEN_FDS", ""))
	except ValueError:
		pid = fd_count = 0
	if pid == os.getpid() and fd_count >= 1:
		# The PID matches - we've been given at least one socket.
		# The sd_listen_fds docs say that they should start at FD 3.
		sock = socket.socket(fileno=3)
		print("Got %d socket(s)" % fd_count, file=sys.stderr)
		# TODO: Handle two sockets and two port numbers
	run(httpport=int(os.environ.get("PORT", "27013")), sock=sock)
