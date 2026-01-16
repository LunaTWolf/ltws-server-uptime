# LunaTW's Server Uptime Site

Minimal Node.js status site that serves a static frontend and probes servers/services.

Quick start
- Install dependencies: `npm install`
- Start: `npm start` (runs `node index.js`)

Features
- Serves static UI from `public/` with a responsive, card-style list layout.
- Dynamic title from `config.json` (frontend fetches `/config.json`).
- Health endpoint: `/health` (returns JSON { status, uptime }).
- Serves `servers.json` to the frontend at `/servers.json`.
- TCP probe endpoint: `/probe?host=IP&port=PORT` — attempts TCP connect and optionally fetches `/health` on HTTP ports.
- Server probe endpoint: `/probe-server?host=IP` or `/probe-server?name=ServerName` — checks configured ports and common fallbacks.
- Service probe by name: `/probe-service?name=ServerName&port=PORT` — probe a service without exposing server IP to the client.
- `QueryPort` support: if a server entry has `QueryPort` > 0, server-level probes use that single port.
- In-memory `lastUptime` cache when remote `/health` reports `uptime`.

Servers configuration (servers.json)
- Each server entry supports:
	- `Server Name`: display name
	- `IP`: numeric or host address (used for probing)
	- `Services`: array of services with `Service Name` and `Port`
	- `Port`: top-level port (optional)
	- `HideIP`: true/false — hide IP in UI and avoid exposing it to client probes
	- `HidePorts`: true/false — hide port numbers in the UI
	- `OneServiceOnly`: true/false — show only a single service/port for the server
	- `QueryPort`: number — when >0, used as the authoritative port for server-level checks

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
			"IP": "192.168.0.92",
			"HideIP": false,
			"HidePorts": false,
			"OneServiceOnly": false,
			"QueryPort": 0,
			"Services": [ { "Service Name": "Web", "Port": 80 } ]
		}
	]
}
```

Want changes
- Add persistent uptime store, periodic re-checking, or a Dockerfile? Open to next steps.
