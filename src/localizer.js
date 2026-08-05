const { distanceMeters, midpoint } = require('./utils');

function buildTopologyForDt(network, dtId) {
  const dt = network.dtIndex[dtId];
  const poles = network.poles.filter((pole) => pole.dt_id === dtId);
  const parentByPole = {};
  const childrenByPole = {};

  if (dt.topology_known) {
    poles.forEach((pole) => {
      parentByPole[pole.pole_id] = pole.parent_pole_id || null;
      if (!childrenByPole[pole.pole_id]) {
        childrenByPole[pole.pole_id] = [];
      }
    });

    poles.forEach((pole) => {
      const parentId = pole.parent_pole_id || null;
      if (parentId) {
        childrenByPole[parentId] = childrenByPole[parentId] || [];
        childrenByPole[parentId].push(pole.pole_id);
      }
    });
    return { parentByPole, childrenByPole, topologyType: 'recorded' };
  }

  const root = { lat: dt.lat, lon: dt.lon, pole_id: `DT:${dtId}` };
  const sorted = [...poles].sort((a, b) => distanceMeters(root, a) - distanceMeters(root, b));
  const placed = [];

  sorted.forEach((pole, index) => {
    let parent = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const candidateParents = placed.length === 0 ? [] : placed;

    candidateParents.forEach((candidate) => {
      const dist = distanceMeters(candidate, pole);
      const fromRoot = distanceMeters(root, candidate);
      const score = dist + fromRoot * 0.2;
      if (score < bestScore) {
        bestScore = score;
        parent = candidate;
      }
    });

    if (!parent && index === 0) {
      parent = root;
    }

    parentByPole[pole.pole_id] = parent && parent.pole_id ? parent.pole_id : null;
    if (parent) {
      childrenByPole[parent.pole_id] = childrenByPole[parent.pole_id] || [];
      childrenByPole[parent.pole_id].push(pole.pole_id);
    }
    if (!childrenByPole[pole.pole_id]) {
      childrenByPole[pole.pole_id] = [];
    }
    placed.push(pole);
  });

  return { parentByPole, childrenByPole, topologyType: 'inferred' };
}

function summarizeIncident({ network, dtId, parentByPole, childrenByPole, observations, scheduledOutages, asOf }) {
  const dt = network.dtIndex[dtId];
  const poles = network.poles.filter((pole) => pole.dt_id === dtId);
  const observedByPole = new Map();
  poles.forEach((pole) => {
    if (observations[pole.pole_id]) {
      observedByPole.set(pole.pole_id, observations[pole.pole_id]);
    }
  });

  const liveObserved = poles.filter((pole) => observedByPole.get(pole.pole_id)?.energized === true);
  const darkObserved = poles.filter((pole) => observedByPole.get(pole.pole_id)?.energized === false);
  const activePlanned = scheduledOutages.filter((entry) => {
    const start = new Date(entry.start).getTime();
    const end = new Date(entry.end).getTime();
    const time = new Date(asOf).getTime();
    return time >= start && time <= end && (entry.scope === 'feeder' ? entry.target_id === dt.feeder_id : entry.target_id === dtId);
  });

  if (activePlanned.length > 0 && darkObserved.length > 0) {
    return {
      ticketable: false,
      planned: true,
      reason: activePlanned[0].reason,
      scope: activePlanned[0].scope,
    };
  }

  if (darkObserved.length === 0) {
    return { ticketable: false, reason: 'No dark poles observed', planned: false };
  }

  const liveChildrenOfDark = darkObserved.filter((pole) => {
    const children = childrenByPole[pole.pole_id] || [];
    return children.some((childId) => observedByPole.get(childId)?.energized === true);
  });

  if (liveChildrenOfDark.length > 0 && darkObserved.length === 1) {
    const suspect = liveChildrenOfDark[0];
    return {
      ticketable: false,
      sensorFault: true,
      reason: `Isolated dark pole with live downstream children: ${suspect.pole_id}`,
      planned: false,
    };
  }

  const candidateEdges = [];
  const ordered = [...poles].sort((a, b) => {
    const left = Number.isFinite(Number(a.seq_on_line)) ? Number(a.seq_on_line) : Number.MAX_SAFE_INTEGER;
    const right = Number.isFinite(Number(b.seq_on_line)) ? Number(b.seq_on_line) : Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  ordered.forEach((pole) => {
    const state = observedByPole.get(pole.pole_id)?.energized;
    if (state !== true) {
      return;
    }
    const children = childrenByPole[pole.pole_id] || [];
    children.forEach((childId) => {
      const child = network.polesById[childId];
      const childObserved = observedByPole.get(childId)?.energized;
      const darkDescendants = countDarkDescendants(childId, childrenByPole, observedByPole);
      const liveDescendants = countLiveDescendants(childId, childrenByPole, observedByPole);
      if ((childObserved === false || (childObserved === undefined && darkDescendants > 0)) && liveDescendants === 0) {
        candidateEdges.push({ parentId: pole.pole_id, childId, darkDescendants, childObserved, child });
      }
    });
  });

  if (candidateEdges.length === 0) {
    const rootCandidate = poles[0];
    const rootState = observedByPole.get(rootCandidate.pole_id)?.energized;
    if (rootState === false && liveObserved.length === 0) {
      return {
        ticketable: true,
        scope: 'dt',
        assetId: dtId,
        affectedPoles: darkObserved.length,
        confidence: topologyKnownConfidence(dt.topology_known, darkObserved.length, liveObserved.length, true),
        reason: 'Entire transformer subtree is dark',
      };
    }

    return {
      ticketable: false,
      reason: 'Darkness does not form a clean live/dark boundary yet',
      planned: false,
    };
  }

  const primary = candidateEdges.sort((a, b) => a.darkDescendants - b.darkDescendants)[0];
  const fromPole = network.polesById[primary.parentId];
  const toPole = network.polesById[primary.childId];
  const downstream = collectDownstreamDark(primary.childId, childrenByPole, observedByPole);
  const missingPincode = !fromPole?.pincode || !toPole?.pincode;
  const knownTopology = dt.topology_known;
  const confidence = topologyKnownConfidence(knownTopology, downstream.length, liveObserved.length, false) - (missingPincode ? 0.05 : 0);
  const midpointLocation = midpoint(fromPole, toPole);

  return {
    ticketable: true,
    scope: 'span',
    assetId: `${primary.parentId} -> ${primary.childId}`,
    fromPoleId: primary.parentId,
    toPoleId: primary.childId,
    lat: midpointLocation.lat,
    lon: midpointLocation.lon,
    pincode: toPole?.pincode || fromPole?.pincode || dt.pincode || '',
    affectedPoles: downstream.length || 1,
    confidence: Math.max(0.2, Math.min(0.98, confidence)),
    reason: knownTopology ? 'Recorded topology boundary between live and dark poles' : 'Geometry-inferred boundary between live and dark poles',
    topologyKnown: knownTopology,
  };
}

function countDarkDescendants(poleId, childrenByPole, observedByPole) {
  const children = childrenByPole[poleId] || [];
  let count = 0;
  children.forEach((childId) => {
    if (observedByPole.get(childId)?.energized === false) {
      count += 1;
    }
    count += countDarkDescendants(childId, childrenByPole, observedByPole);
  });
  return count;
}

function countLiveDescendants(poleId, childrenByPole, observedByPole) {
  const children = childrenByPole[poleId] || [];
  let count = 0;
  children.forEach((childId) => {
    if (observedByPole.get(childId)?.energized === true) {
      count += 1;
    }
    count += countLiveDescendants(childId, childrenByPole, observedByPole);
  });
  return count;
}

function collectDownstreamDark(poleId, childrenByPole, observedByPole) {
  const result = [];
  const stack = [poleId];
  if (observedByPole.get(poleId)?.energized !== true) {
    result.push(poleId);
  }
  while (stack.length > 0) {
    const current = stack.pop();
    const children = childrenByPole[current] || [];
    children.forEach((childId) => {
      if (observedByPole.get(childId)?.energized !== true) {
        result.push(childId);
      }
      stack.push(childId);
    });
  }
  return [...new Set(result)];
}

function topologyKnownConfidence(topologyKnown, affectedPoles, liveObservedCount, feederFault) {
  let confidence = topologyKnown ? 0.93 : 0.71;
  confidence += Math.min(0.05, affectedPoles * 0.01);
  if (liveObservedCount > 4) {
    confidence += 0.03;
  }
  if (feederFault) {
    confidence -= 0.02;
  }
  return confidence;
}

function localizeIncidents({ network, observations, scheduledOutages, asOf }) {
  const incidents = [];

  network.feeders.forEach((feeder) => {
    const dtSummaries = feeder.dt_ids.map((dtId) => {
      const topology = buildTopologyForDt(network, dtId);
      return {
        dtId,
        topology,
        summary: summarizeIncident({
          network,
          dtId,
          parentByPole: topology.parentByPole,
          childrenByPole: topology.childrenByPole,
          observations,
          scheduledOutages,
          asOf,
        }),
      };
    });

    const feederDark = dtSummaries.every((entry) => entry.summary.ticketable && entry.summary.scope === 'dt' && entry.summary.reason === 'Entire transformer subtree is dark');
    if (feederDark && dtSummaries.some((entry) => entry.summary.ticketable)) {
      const darkPoles = dtSummaries.reduce((sum, entry) => sum + (entry.summary.affectedPoles || 0), 0);
      incidents.push({
        id: `INC-F-${feeder.feeder_id}`,
        scope: 'feeder',
        assetId: feeder.feeder_id,
        feederId: feeder.feeder_id,
        status: 'detected',
        lat: averageDtLat(network, feeder.dt_ids),
        lon: averageDtLon(network, feeder.dt_ids),
        pincode: firstKnownPincode(network, feeder.dt_ids),
        affectedPoles: darkPoles,
        confidence: 0.9,
        reason: 'All downstream DTs are dark, which points to the feeder side',
        topologyKnown: false,
        ticketable: true,
      });
      return;
    }

    dtSummaries.forEach((entry) => {
      if (!entry.summary.ticketable) {
        return;
      }
      incidents.push({
        id: `INC-${entry.dtId}`,
        scope: entry.summary.scope,
        assetId: entry.summary.assetId,
        feederId: feeder.feeder_id,
        dtId: entry.dtId,
        status: 'detected',
        fromPoleId: entry.summary.fromPoleId,
        toPoleId: entry.summary.toPoleId,
        lat: entry.summary.lat,
        lon: entry.summary.lon,
        pincode: entry.summary.pincode || firstKnownPincode(network, [entry.dtId]),
        affectedPoles: entry.summary.affectedPoles,
        confidence: entry.summary.confidence,
        reason: entry.summary.reason,
        topologyKnown: entry.summary.topologyKnown,
        ticketable: true,
      });
    });
  });

  return incidents;
}

function averageDtLat(network, dtIds) {
  const values = dtIds.map((dtId) => network.dtIndex[dtId].lat);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageDtLon(network, dtIds) {
  const values = dtIds.map((dtId) => network.dtIndex[dtId].lon);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstKnownPincode(network, ids) {
  for (const id of ids) {
    const item = network.dtIndex[id] || network.polesById[id];
    if (item && item.pincode) {
      return item.pincode;
    }
  }
  return '';
}

module.exports = {
  buildTopologyForDt,
  localizeIncidents,
  summarizeIncident,
};
