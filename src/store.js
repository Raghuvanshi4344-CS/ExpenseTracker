const fs = require('fs');
const path = require('path');
const { generateNetwork } = require('./network');
const { localizeIncidents } = require('./localizer');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NETWORK_FILE = path.join(DATA_DIR, 'network.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrCreateStore() {
  ensureDataDir();
  const network = fs.existsSync(NETWORK_FILE) ? JSON.parse(fs.readFileSync(NETWORK_FILE, 'utf8')) : generateNetwork(42);
  if (!fs.existsSync(NETWORK_FILE)) {
    fs.writeFileSync(NETWORK_FILE, JSON.stringify(network, null, 2));
  }

  const state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : createInitialState(network);

  if (!state.observations || Object.keys(state.observations).length === 0) {
    seedBaselineTelemetry(network, state);
  }

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  return { network, state };
}

function createInitialState(network) {
  const state = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    telemetry: [],
    observations: {},
    tickets: [],
    incidents: [],
    scheduledOutages: network.scheduledOutages,
    activeFaults: [],
    metrics: {
      ingested: 0,
      duplicates: 0,
      stale: 0,
      ignored: 0,
      lastRecomputeMs: 0,
    },
  };

  seedBaselineTelemetry(network, state);
  return state;
}

function seedBaselineTelemetry(network, state) {
  const now = new Date().toISOString();
  state.telemetry = state.telemetry || [];
  state.observations = state.observations || {};

  network.poles.forEach((pole) => {
    if (!pole.device_id) {
      return;
    }

    const device = network.deviceByPole[pole.pole_id];
    const event = {
      device_id: pole.device_id,
      pole_id: pole.pole_id,
      event: 'heartbeat',
      energized: true,
      ts: now,
      seq: 1,
      battery_mv: device ? device.battery_mv : 3400,
      rssi: device ? device.rssi : -78,
      fw: device ? device.fw : '1.4.2',
      received_at: now,
    };
    state.observations[pole.pole_id] = event;
    state.telemetry.push(event);
    if (device) {
      device.latest_seq = 1;
      device.online = true;
    }
  });

  state.metrics.ingested = state.telemetry.length;
}

function persistStore(network, state) {
  ensureDataDir();
  fs.writeFileSync(NETWORK_FILE, JSON.stringify(network, null, 2));
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function resetStore() {
  if (fs.existsSync(NETWORK_FILE)) {
    fs.unlinkSync(NETWORK_FILE);
  }
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
  return loadOrCreateStore();
}

function recomputeTickets({ network, state }) {
  const incidents = localizeIncidents({
    network,
    observations: state.observations,
    scheduledOutages: state.scheduledOutages,
    asOf: new Date().toISOString(),
  });

  const existingByKey = new Map(state.tickets.map((ticket) => [ticket.sourceKey, ticket]));
  const nextTickets = [];

  incidents.forEach((incident) => {
    const sourceKey = `${incident.scope}:${incident.assetId}`;
    const existing = existingByKey.get(sourceKey);
    if (existing) {
      nextTickets.push({
        ...existing,
        ...incident,
        sourceKey,
        updatedAt: new Date().toISOString(),
        status: existing.status === 'closed' ? 'closed' : existing.status,
      });
      existingByKey.delete(sourceKey);
      return;
    }

    nextTickets.push(buildTicketFromIncident(incident));
  });

  state.tickets.forEach((ticket) => {
    if (!incidents.some((incident) => `${incident.scope}:${incident.assetId}` === ticket.sourceKey)) {
      if (ticket.status !== 'closed') {
        nextTickets.push({
          ...ticket,
          status: ticket.status === 'verified' ? 'closed' : ticket.status,
          updatedAt: new Date().toISOString(),
        });
      } else {
        nextTickets.push(ticket);
      }
    }
  });

  state.incidents = incidents;
  state.tickets = dedupeTickets(nextTickets);
  state.updatedAt = new Date().toISOString();
}

function buildTicketFromIncident(incident) {
  return {
    id: `T-${String(Math.floor(Math.random() * 900000) + 100000)}`,
    sourceKey: `${incident.scope}:${incident.assetId}`,
    status: 'detected',
    ...incident,
    acknowledgedAt: '',
    assignedAt: '',
    resolvedAt: '',
    verifiedAt: '',
    closedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiBrief: '',
  };
}

function dedupeTickets(tickets) {
  const seen = new Map();
  tickets.forEach((ticket) => {
    seen.set(ticket.sourceKey, ticket);
  });
  return [...seen.values()].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

module.exports = {
  loadOrCreateStore,
  persistStore,
  resetStore,
  createInitialState,
  recomputeTickets,
  NETWORK_FILE,
  STATE_FILE,
};
