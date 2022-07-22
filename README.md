Chrome Tab Muter
================

Mute tabs when they should shush. Can be done automatically when you're in a
Counter-Strike match, globally in response to a hotkey, or specifically mute
and unmute individual tabs.

Press Ctrl-M to immediately mute/unmute the current tab, or Ctrl-U to unmute
(idempotently). Ctrl-Shift-5 will quickly mute all noisy tabs, even if Chrome
doesn't currently have focus; Ctrl-Shift-6 will unmute anything automuted by
Ctrl-Shift-5.

Uses CS:GO's [game state integrations](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration)
to notice whenever you're in a match, and mute every Chrome tab that's playing
audio. Will unmute when you're out of a match, but only the tabs that it muted
(so you can manually mute a tab and it'll stay muted). Pressing Ctrl-U to unmute
a tab within 30 seconds of the automute signal will keep just that tab noisy.

Mute icon from https://www.iconfinder.com/icons/227576/mute_icon and available
under the terms of CC-BY-3.0. Created by Cole Bennis.

To publish a new version:

1. Bump the version number in the manifest
2. $ (rm -f upload.zip; cd Websocket-Muter; zip ../upload *)
3. Go to https://chrome.google.com/webstore/devconsole/ and upload the new file.
4. Dispose of upload.zip, it's not needed locally

TODO:
* VLC integration. Can be done with TELNET interface, or a dedicated extension.
  - TELNET interface requires communication of the password.
  - Extension - can it pause and unpause in response to a websocket? If not,
    can it do so in response to an outgoing telnet connection?
