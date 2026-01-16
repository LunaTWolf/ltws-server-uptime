const version = "v1.0.0";

const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');

const app = express();
let PORT;
try {
  // prefer env, then config.json, then fallback
  const config = require('./config.json');
  PORT = process.env.PORT || config.port || 8080;
} catch (err) {
  PORT = process.env.PORT || 8080;
}

app.use(express.static(path.join(__dirname, 'public')));

// Serve config.json so the frontend can read runtime configuration
app.get('/config.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'config.json'));
});

// Serve servers.json so the frontend can read the list of servers
app.get('/servers.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'servers.json'));
});

// In-memory last-known uptimes by host
const lastUptime = {}; // { [host]: { uptime: number, ts: epoch_ms } }

// Probe a host:port by attempting a TCP connection.
// Validates the target exists in servers.json to avoid arbitrary probing.
app.get('/probe', (req, res) => {
  const host = req.query.host;
  const port = parseInt(req.query.port, 10);
  if (!host || !port || Number.isNaN(port)) return res.status(400).json({ error: 'missing host or port' });

  // Load servers.json and validate the host/port are listed
  let allowed = false;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data.Servers) ? data.Servers : [];
    for (const s of list) {
      const ip = s.IP || s.ip || s.Host || s.host;
      if (ip === host) {
        // top-level port
        if (s.Port && Number(s.Port) === port) { allowed = true; break; }
        // services array
        if (Array.isArray(s.Services)) {
          for (const svc of s.Services) {
            if (svc.Port && Number(svc.Port) === port) { allowed = true; break; }
          }
          if (allowed) break;
        }
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'failed to read servers.json' });
  }

  if (!allowed) return res.status(403).json({ error: 'target not allowed' });

  const socket = new net.Socket();
  let finished = false;
  const timeoutMs = 2000;
  socket.setTimeout(timeoutMs);

  socket.once('connect', () => {
    // connected at TCP level
    // try to fetch HTTP /health if port looks like HTTP
    finished = true;
    socket.destroy();

    const tryFetchHealth = function(cb){
      try {
        const http = require(port===443? 'https' : 'http');
        const opts = {
          hostname: host,
          port: port,
          path: '/health',
          method: 'GET',
          timeout: 1500
        };
        const r = http.request(opts, function(hr){
          let body = '';
          hr.on('data', c=> body+=c);
          hr.on('end', ()=>{
            try {
              const j = JSON.parse(body);
              if (j && (typeof j.uptime === 'number' || typeof j.uptime === 'string')) {
                const up = Number(j.uptime);
                if (!Number.isNaN(up)) {
                  lastUptime[host] = { uptime: up, ts: Date.now() };
                  // also store by server name if present in servers.json
                  try {
                    const raw = fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8');
                    const data = JSON.parse(raw);
                    const list = Array.isArray(data.Servers) ? data.Servers : [];
                    for (const s of list) {
                      const ip = s.IP || s.ip || s.Host || s.host;
                      if (ip === host && s['Server Name']) {
                        lastUptime[s['Server Name']] = { uptime: up, ts: Date.now() };
                        break;
                      }
                    }
                  } catch (e) {
                    // ignore
                  }
                  return cb(null, { ok: true, uptime: up });
                }
              }
            } catch (e) {
              // ignore parse errors
            }
            return cb(null, { ok: true });
          });
        });
        r.on('error', function(){ return cb(null, { ok: true }); });
        r.on('timeout', function(){ r.destroy(); return cb(null, { ok: true }); });
        r.end();
      } catch (e) {
        return cb(null, { ok: true });
      }
    };

    // only attempt HTTP health for typical HTTP ports
    if (port === 80 || port === 443) {
      tryFetchHealth(function(err, info){
        res.json(info || { ok: true });
      });
    } else {
      res.json({ ok: true });
    }
  });
  socket.once('timeout', () => {
    if (!finished) {
      finished = true;
      socket.destroy();
      res.json({ ok: false, reason: 'timeout' });
    }
  });
  socket.once('error', (err) => {
    if (!finished) {
      finished = true;
      res.json({ ok: false, reason: err.message });
    }
  });
  socket.connect(port, host);
});

// Probe a server by checking any of its configured ports (returns ok if any port is reachable)
app.get('/probe-server', (req, res) => {
  const hostQuery = req.query.host;
  const nameQuery = req.query.name;
  let host = null;
  let serverEntry = null;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data.Servers) ? data.Servers : [];
    if (nameQuery) {
      for (const s of list) {
        if (s['Server Name'] === nameQuery) { serverEntry = s; break; }
      }
      if (!serverEntry) return res.status(403).json({ error: 'server name not found' });
      host = serverEntry.IP || serverEntry.ip || serverEntry.Host || serverEntry.host;
    } else if (hostQuery) {
      host = hostQuery;
      for (const s of list) {
        const ip = s.IP || s.ip || s.Host || s.host;
        if (ip === host) { serverEntry = s; break; }
      }
    } else {
      return res.status(400).json({ error: 'missing host or name' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'failed to read servers.json' });
  }

  // Build a unique list of ports: configured ports + common fallback ports
  // If serverEntry specifies a QueryPort (>0), probe only that port.
  let ports = [];
  const qp = serverEntry && Number(serverEntry.QueryPort);
  if (qp && Number.isInteger(qp) && qp > 0 && qp <= 65535) {
    ports = [qp];
  } else {
    const configured = new Set();
    if (serverEntry && serverEntry.Port) configured.add(Number(serverEntry.Port));
    if (serverEntry && Array.isArray(serverEntry.Services)) {
      for (const svc of serverEntry.Services) if (svc.Port) configured.add(Number(svc.Port));
    }
    const fallback = [80, 443, 22, 8080, 25565];
    fallback.forEach((p) => configured.add(p));
    ports = Array.from(configured).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);
  }
  if (ports.length === 0) return res.status(400).json({ error: 'no ports to probe' });

  // try ports concurrently; return ok:true if any connects
  let pending = ports.length;
  let finished = false;
  const timeoutMs = 1500;

  ports.forEach((p) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.once('connect', () => {
      if (!finished) {
        finished = true;
        try { s.destroy(); } catch (e) {}
        // also, if serverEntry exists and has a name, record last-known uptime placeholder for name
        if (serverEntry && serverEntry['Server Name']) {
          lastUptime[serverEntry['Server Name']] = lastUptime[serverEntry['Server Name']] || { uptime: null, ts: Date.now() };
        }
        res.json({ ok: true, port: p, name: serverEntry && serverEntry['Server Name'] });
      }
    });
    const doneOne = () => {
      try { s.destroy(); } catch (e) {}
      pending -= 1;
      if (!finished && pending <= 0) {
        finished = true;
        res.json({ ok: false });
      }
    };
    s.once('timeout', doneOne);
    s.once('error', doneOne);
    s.connect(p, host);
  });

});

// Probe a specific service by server name and port (avoids exposing IP to clients)
app.get('/probe-service', (req, res) => {
  const name = req.query.name;
  const port = parseInt(req.query.port, 10);
  if (!name || !port || Number.isNaN(port)) return res.status(400).json({ error: 'missing name or port' });

  let serverEntry = null;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data.Servers) ? data.Servers : [];
    for (const s of list) if (s['Server Name'] === name) { serverEntry = s; break; }
    if (!serverEntry) return res.status(403).json({ error: 'server name not found' });
  } catch (err) {
    return res.status(500).json({ error: 'failed to read servers.json' });
  }

  const host = serverEntry.IP || serverEntry.ip || serverEntry.Host || serverEntry.host;
  const socket = new net.Socket();
  let finished = false;
  const timeoutMs = 2000;
  socket.setTimeout(timeoutMs);
  socket.once('connect', () => {
    finished = true;
    socket.destroy();
    // attempt to fetch /health for HTTP ports
    if (port === 80 || port === 443) {
      try {
        const http = require(port===443? 'https' : 'http');
        const opts = { hostname: host, port: port, path: '/health', method: 'GET', timeout: 1500 };
        const r = http.request(opts, function(hr){
          let body = '';
          hr.on('data', c=> body+=c);
          hr.on('end', ()=>{
            try {
              const j = JSON.parse(body);
              if (j && (typeof j.uptime === 'number' || typeof j.uptime === 'string')) {
                const up = Number(j.uptime);
                if (!Number.isNaN(up)) {
                  lastUptime[host] = { uptime: up, ts: Date.now() };
                  if (serverEntry['Server Name']) lastUptime[serverEntry['Server Name']] = { uptime: up, ts: Date.now() };
                }
              }
            } catch (e) {}
            return res.json({ ok: true });
          });
        });
        r.on('error', function(){ return res.json({ ok: true }); });
        r.on('timeout', function(){ r.destroy(); return res.json({ ok: true }); });
        r.end();
      } catch (e) { return res.json({ ok: true }); }
    } else {
      return res.json({ ok: true });
    }
  });
  socket.once('timeout', () => { if (!finished) { finished = true; socket.destroy(); res.json({ ok: false, reason: 'timeout' }); } });
  socket.once('error', (err) => { if (!finished) { finished = true; res.json({ ok: false, reason: err.message }); } });
  socket.connect(port, host);
});

// Return last-known uptimes
app.get('/status', (req, res) => {
  res.json(lastUptime);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
