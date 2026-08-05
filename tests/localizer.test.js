const test = require('node:test');
const assert = require('node:assert/strict');
const { generateNetwork } = require('../src/network');
const { buildTopologyForDt, summarizeIncident } = require('../src/localizer');

function makeObservation(poleId, energized, seq = 1) {
  return {
    device_id: `device-${poleId}`,
    pole_id: poleId,
    event: energized ? 'heartbeat' : 'power_lost',
    energized,
    ts: new Date().toISOString(),
    seq,
    battery_mv: 3400,
    rssi: -80,
    fw: '1.4.2',
  };
}

test('localizer finds a live/dark boundary in recorded topology', () => {
  const network = generateNetwork(42);
  const dt = network.dts.find((entry) => entry.topology_known);
  assert.ok(dt, 'expected a topology-known DT');
  const topology = buildTopologyForDt(network, dt.dt_id);
  const poles = network.poles.filter((pole) => pole.dt_id === dt.dt_id).sort((a, b) => Number(a.seq_on_line || 0) - Number(b.seq_on_line || 0));
  const cutIndex = Math.min(4, Math.max(1, Math.floor(poles.length / 4)));
  const observations = {};

  poles.forEach((pole, index) => {
    observations[pole.pole_id] = makeObservation(pole.pole_id, index < cutIndex);
  });

  const result = summarizeIncident({
    network,
    dtId: dt.dt_id,
    parentByPole: topology.parentByPole,
    childrenByPole: topology.childrenByPole,
    observations,
    scheduledOutages: [],
    asOf: new Date().toISOString(),
  });

  assert.equal(result.ticketable, true);
  assert.equal(result.scope, 'span');
  assert.ok(result.fromPoleId);
  assert.ok(result.toPoleId);
  assert.ok(result.affectedPoles >= 1);
  assert.ok(result.confidence >= 0.8);
});

test('isolated dark pole with live children is treated as a sensor fault', () => {
  const network = generateNetwork(42);
  const dt = network.dts.find((entry) => entry.topology_known);
  assert.ok(dt, 'expected a topology-known DT');
  const topology = buildTopologyForDt(network, dt.dt_id);
  const poles = network.poles.filter((pole) => pole.dt_id === dt.dt_id).sort((a, b) => Number(a.seq_on_line || 0) - Number(b.seq_on_line || 0));
  const suspicious = poles[1] || poles[0];
  const observations = {};

  poles.forEach((pole, index) => {
    observations[pole.pole_id] = makeObservation(pole.pole_id, true, index + 1);
  });
  observations[suspicious.pole_id] = makeObservation(suspicious.pole_id, false, 99);

  const result = summarizeIncident({
    network,
    dtId: dt.dt_id,
    parentByPole: topology.parentByPole,
    childrenByPole: topology.childrenByPole,
    observations,
    scheduledOutages: [],
    asOf: new Date().toISOString(),
  });

  assert.equal(result.ticketable, false);
  assert.equal(result.sensorFault, true);
});

test('planned outage suppresses ticketing', () => {
  const network = generateNetwork(42);
  const dt = network.dts[0];
  const topology = buildTopologyForDt(network, dt.dt_id);
  const poles = network.poles.filter((pole) => pole.dt_id === dt.dt_id);
  const observations = {};
  poles.forEach((pole) => {
    observations[pole.pole_id] = makeObservation(pole.pole_id, false);
  });

  const now = new Date().toISOString();
  const result = summarizeIncident({
    network,
    dtId: dt.dt_id,
    parentByPole: topology.parentByPole,
    childrenByPole: topology.childrenByPole,
    observations,
    scheduledOutages: [{ scope: 'dt', target_id: dt.dt_id, start: now, end: new Date(Date.now() + 60 * 60 * 1000).toISOString(), reason: 'Load shedding' }],
    asOf: now,
  });

  assert.equal(result.ticketable, false);
  assert.equal(result.planned, true);
});
