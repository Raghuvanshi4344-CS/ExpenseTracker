const state = {
  data: null,
  selectedTicketId: null,
  selectedMapEntry: null,
};

const MAP_WIDTH = 800;
const MAP_HEIGHT = 520;
const MAP_TILE_SIZE = 256;
const MAP_PADDING = 72;

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
els.networkMap.addEventListener('click', handleMapClick);

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

function renderMap() {
  const svg = els.networkMap;
  const data = state.data;
  const points = [...data.network.poles, ...data.network.dts];
  const viewport = fitMapViewport(points, MAP_WIDTH, MAP_HEIGHT, MAP_PADDING);
  const poleById = new Map(data.network.poles.map((pole) => [pole.pole_id, pole]));
  const dtById = new Map(data.network.dts.map((dt) => [dt.dt_id, dt]));
  const links = data.network.poles
    .filter((pole) => pole.parent_pole_id && poleById.has(pole.parent_pole_id))
    .map((pole) => renderMapLink(poleById.get(pole.parent_pole_id), pole, viewport, 'pole-link'));

  const dtLinks = data.network.dts
    .map((dt) => {
      const rootPole = poleById.get(dt.root_pole_id);
      if (!rootPole) return '';
      return renderMapLink(dt, rootPole, viewport, 'dt-link');
    })
    .filter(Boolean);

  const dtNodes = data.network.dts.map((dt) => renderDtNode(dt, data.network.poles, viewport));
  const poleNodes = data.network.poles.map((pole) => renderPoleNode(pole, dtById.get(pole.dt_id), viewport, data));
  const mapLabel = `${data.network.poles.length} poles, ${data.network.dts.length} DTs, ${data.network.feeders.length} feeders`;
  els.mapDetail.innerHTML = state.selectedMapEntry ? renderMapDetail(state.selectedMapEntry, poleById, dtById) : `
    <strong>${mapLabel}</strong><br />
    Hover a pole to see its ID, feeder, DT, ward, pincode, device, and observation state.
  `;

  svg.innerHTML = `
    <defs>
      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <image href="${buildStaticMapUrl(viewport.centerLat, viewport.centerLon, viewport.zoom, MAP_WIDTH, MAP_HEIGHT)}" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" preserveAspectRatio="none"></image>
    <rect x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" rx="18" fill="rgba(4, 9, 18, 0.22)"></rect>
    ${links.join('')}
    ${dtLinks.join('')}
    ${poleNodes.join('')}
    ${dtNodes.join('')}
  `;
}

function renderMapLink(parent, child, viewport, className) {
  const start = projectToMap(parent.lat, parent.lon, viewport);
  const end = projectToMap(child.lat, child.lon, viewport);
  return `<line class="${className}" x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" />`;
}

function renderDtNode(dt, poles, viewport) {
  const count = poles.filter((pole) => pole.dt_id === dt.dt_id).length;
  const position = projectToMap(dt.lat, dt.lon, viewport);
  const fill = dt.topology_known ? '#6ee7c8' : '#77a6ff';
  return `
    <g class="map-node dt-node" data-map-kind="dt" data-map-id="${escapeHtml(dt.dt_id)}" transform="translate(${position.x.toFixed(2)},${position.y.toFixed(2)})">
      <circle r="${10 + Math.min(12, count / 18)}" fill="${fill}" fill-opacity="0.18"></circle>
      <circle r="7" fill="${fill}" filter="url(#softGlow)"></circle>
      <text x="12" y="-8" fill="#edf2ff" font-size="11">${escapeHtml(dt.dt_id)}</text>
      <text x="12" y="8" fill="#b7c3e6" font-size="9">${count} poles</text>
      <title>${escapeHtml(`${dt.dt_id} | feeder ${dt.feeder_id} | ${dt.capacity_kva} kVA | ${dt.households_served} households | root ${dt.root_pole_id}`)}</title>
    </g>
  `;
}

function renderPoleNode(pole, dt, viewport, data) {
  const observation = data.state?.observations?.[pole.pole_id];
  const status = observation?.energized === false ? 'dark' : observation?.energized === true ? 'live' : 'unknown';
  const fill = status === 'dark' ? '#ff7b91' : status === 'live' ? '#6ee7c8' : '#ffcc66';
  const position = projectToMap(pole.lat, pole.lon, viewport);
  const hasDevice = Boolean(pole.device_id);
  return `
    <g class="map-node pole-node" data-map-kind="pole" data-map-id="${escapeHtml(pole.pole_id)}" transform="translate(${position.x.toFixed(2)},${position.y.toFixed(2)})">
      <circle r="${hasDevice ? 4.5 : 3.5}" fill="${fill}" opacity="0.9"></circle>
      <circle r="${hasDevice ? 9 : 7}" fill="${fill}" fill-opacity="0.14"></circle>
      <title>${escapeHtml(poleTooltip(pole, dt, observation))}</title>
    </g>
  `;
}

function poleTooltip(pole, dt, observation) {
  const status = observation?.energized === false ? 'dark' : observation?.energized === true ? 'live' : 'unknown';
  return [
    pole.pole_id,
    `DT ${pole.dt_id}`,
    `Feeder ${pole.feeder_id}`,
    `Type ${pole.pole_type}`,
    `Ward ${pole.ward}`,
    pole.pincode ? `PIN ${pole.pincode}` : 'PIN not tagged',
    pole.device_id ? `Device ${pole.device_id}` : 'No device tag',
    observation ? `Observation ${status}` : 'No live observation',
    dt ? `${dt.capacity_kva} kVA, ${dt.households_served} households` : '',
  ].filter(Boolean).join(' | ');
}

function renderMapDetail(entry, poleById, dtById) {
  if (entry.kind === 'dt') {
    const dt = dtById.get(entry.id);
    if (!dt) return 'Selected DT not found.';
    const poleCount = state.data.network.poles.filter((pole) => pole.dt_id === dt.dt_id).length;
    return `
      <strong>${escapeHtml(dt.dt_id)}</strong><br />
      Feeder ${escapeHtml(dt.feeder_id)} | ${dt.capacity_kva} kVA | ${dt.households_served} households | ${poleCount} poles<br />
      Root pole ${escapeHtml(dt.root_pole_id)} | Topology ${dt.topology_known ? 'recorded' : 'inferred'}
    `;
  }

  const pole = poleById.get(entry.id);
  if (!pole) return 'Selected pole not found.';
  const observation = state.data.state?.observations?.[pole.pole_id];
  return `
    <strong>${escapeHtml(pole.pole_id)}</strong><br />
    DT ${escapeHtml(pole.dt_id)} | Feeder ${escapeHtml(pole.feeder_id)} | ${escapeHtml(pole.pole_type)} | Ward ${escapeHtml(pole.ward)}<br />
    ${pole.pincode ? `PIN ${escapeHtml(pole.pincode)}` : 'PIN not tagged'} | ${pole.device_id ? `Device ${escapeHtml(pole.device_id)}` : 'No device tag'}<br />
    ${observation ? `Observation ${observation.energized ? 'live' : 'dark'} at ${escapeHtml(observation.observed_at || '')}` : 'No live observation'}
  `;
}

function handleMapClick(event) {
  const target = event.target.closest?.('[data-map-kind]');
  if (!target) return;
  state.selectedMapEntry = {
    kind: target.dataset.mapKind,
    id: target.dataset.mapId,
  };
  renderMap();
}

function projectToMap(lat, lon, viewport) {
  const world = latLonToWorldPixel(lat, lon, viewport.zoom);
  return {
    x: world.x - viewport.minX + viewport.padding,
    y: world.y - viewport.minY + viewport.padding,
  };
}

function fitMapViewport(points, width, height, padding) {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const fallback = {
    zoom: 14,
    centerLat: points[0]?.lat || 12.95,
    centerLon: points[0]?.lon || 77.57,
    minX: 0,
    minY: 0,
    padding,
  };

  for (let zoom = 17; zoom >= 10; zoom -= 1) {
    const projected = points.map((point) => latLonToWorldPixel(point.lat, point.lon, zoom));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));

    if (maxX - minX <= usableWidth && maxY - minY <= usableHeight) {
      const centerWorldX = (minX + maxX) / 2;
      const centerWorldY = (minY + maxY) / 2;
      const center = worldPixelToLatLon(centerWorldX, centerWorldY, zoom);
      return {
        zoom,
        centerLat: center.lat,
        centerLon: center.lon,
        minX,
        minY,
        padding,
      };
    }
  }

  const projected = points.map((point) => latLonToWorldPixel(point.lat, point.lon, fallback.zoom));
  fallback.minX = Math.min(...projected.map((point) => point.x));
  fallback.minY = Math.min(...projected.map((point) => point.y));
  const maxX = Math.max(...projected.map((point) => point.x));
  const maxY = Math.max(...projected.map((point) => point.y));
  const center = worldPixelToLatLon((fallback.minX + maxX) / 2, (fallback.minY + maxY) / 2, fallback.zoom);
  fallback.centerLat = center.lat;
  fallback.centerLon = center.lon;
  return fallback;
}

function latLonToWorldPixel(lat, lon, zoom) {
  const scale = MAP_TILE_SIZE * (2 ** zoom);
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPixelToLatLon(x, y, zoom) {
  const scale = MAP_TILE_SIZE * (2 ** zoom);
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lon };
}

function buildStaticMapUrl(centerLat, centerLon, zoom, width, height) {
  const lat = centerLat.toFixed(6);
  const lon = centerLon.toFixed(6);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
