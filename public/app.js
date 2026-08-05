const state = {
  data: null,
  selectedTicketId: null,
  selectedMapEntry: null,
};

let map = null;
let poleLayer = null;
let dtLayer = null;
let linkLayer = null;

const els = {
  ingestCount: document.getElementById('ingestCount'),
  incidentCount: document.getElementById('incidentCount'),
  ticketCount: document.getElementById('ticketCount'),
  updatedAt: document.getElementById('updatedAt'),
  incidentList: document.getElementById('incidentList'),
  ticketDetail: document.getElementById('ticketDetail'),
  detailMeta: document.getElementById('detailMeta'),
  networkMap: document.getElementById('networkMap'),
  mapDetail: document.getElementById('mapDetail'),
  feederSelect: document.getElementById('feederSelect'),
  dtSelect: document.getElementById('dtSelect'),
  faultScope: document.getElementById('faultScope'),
  faultBtn: document.getElementById('faultBtn'),
  repairBtn: document.getElementById('repairBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  resetBtn: document.getElementById('resetBtn'),
};

document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('faultBtn').addEventListener('click', injectFault);
document.getElementById('repairBtn').addEventListener('click', repairLatest);
document.getElementById('resetBtn').addEventListener('click', resetStore);
document.querySelectorAll('[data-noise]').forEach((button) => {
  button.addEventListener('click', () => injectNoise(button.dataset.noise));
});

refresh();
setInterval(refresh, 10000);

async function refresh() {
  const response = await fetch('/api/state');
  state.data = await response.json();
  if (!state.selectedTicketId && state.data.tickets[0]) {
    state.selectedTicketId = state.data.tickets[0].id;
  }
  render();
}

function render() {
  const data = state.data;
  if (!data) return;

  els.ingestCount.textContent = String(data.metrics.ingested);
  els.incidentCount.textContent = String(data.incidents.length);
  els.ticketCount.textContent = String(data.tickets.filter((ticket) => ticket.status !== 'closed').length);
  els.updatedAt.textContent = new Date(data.updatedAt).toLocaleTimeString();

  populateSelectors();
  renderIncidentList();
  renderTicketDetail();
  renderMap();
}

function populateSelectors() {
  const feeders = state.data.network.feeders;
  const dts = state.data.network.dts;

  fillSelect(els.feederSelect, feeders.map((feeder) => ({ value: feeder.feeder_id, label: feeder.feeder_id })));
  fillSelect(els.dtSelect, dts.map((dt) => ({ value: dt.dt_id, label: `${dt.dt_id} (${dt.topology_known ? 'recorded' : 'inferred'})` })));
}

function fillSelect(element, options) {
  const current = element.value;
  element.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
  if ([...element.options].some((option) => option.value === current)) {
    element.value = current;
  }
}

function renderIncidentList() {
  const tickets = state.data.tickets;
  els.incidentList.innerHTML = tickets.length ? tickets.map(renderTicketCard).join('') : '<div class="muted">No incidents right now.</div>';
  els.incidentList.querySelectorAll('[data-ticket-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTicketId = button.dataset.ticketId;
      renderTicketDetail();
      renderIncidentList();
    });
  });
}

function renderTicketCard(ticket) {
  const statusClass = ticket.status === 'closed' ? 'good' : ticket.status.includes('resolved') ? 'warn' : 'danger';
  return `
    <article class="ticket ${state.selectedTicketId === ticket.id ? 'selected' : ''}">
      <div class="ticket-top">
        <div>
          <div class="badge ${statusClass}">${ticket.status.replaceAll('_', ' ')}</div>
          <h3 style="margin:10px 0 4px">${ticket.scope.toUpperCase()} ${ticket.assetId}</h3>
          <div class="muted">${ticket.reason}</div>
        </div>
        <div class="ticket-actions">
          <button data-ticket-id="${ticket.id}">Open</button>
        </div>
      </div>
      <div class="muted">${ticket.affectedPoles} poles affected, ${Math.round(ticket.confidence * 100)}% confidence, PIN ${ticket.pincode || 'pending'}</div>
    </article>
  `;
}

function renderTicketDetail() {
  const ticket = state.data.tickets.find((entry) => entry.id === state.selectedTicketId) || state.data.tickets[0];
  if (!ticket) {
    els.ticketDetail.className = 'detail empty';
    els.ticketDetail.textContent = 'No ticket selected.';
    return;
  }

  els.ticketDetail.className = 'detail';
  els.detailMeta.textContent = `${ticket.scope.toUpperCase()} incident, confidence ${Math.round(ticket.confidence * 100)}%`;
  els.ticketDetail.innerHTML = `
    <div class="kv"><strong>Ticket</strong><span>${ticket.id}</span></div>
    <div class="kv"><strong>Asset</strong><span>${ticket.assetId}</span></div>
    <div class="kv"><strong>Location</strong><span>${ticket.lat ? `${ticket.lat.toFixed(6)}, ${ticket.lon.toFixed(6)}` : 'Not resolved'}</span></div>
    <div class="kv"><strong>PIN</strong><span>${ticket.pincode || 'Pending lookup'}</span></div>
    <div class="kv"><strong>Affected poles</strong><span>${ticket.affectedPoles}</span></div>
    <div class="kv"><strong>Reasoning</strong><span>${ticket.reason}</span></div>
    <div>
      <div class="muted" style="margin-bottom:8px">Confidence</div>
      <div class="confidence-bar"><span style="width:${Math.round(ticket.confidence * 100)}%"></span></div>
    </div>
    <div class="muted">${ticket.aiBrief || 'AI brief not generated yet.'}</div>
    <div class="ticket-actions">
      <button data-action="ack">Acknowledge</button>
      <button data-action="assign">Assign crew</button>
      <button data-action="resolve">Mark resolved</button>
      <button data-action="brief">Generate AI brief</button>
      <button data-action="close">Close</button>
    </div>
  `;

  els.ticketDetail.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => ticketAction(ticket.id, button.dataset.action));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStatus(observation) {
  if (observation && observation.energized === false) return 'dark';
  if (observation && observation.energized === true) return 'live';
  return 'unknown';
}

function initMap() {
  if (map) return;
  map = L.map(els.networkMap, { center: [12.94, 77.55], zoom: 16, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  linkLayer = L.layerGroup().addTo(map);
  poleLayer = L.layerGroup().addTo(map);
  dtLayer = L.layerGroup().addTo(map);
}

function renderMap() {
  initMap();
  const data = state.data;
  const poleById = new Map(data.network.poles.map((pole) => [pole.pole_id, pole]));
  const dtById = new Map(data.network.dts.map((dt) => [dt.dt_id, dt]));

  linkLayer.clearLayers();
  data.network.poles.forEach((pole) => {
    if (!pole.parent_pole_id) return;
    const parent = poleById.get(pole.parent_pole_id);
    if (!parent) return;
    L.polyline([[parent.lat, parent.lon], [pole.lat, pole.lon]], { color: '#77a6ff', weight: 2, opacity: 0.55 }).addTo(linkLayer);
  });
  data.network.dts.forEach((dt) => {
    const root = poleById.get(dt.root_pole_id);
    if (!root) return;
    L.polyline([[dt.lat, dt.lon], [root.lat, root.lon]], { color: '#6ee7c8', weight: 2, opacity: 0.6, dashArray: '4 6' }).addTo(linkLayer);
  });

  poleLayer.clearLayers();
  data.network.poles.forEach((pole) => {
    const status = getStatus(pole.observation);
    const fill = status === 'dark' ? '#ff7b91' : status === 'live' ? '#6ee7c8' : '#ffcc66';
    const dt = dtById.get(pole.dt_id);
    const marker = L.circleMarker([pole.lat, pole.lon], {
      radius: pole.device_id ? 6 : 4,
      color: fill,
      weight: 2,
      fillColor: fill,
      fillOpacity: 0.85,
    }).addTo(poleLayer);
    marker.on('click', () => {
      state.selectedMapEntry = { kind: 'pole', id: pole.pole_id };
      renderMapDetail();
    });
    marker.bindTooltip(poleTooltip(pole, dt, pole.observation), { direction: 'top', offset: [0, -8] });
  });

  dtLayer.clearLayers();
  data.network.dts.forEach((dt) => {
    const count = data.network.poles.filter((p) => p.dt_id === dt.dt_id).length;
    const fill = dt.topology_known ? '#6ee7c8' : '#77a6ff';
    const marker = L.circleMarker([dt.lat, dt.lon], {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillColor: fill,
      fillOpacity: 0.8,
    }).addTo(dtLayer);
    marker.bindPopup(`<strong>${escapeHtml(dt.dt_id)}</strong><br />Feeder ${escapeHtml(dt.feeder_id)} | ${dt.capacity_kva} kVA | ${dt.households_served} households | ${count} poles<br />Root pole ${escapeHtml(dt.root_pole_id)} | Topology ${dt.topology_known ? 'recorded' : 'inferred'}`);
    marker.bindTooltip(`${dt.dt_id} (${count} poles)`, { direction: 'top', offset: [0, -10] });
    marker.on('click', () => {
      state.selectedMapEntry = { kind: 'dt', id: dt.dt_id };
      renderMapDetail();
    });
  });

  const mapLabel = `${data.network.poles.length} poles, ${data.network.dts.length} DTs, ${data.network.feeders.length} feeders`;
  if (!state.selectedMapEntry) {
    els.mapDetail.innerHTML = `<strong>${mapLabel}</strong><br />Interactive map — pan, zoom, and click a pole or DT to inspect its record.`;
  }
  if (!map._propelFitted) {
    map.fitBounds(L.latLngBounds(data.network.poles.map((p) => [p.lat, p.lon])), { padding: [40, 40] });
    map._propelFitted = true;
  }
}

function poleTooltip(pole, dt, observation) {
  const status = getStatus(observation);
  const color = status === 'dark' ? '#ff7b91' : status === 'live' ? '#6ee7c8' : '#ffcc66';
  return [
    `<strong>${escapeHtml(pole.pole_id)}</strong>`,
    `DT ${escapeHtml(pole.dt_id)}`,
    `Feeder ${escapeHtml(pole.feeder_id)}`,
    `Type ${escapeHtml(pole.pole_type)}`,
    `Ward ${escapeHtml(pole.ward)}`,
    pole.pincode ? `PIN ${escapeHtml(pole.pincode)}` : 'PIN not tagged',
    pole.device_id ? `Device ${escapeHtml(pole.device_id)}` : 'No device tag',
    observation ? `Observation: <span style="color:${color}">${status}</span>` : 'No live observation',
    dt ? `${dt.capacity_kva} kVA, ${dt.households_served} households` : '',
  ].filter(Boolean).join('<br />');
}

function renderMapDetail() {
  const entry = state.selectedMapEntry;
  const data = state.data;
  if (!entry) return;
  const poleById = new Map(data.network.poles.map((pole) => [pole.pole_id, pole]));
  const dtById = new Map(data.network.dts.map((dt) => [dt.dt_id, dt]));

  if (entry.kind === 'dt') {
    const dt = dtById.get(entry.id);
    if (!dt) {
      els.mapDetail.textContent = 'Selected DT not found.';
      return;
    }
    const poleCount = data.network.poles.filter((p) => p.dt_id === dt.dt_id).length;
    els.mapDetail.innerHTML = `<strong>${escapeHtml(dt.dt_id)}</strong><br />Feeder ${escapeHtml(dt.feeder_id)} | ${dt.capacity_kva} kVA | ${dt.households_served} households | ${poleCount} poles<br />Root pole ${escapeHtml(dt.root_pole_id)} | Lat ${dt.lat.toFixed(6)}, Lon ${dt.lon.toFixed(6)} | Topology ${dt.topology_known ? 'recorded' : 'inferred'}`;
    return;
  }

  const pole = poleById.get(entry.id);
  if (!pole) {
    els.mapDetail.textContent = 'Selected pole not found.';
    return;
  }
  const status = getStatus(pole.observation);
  const color = status === 'dark' ? '#ff7b91' : status === 'live' ? '#6ee7c8' : '#ffcc66';
  els.mapDetail.innerHTML = `
    <strong>${escapeHtml(pole.pole_id)}</strong><br />
    DT ${escapeHtml(pole.dt_id)} | Feeder ${escapeHtml(pole.feeder_id)} | ${escapeHtml(pole.pole_type)} | Ward ${escapeHtml(pole.ward)}<br />
    ${pole.pincode ? `PIN ${escapeHtml(pole.pincode)}` : 'PIN not tagged'} | ${pole.device_id ? `Device ${escapeHtml(pole.device_id)}` : 'No device tag'}<br />
    Lat ${pole.lat.toFixed(6)}, Lon ${pole.lon.toFixed(6)}<br />
    ${pole.observation ? `Observation: <strong style="color:${color}">${status}</strong> at ${escapeHtml(pole.observation.observed_at || pole.observation.ts || '')}` : 'No live observation'}
  `;
}

async function ticketAction(ticketId, action) {
  if (action === 'brief') {
    await fetch(`/api/tickets/${ticketId}/brief`, { method: 'POST' });
    await refresh();
    state.selectedTicketId = ticketId;
    renderTicketDetail();
    return;
  }

  const body = action === 'assign' ? { crew: 'Crew-01' } : {};
  await fetch(`/api/tickets/${ticketId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await refresh();
  state.selectedTicketId = ticketId;
  renderTicketDetail();
}

async function injectFault() {
  await fetch('/api/simulate/fault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: els.faultScope.value,
      targetId: els.faultScope.value === 'feeder' ? els.feederSelect.value : els.dtSelect.value,
    }),
  });
  await refresh();
}

async function repairLatest() {
  const fault = state.data.activeFaults[state.data.activeFaults.length - 1];
  if (!fault) return;
  await fetch('/api/simulate/repair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faultId: fault.id }),
  });
  await refresh();
}

async function injectNoise(kind) {
  await fetch('/api/simulate/noise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, targetId: els.dtSelect.value }),
  });
  await refresh();
}

async function resetStore() {
  await fetch('/api/reset', { method: 'POST' });
  state.selectedTicketId = null;
  await refresh();
}