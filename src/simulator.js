const { shuffle } = require('./prng');

function collectAffectedPoles(network, scope, targetId) {
  if (scope === 'feeder') {
    return network.poles.filter((pole) => pole.feeder_id === targetId).map((pole) => pole.pole_id);
  }

  if (scope === 'dt') {
    return network.poles.filter((pole) => pole.dt_id === targetId).map((pole) => pole.pole_id);
  }

  if (scope === 'span') {
    const dtId = targetId.dtId;
    const all = network.poles.filter((pole) => pole.dt_id === dtId);
    const startIndex = all.findIndex((pole) => pole.pole_id === targetId.toPoleId);
    if (startIndex === -1) {
      return [];
    }
    return all.slice(startIndex).map((pole) => pole.pole_id);
  }

  return [];
}

function simulateFault({ network, state, scope, targetId, asOf = new Date().toISOString() }) {
  let faultTarget = targetId;
  let affectedPoles = [];

  if (scope === 'feeder') {
    affectedPoles = collectAffectedPoles(network, scope, targetId);
  } else if (scope === 'dt') {
    affectedPoles = collectAffectedPoles(network, scope, targetId);
  } else if (scope === 'span') {
    faultTarget = createSpanTarget(network, targetId);
    affectedPoles = collectAffectedPoles(network, scope, faultTarget);
  }

  const faultId = `F-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const fault = {
    id: faultId,
    scope,
    targetId: faultTarget,
    affectedPoles,
    createdAt: asOf,
    status: 'active',
  };

  state.activeFaults.push(fault);
  const telemetry = buildTelemetryForFault(network, state, fault, asOf);
  ingestTelemetryBatch({ network, state, batch: telemetry, asOf });
  return fault;
}

function createSpanTarget(network, dtId) {
  const poles = network.poles.filter((pole) => pole.dt_id === dtId);
  const known = poles.filter((pole) => pole.parent_pole_id);
  const pick = known.length > 1 ? known[Math.floor(Math.random() * known.length)] : poles[Math.floor(Math.random() * poles.length)];
  return {
    dtId,
    parentPoleId: pick.parent_pole_id || network.truthParentByPole[pick.pole_id] || '',
    toPoleId: pick.pole_id,
  };
}

function buildTelemetryForFault(network, state, fault, asOf) {
  const affected = new Set(fault.affectedPoles);
  const events = [];

  affected.forEach((poleId) => {
    const pole = network.polesById[poleId];
    if (!pole || !pole.device_id) {
      return;
    }

    const device = network.deviceByPole[poleId];
    const fw = device.fw;
    const canSendLost = fw !== '1.2.9' && Math.random() > 0.3;
    const seq = (device.latest_seq || 0) + 1;
    device.latest_seq = seq;
    if (canSendLost) {
      events.push({
        device_id: pole.device_id,
        pole_id: poleId,
        event: 'power_lost',
        energized: false,
        ts: jitterIso(asOf, Math.floor(Math.random() * 8000)),
        seq,
        battery_mv: device.battery_mv - Math.floor(Math.random() * 120),
        rssi: device.rssi,
        fw,
      });
    }
  });

  if (events.length > 2) {
    const duplicates = events.slice(0, 2).map((event) => ({ ...event, ts: jitterIso(event.ts, 5000) }));
    events.push(...duplicates);
  }

  return shuffleTelemetry(events);
}

function jitterIso(iso, jitterMs) {
  return new Date(new Date(iso).getTime() + jitterMs).toISOString();
}

function shuffleTelemetry(events) {
  const copy = [...events];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function repairFault({ network, state, faultId, asOf = new Date().toISOString() }) {
  const faultIndex = state.activeFaults.findIndex((fault) => fault.id === faultId);
  if (faultIndex === -1) {
    return null;
  }

  const fault = state.activeFaults[faultIndex];
  state.activeFaults.splice(faultIndex, 1);

  const telemetry = [];
  fault.affectedPoles.forEach((poleId) => {
    const pole = network.polesById[poleId];
    if (!pole || !pole.device_id) {
      return;
    }

    const device = network.deviceByPole[poleId];
    const bootSeq = (device.latest_seq || 0) + 1;
    device.latest_seq = bootSeq + 1;
    telemetry.push({
      device_id: pole.device_id,
      pole_id: poleId,
      event: 'boot',
      energized: true,
      ts: jitterIso(asOf, Math.floor(Math.random() * 5000)),
      seq: bootSeq,
      battery_mv: device.battery_mv,
      rssi: device.rssi,
      fw: device.fw,
    });
    telemetry.push({
      device_id: pole.device_id,
      pole_id: poleId,
      event: 'power_restored',
      energized: true,
      ts: jitterIso(asOf, 5000 + Math.floor(Math.random() * 3000)),
      seq: bootSeq + 1,
      battery_mv: device.battery_mv + 80,
      rssi: device.rssi,
      fw: device.fw,
    });
  });

  ingestTelemetryBatch({ network, state, batch: telemetry, asOf });
  return fault;
}

function simulateNoise({ network, state, kind, targetId, asOf = new Date().toISOString() }) {
  const events = [];

  if (kind === 'duplicate') {
    const sample = Object.values(state.observations).slice(0, 5);
    sample.forEach((entry) => {
      events.push({
        ...entry,
        ts: jitterIso(asOf, 2000),
      });
      events.push({
        ...entry,
        ts: jitterIso(asOf, 1000),
      });
    });
  }

  if (kind === 'dead-sensor') {
    const pole = network.poles.find((candidate) => candidate.device_id && candidate.dt_id === targetId);
    if (pole) {
      const device = network.deviceByPole[pole.pole_id];
      device.online = false;
      events.push({
        device_id: pole.device_id,
        pole_id: pole.pole_id,
        event: 'heartbeat',
        energized: true,
        ts: asOf,
        seq: (device.latest_seq || 0) + 1,
        battery_mv: device.battery_mv,
        rssi: device.rssi,
        fw: device.fw,
      });
    }
  }

  if (kind === 'scheduled-outage') {
    const entry = {
      id: `SO-${Date.now()}`,
      scope: targetId.scope,
      target_id: targetId.target_id,
      start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
      reason: 'Planned maintenance - test injection',
    };
    state.scheduledOutages.push(entry);
  }

  ingestTelemetryBatch({ network, state, batch: events, asOf });
  return events.length;
}

function ingestTelemetryBatch({ network, state, batch, asOf = new Date().toISOString() }) {
  const accepted = [];
  batch.forEach((event) => {
    const existing = state.observations[event.pole_id];
    if (existing && event.seq < existing.seq) {
      state.metrics.stale += 1;
      return;
    }

    if (existing && event.seq === existing.seq && existing.event === event.event && existing.energized === event.energized) {
      state.metrics.duplicates += 1;
      return;
    }

    state.observations[event.pole_id] = {
      ...event,
      received_at: asOf,
    };
    state.telemetry.push({
      ...event,
      received_at: asOf,
    });
    accepted.push(event);

    const device = network.deviceByPole[event.pole_id];
    if (device) {
      device.latest_seq = Math.max(device.latest_seq || 0, event.seq);
      device.online = true;
    }
  });

  state.metrics.ingested += accepted.length;
  return accepted;
}

module.exports = {
  simulateFault,
  simulateNoise,
  repairFault,
  ingestTelemetryBatch,
};
