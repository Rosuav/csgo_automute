-- Install by symlinking into ~/.local/share/vlc/lua/extensions or equivalent
-- Will require the corresponding volume detection Python script to be running.

function descriptor()
	return { 
		title = "&CS:GO Auto-Pause",
		version = "0.1",
		author = "Rosuav",
		capabilities = { },
	}
end

sock = nil
function activate()
	vlc.msg.info("[CSGO] Activated")
	local dialog = vlc.dialog("CSGO autopause")
	dialog:add_label("Hit me to do stuff.", 1, 1, 1, 1)
	dialog:add_button("Frob", dostuff, 2, 1, 1, 1)
	dialog:show()
end

function dostuff()
	sock = vlc.net.connect_tcp("localhost", 27012) -- Change port if needed
	if sock < 0 then
		vlc.msg.info("[CSGO] Failed connection")
		vlc.deactivate() -- Can't connect? Plugin won't activate.
		return
	end
	while true do
		vlc.msg.info("[CSGO] Polling...")
		vlc.keep_alive()
		local poll = {}
		poll[sock] = vlc.net.POLLIN
		local ret = vlc.net.poll(poll) -- is this needed?
		vlc.msg.info("[CSGO] Poll: " .. ret)
		vlc.keep_alive()
		local data = vlc.net.recv(sock, 1024)
		if not data then
			vlc.msg.info("[CSGO] Got no data")
			net.close(sock)
			sock = nil
			return
		end
		vlc.msg.info("[CSGO] Got data: " .. data)
--~ 		for i = 1, #data do
--~ 			vlc.msg.info("[CSGO] Char: " .. data[i])
--~ 			if data[i] == "1" then
--~ 				vlc.msg.info("[CSGO] Pause")
--~ 			end
--~ 			if data[i] == "0" then
--~ 				vlc.msg.info("[CSGO] Unpause")
--~ 			end
--~ 		end
	end
end

function deactivate()
	vlc.msg.info("[CSGO] Deactivated")
	net.close(sock)
	sock = nil
end
