CS:GO Auto-Muter
================

Plan: Listen to CS:GO's game-state integration and automatically mute things
whenever you're in a match, and unmute them afterwards.

Requirements:
* GSI listener. Lift from private repo.
  - Requires a web server.
* VLC integration. Can be done with TELNET interface, or a dedicated extension.
  - TELNET interface requires communication of the password.
  - Extension - can it pause and unpause in response to a websocket? If not,
    can it do so in response to an outgoing telnet connection?
* Chrome integration.
  - Needs an extension
  - Will use a websocket to communicate with the same web server as GSI uses.
