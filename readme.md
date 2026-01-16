# LunaTW's Server Uptime Site

Minimal Node.js status site that serves a static frontend and probes servers/services.
[![Node.js CI](https://github.com/LunaTWolf/ltws-server-uptime/actions/workflows/node.js.yml/badge.svg)](https://github.com/LunaTWolf/ltws-server-uptime/actions/workflows/node.js.yml)

Quick start
- Install dependencies: `npm install`
- Start: `npm start` (runs `node index.js`)

What this site does for you
- Shows a clean dashboard listing your servers and the services running on them.
- Lets you see at a glance which services are online or offline, with clear colored badges.
- Keeps sensitive details private: you can hide IP addresses and ports from the public view.
- Lets you focus on a single important service per server if you prefer a simplified view.
- Uses a simple config file so you can add or remove servers and services easily.

How servers are defined (servers.json)
- Each server has a name and an address; you can list the services (and ports) to monitor.
- Optional flags let you hide the IP, hide ports, show only one service, or set a specific port to use when checking the server.


Frontend behavior
- Lists servers one per row, services stacked top-to-bottom inside each server row.
- Each service displays: Name (left), IP (or `Hidden`) with an optional tooltip `IP:PORT`, and a status badge on the right (checking/online/offline).
- If `HideIP` is set the client will use name-based probe endpoints (`/probe-service`) so the IP is never exposed to the browser.

Notes
- Probes run server-side (Node) so the browser does not perform raw TCP connections.
- Cached uptimes are stored in-memory and reset on server restart. Persisting them to disk can be added if desired.
- To change the server port for this app, edit `config.json` or set `PORT` env var before starting.

Example
```json
{
	"Servers": [
		{
			"Server Name": "LTW1",
			"Web Link": "",
			"IP": "192.168.0.92",
			"HideIP": false,
			"HidePorts": false,
			"OneServiceOnly": false,
			"QueryPort": 0,
			"Services": [ { "Service Name": "Web", "Web Link": "https://192.168.0.92/", "Port": 80 } ]
		}
	]
}
```

Want changes
- Add persistent uptime store, periodic re-checking, or a Dockerfile? Open to next steps.
