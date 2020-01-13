import os
import re
import sys
import json
import time
import socket
import asyncio
import hashlib
from aiohttp import web, WSMsgType, WSCloseCode

QUIET_PHASES = {"warmup", "live", "gameover", "intermission"} # Could be a frozenset but there's no literal for it

app = web.Application()
route = web.RouteTableDef()
route.static("/static", "static")
route.static("/recordings", "../tmp/notes")
runner = web.AppRunner(app)
clients = []
quiet = False

async def broadcast(msg, *, origin=None, block=None):
	"""Broadcast a message to all/some clients

	Will not send to the message's origin (if applicable),
	and can restrict to only those clients using a particular
	block of notes. If block is int, will send to all clients
	that have an integer block set.
	"""
	for client in clients:
		if client is origin: continue
		if block is int and not client.notes_block: continue
		elif block is not None and client.notes_block != block: continue
		await client.send_json(msg)

@route.get("/")
async def home(req):
	return web.Response(text="TODO: Have mute and unmute buttons, maybe tick boxes to control which things are managed")

@route.get("/ws")
async def websocket(req):
	ws = web.WebSocketResponse()
	ws.notes_block = None
	await ws.prepare(req)
	clients.append(ws)

	await ws.send_json({"type": "quiet", "data": quiet})
	async for msg in ws:
		# Ignore non-JSON messages
		if msg.type != WSMsgType.TEXT: continue
		try: msg = json.loads(msg.data)
		except ValueError: continue
		print("MESSAGE", msg)
		if msg.get("type") == "init":
			try: ws.notes_block = int(msg["block"])
			except (ValueError, KeyError): pass
			await ws.send_json({"type": "inited"})

	clients.remove(ws)
	await ws.close()
	return ws

def lookup(data, arg, absent=None):
	for piece in arg.split(":"):
		data = data.get(piece)
		if data is None: return absent
	return data

import time
last_stats_time = None
def show_stats(data, fmt, *args):
	global last_stats_time
	t = time.time()
	if last_stats_time is None: tm = 0.0
	else: tm = t - last_stats_time
	last_stats_time = t
	print("%.1f" % tm, fmt % tuple(lookup(data, arg, "##") for arg in args))

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
* Make use of ~/shed/notes.py
* Triggered within the CS:GO ecosystem, a way to take notes on the current round.
  - See above re round numbers
  - If warmup, report round zero
  - If spectating, say who's being spec'd, just in case
    - Test this - can we get the name of the person or just the id? Can we look up the
      id and get a name? (I think it's a Steam ID.) Can we at least get the observer_slot?
* It's not possible while playing to get the current round timers, I believe. It IS,
  however, possible to notice the round number change (and freeze time end), and record
  the time. For the purposes of note-taking, a few seconds here or there doesn't matter.
* After notes have been taken, the text form should be shown in some visible way. This
  is probably best just done by writing to a file, and then tailing that file - would
  play nicely with CroppedTerm for the stream.

Would be REALLY cool if it could also record any typed text for those few seconds. During
freeze time, I would have to be aware of hitting G but most other keys would be safe.

Voice trigger???? "Bacon!"

Now all I need to do is run this:
$ ~/shed/notes.py `curl http://localhost:27013/status`

Additional crazy ideas:
  - Identify a downloaded match somehow
    - The first time freeze-time ends, gather the Steam IDs of all players
    - It's highly unlikely that I'll ever be in two matches with the exact same ten players in the exact same order.
  - What ARE all those numbers in the file name?
  - Monitor the directory to see when one's downloaded
  - Can I signal CS:GO (or signal Steam to signal CS:GO) to open that match at that round?
    - First, find the tick number that the round started at (by parsing the file)
    - Console: playdemo replays/match730_003373022181167464575_1769684219_172.dem; demo_gototick 149470
    - steam://rungame/730/76561202255233023/+csgo_download_match%20CSGO-PLrc7-7rHPY-HRt5B-5xLqy-jVMQC
    - Can't use that with playdemo though, and adding demo_gototick doesn't help else.
    - CAN use "steam://rungame/730/76561202255233023/+exec%20startdemo" but only if CS:GO isn't running.
    - Could bind a key to "exec startdemo" maybe??
'''

'''
TODO: Automatically play back the notes files as I reach the corresponding point.
* Recognize the match somehow? If not, assume the user will pick the right demo.
* Possibly best to open up a web page to do the playing
* Show all notes as they were taken, with the transcripts given by Sphinx and Google
* Allow manual playing and then typing of transcriptions
* Highlight the next message. Autoskip if we're in a round beyond it.
* When we get to +/- 1 second of when the notes were taken, flash the notes section while playing the audio.
* Move to the next message after playing.
* Automatically open this up for a block when GSI says to create one??
* As soon as we see the round timer, flip all clocks from "count up from freeze" to "count down from round time"
  - This should be done client-side. Continue to store time-since-freeze-end, but display it inverted.
'''

class State:
	round_desc = "Round Unknown" # Current round number, spectating status, etc
	round = -1; ct_score = 0; t_score = 0 # Also found in round_desc
	spec = None; spec_slot = None # Who you're spectating, if any
	is_new_match = True # Set when new match started, reset only when round status requested
	round_start = None # Time when the most recent round started (defined by the end of freeze time)
	bomb_plant = None # Time when the bomb got planted - bomb_plant-round_start = time to plant.
	frozen = False # Are we in freeze time?
	warmup = False # Are we in warmup? Technically not a three-way state with frozen, though they are unlikely ever to both be True.
	playing = False # Are we even playing the game? What IS this?
	round_timer = { } # How long is a round (counting just after freeze time ends)? How long is the bomb timer?

@route.get("/status") # deprecated
async def round_status(req):
	# Key pieces of info:
	# Are we in warmup? If so, R0. If not, round number per above.
	# How long since the last sighting of freeze time? (Round phase, not map phase)
	# Since the last time status was requested, has there been a new Warmup? (Map phase)
	if not State.playing: return web.Response(text="n/a")
	resp = State.is_new_match * "--new-block " + State.round_desc
	if State.round_start: resp += " (%.1fs)" % (time.time() - State.round_start)
	if State.bomb_plant: resp += " (b%.1fs)" % (time.time() - State.bomb_plant)
	State.is_new_match = False
	return web.Response(text=resp)

@route.get("/status.json")
async def round_status_json(req):
	resp = {
		"playing": State.playing,
		"new_match": State.is_new_match,
		"desc": State.round_desc,
		"round": State.round,
		"spec": [State.spec, State.spec_slot],
		"score": [State.ct_score, State.t_score],
		"time": (time.time() - State.round_start) if State.round_start else None
		"bombtime": (time.time() - State.bomb_plant) if State.bomb_plant else None
	}
	if State.round_start: resp["desc"] += " (%.1fs)" % (time.time() - State.round_start)
	if State.bomb_plant: resp["desc"] += " (b%.1fs)" % (time.time() - State.bomb_plant)
	State.is_new_match = False
	return web.json_response(resp)

@route.post("/metadata/{block:[0-9]+}")
async def update_metadata(req):
	# TODO: Accept the JSON payload and notify all connected clients that
	# this block now has new metadata available. The payload should be
	# identical to what would be given by GET /recordings/<block>/metadata.json
	# but will be sent over the websocket for instant update.
	meta = await req.json()
	block = int(req.match_info["block"])
	await broadcast({"type": "metadata", "block": block, "metadata": meta}, block=block)
	return web.Response(text="OK")

@route.post("/gsi")
async def update_configs(req):
	data = await req.json()
	phase = lookup(data, "map:phase")
	rdphase = lookup(data, "round:phase")
	State.playing = phase is not None
	if phase == "warmup":
		if not State.warmup:
			State.is_new_match = State.warmup = True
			State.round_timer = { }
		round = 0
	else:
		State.warmup = False
		round = int(lookup(data, "map:round", "0"))
		# Rounds are numbered from zero, so normally we have to add one to get to
		# the round number that humans want to use (especially since we call warmup
		# "round zero"). However, if notes are taken during game over, round over,
		# or freeze time, they probably apply to the PREVIOUS round, so we subtract
		# one again. Or, yaknow, just don't add the one in the first place.
		if rdphase == "live": round += 1
	if rdphase == "freezetime":
		State.frozen = True
	if State.frozen and rdphase != "freezetime":
		# We WERE in freeze time, but now we're not. Jot down the time so we can
		# measure time into the current round. Note that previously:round:phase
		# is NOT reliable; sometimes, previously:round is True instead of actually
		# having useful information in it. Thanks so much, CS:GO.
		State.round_start = time.time()
		State.frozen = False
	if State.bomb_plant is None and lookup(data, "round:bomb") == "planted":
		State.bomb_plant = time.time()
	p = data.get("phase_countdowns")
	if p:
		# When spectating, we get the phase time, which tells us the
		# round timer. But we don't always get it instantly, and it's
		# entirely possible we'll jump around some. However we know
		# for sure that the time left will never EXCEED the round time,
		# so we take the longest timer ever seen (this block) and
		# assume that that's the round time.
		State.round_timer[p["phase"]] = max(State.round_timer.get(p["phase"], 0.0), float(p["phase_ends_in"]))
		# print(p["phase"], p["phase_ends_in"], end="\r")
		# If we're spectating (ie if we have round_timer), send current timing info.
		# The bomb disrupts our ability to do this, though. Ideally, send to all
		# notes clients the round number, the position within the round, and an
		# inversion factor of the round_timer. It can then use position-within-round
		# to choose which entry to highlight, and the inversion factor to change
		# count-up times ("time since freeze ended") into count-down times ("1:44").
		# Furthermore, any recording with a "bombtime" attribute can be inverted
		# using the bomb timer inversion, so it would show the bomb's countdown.
		# If phase is "live", use metadata["time"]; if phase is "bomb", use
		# metadata["bombtime"] if it exists, otherwise assume that we're past it.
		# Either way, if phasetime is greater than the recording time, we're past.
		await broadcast({
			"type": "position", "round": round, "phase": p["phase"],
			"phasetime": State.round_timer[p["phase"]] - float(p["phase_ends_in"]),
			"inversions": State.round_timer,
		}, block=int)
	State.round = round
	State.ct_score = lookup(data, "map:team_ct:score", "--")
	State.t_score = lookup(data, "map:team_t:score", "--")
	State.round_desc = "R%d (%s::%s)" % (round, State.ct_score, State.t_score)
	if lookup(data, "player:steamid", "X") != lookup(data, "provider:steamid", "Y"):
		# If you're not observing yourself, record who you ARE observing.
		State.spec = lookup(data, "player:name", "?")
		State.spec_slot = lookup(data, "player:observer_slot", "?")
		State.round_desc += " spec-%s-%s" % (State.spec_slot, State.spec)
	else:
		State.spec = State.spec_slot = None
	# print(State.round_desc, "%.1fs" % (time.time() - State.round_start) if State.round_start else "")
	if "previously" in data: del data["previously"] # These two are always uninteresting.
	if "added" in data: del data["added"]
	# from pprint import pprint; pprint(data)
	new_quiet = phase in QUIET_PHASES
	if "allplayers" in data and lookup(data, "map:mode") == "competitive":
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
