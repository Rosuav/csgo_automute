CS:GO Auto-Muter
================

Automatically mute distractions whenever you're in a Counter-Strike match.

Uses CS:GO's [game state integrations](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration)
to notice whenever you're in a match, and mute every Chrome tab that's playing
audio. Will unmute when you're out of a match, but only the tabs that it muted
(so you can manually mute a tab and it'll stay muted). There is currently no
way to request that a particular tab remain unmuted.

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
