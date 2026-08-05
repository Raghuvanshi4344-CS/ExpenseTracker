const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadOrCreateStore, persistStore, resetStore, recomputeTickets } = require('./src/store');
const { simulateFault, simulateNoise, repairFault, ingestTelemetryBatch } = require('./src/simulator');

let { network, state } = loadOrCreateStore();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function snapshotState() {
  const activeFaults = state.activeFaults.map((fault) => ({ ...fault }));
  const tickets = state.tickets.map((ticket) => ({ ...ticket }));
  const incidents = state.incidents.map((incident) => ({ ...incident }));
  const poles = network.poles.map((pole) => ({
    ...pole,
    observation: state.observations[pole.pole_id] || null,
  }));

  return {
    network: {
      feeders: network.feeders,
      dts: network.dts,
      poles,
    },
    tickets,
    incidents,
    scheduledOutages: state.scheduledOutages,
    activeFaults,
    metrics: state.metrics,
    updatedAt: state.updatedAt,
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/state') {
    sendJson(res, 200, snapshotState());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, updatedAt: state.updatedAt });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    ({ network, state } = resetStore());
    sendJson(res, 200, { ok: true, message: 'Store reset', state: snapshotState() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/telemetry') {
    const body = await parseBody(req);
    ingestTelemetryBatch({ network, state, batch: Array.isArray(body.events) ? body.events : [body], asOf: new Date().toISOString() });
    recomputeTickets({ network, state });
    persistStore(network, state);
    sendJson(res, 200, { ok: true, ingested: body.events ? body.events.length : 1 });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/simulate/fault') {
    const body = await parseBody(req);
    const fault = simulateFault({
      network,
      state,
      scope: body.scope,
      targetId: body.targetId,
      asOf: new Date().toISOString(),
    });
    recomputeTickets({ network, state });
    persistStore(network, state);
    sendJson(res, 200, { ok: true, fault, state: snapshotState() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/simulate/noise') {
    const body = await parseBody(req);
    const count = simulateNoise({
      network,
      state,
      kind: body.kind,
      targetId: body.targetId,
      asOf: new Date().toISOString(),
    });
    recomputeTickets({ network, state });
    persistStore(network, state);
    sendJson(res, 200, { ok: true, generated: count, state: snapshotState() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/simulate/repair') {
    const body = await parseBody(req);
    const repaired = repairFault({
      network,
      state,
      faultId: body.faultId,
      asOf: new Date().toISOString(),
    });
    recomputeTickets({ network, state });
    persistStore(network, state);
    sendJson(res, 200, { ok: true, repaired, state: snapshotState() });
    return true;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/tickets/') && pathname.endsWith('/brief')) {
    const parts = pathname.split('/').filter(Boolean);
    const ticketId = parts[2];
    const ticket = state.tickets.find((entry) => entry.id === ticketId);
    if (!ticket) {
      sendJson(res, 404, { ok: false, error: 'Ticket not found' });
      return true;
    }

    const brief = await generateTicketBrief(ticket);
    ticket.aiBrief = brief;
    ticket.updatedAt = new Date().toISOString();
    persistStore(network, state);
    sendJson(res, 200, { ok: true, brief, ticketId });
    return true;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/tickets/')) {
    const parts = pathname.split('/').filter(Boolean);
    const ticketId = parts[2];
    const action = parts[3];
    const body = await parseBody(req);
    const ticket = state.tickets.find((entry) => entry.id === ticketId);

    if (!ticket) {
      sendJson(res, 404, { ok: false, error: 'Ticket not found' });
      return true;
    }

    const now = new Date().toISOString();
    if (action === 'ack') {
      ticket.status = 'acknowledged';
      ticket.acknowledgedAt = now;
    } else if (action === 'assign') {
      ticket.status = 'crew_assigned';
      ticket.assignedAt = now;
      ticket.crew = body.crew || 'Crew-01';
    } else if (action === 'resolve') {
      const affected = ticket.scope === 'span'
        ? [ticket.fromPoleId, ticket.toPoleId]
        : [];
      const stillDark = affected.some((poleId) => state.observations[poleId]?.energized === false);
      ticket.resolvedAt = now;
      ticket.status = stillDark ? 'resolved_pending_verify' : 'resolved';
    } else if (action === 'close') {
      ticket.status = 'closed';
      ticket.closedAt = now;
    }

    ticket.updatedAt = now;
    if (ticket.status === 'resolved' && ticket.resolvedAt && ticket.scope !== 'span') {
      ticket.status = 'verified';
      ticket.verifiedAt = now;
      ticket.closedAt = now;
      ticket.status = 'closed';
    }

    persistStore(network, state);
    sendJson(res, 200, { ok: true, ticket });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    sendJson(res, 200, {
      ok: true,
      feeders: network.feeders.map((feeder) => ({ feeder_id: feeder.feeder_id, dt_ids: feeder.dt_ids })),
      dts: network.dts,
      sampleTickets: state.tickets.slice(0, 3),
    });
    return true;
  }

  return false;
}

async function generateTicketBrief(ticket) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  const fallback = [
    `Fault ${ticket.id} is a ${ticket.scope} incident on ${ticket.assetId}.`,
    `The outage is localized to ${ticket.affectedPoles} poles with confidence ${Math.round(ticket.confidence * 100)}%.`,
    ticket.pincode ? `Navigation should point to PIN ${ticket.pincode}.` : 'PIN code is not fully resolved yet.',
    `Reasoning: ${ticket.reason}.`,
  ].join(' ');

  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: 'Write a compact operator handoff note for a power-distribution fault ticket. Be concrete and avoid speculation.',
          },
          {
            role: 'user',
            content: JSON.stringify(ticket),
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const text = payload.output_text || payload.output?.[0]?.content?.[0]?.text || '';
    return text || fallback;
  } catch (error) {
    return fallback;
  }
}

function updateAutoVerification() {
  let changed = false;
  state.tickets.forEach((ticket) => {
    if (!ticket.scope || ticket.status === 'closed') {
      return;
    }

    if (ticket.scope === 'span') {
      const fromLive = state.observations[ticket.fromPoleId]?.energized === true;
      const toLive = state.observations[ticket.toPoleId]?.energized === true;
      if (ticket.status === 'resolved_pending_verify' && fromLive && toLive) {
        ticket.status = 'verified';
        ticket.verifiedAt = new Date().toISOString();
        ticket.closedAt = ticket.verifiedAt;
        ticket.status = 'closed';
        changed = true;
      }
    } else if (ticket.scope === 'dt') {
      const dtPoles = network.poles.filter((pole) => pole.dt_id === ticket.dtId);
      const anyDark = dtPoles.some((pole) => state.observations[pole.pole_id]?.energized === false);
      if (!anyDark && ticket.status === 'resolved_pending_verify') {
        ticket.status = 'verified';
        ticket.verifiedAt = new Date().toISOString();
        ticket.closedAt = ticket.verifiedAt;
        ticket.status = 'closed';
        changed = true;
      }
    }
  });

  if (changed) {
    persistStore(network, state);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await handleApi(req, res, url.pathname)) {
      updateAutoVerification();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      serveStatic(req, res, path.join(__dirname, 'public', 'index.html'));
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/public/')) {
      const relative = url.pathname.replace('/public/', '');
      serveStatic(req, res, path.join(__dirname, 'public', relative));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      serveStatic(req, res, path.join(__dirname, 'public', 'styles.css'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      serveStatic(req, res, path.join(__dirname, 'public', 'app.js'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      sendText(res, 204, '');
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Propel fault localizer listening on http://localhost:${port}`);
});
