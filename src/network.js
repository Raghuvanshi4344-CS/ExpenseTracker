const { createPrng, pick, shuffle, clamp } = require('./prng');
const { metersToLat, metersToLon, createId } = require('./utils');

const BASE_LAT = 12.94;
const BASE_LON = 77.55;
const FEEDER_NAMES = ['F-07-01', 'F-07-02', 'F-07-03', 'F-08-01'];
const PICOINCODE_POOL = ['560001', '560002', '560003', '560004', '560005', '560006', '560007', '560008', '560009', '560010'];
const WARD_POOL = ['W-081', 'W-082', 'W-083', 'W-084', 'W-085', 'W-086', 'W-087'];
const POLE_TYPES = ['LT-8m-Steel', 'LT-9m-PCC', 'LT-9m-Steel', 'LT-11m-PCC'];

function generateNetwork(seed = 42) {
  const prng = createPrng(seed);
  const feeders = [];
  const dts = [];
  const poles = [];
  const polesById = {};
  const feederIndex = {};
  const dtIndex = {};
  const truthParentByPole = {};
  const truthChildrenByPole = {};
  const deviceByPole = {};
  const topologyKnownByDt = {};

  let poleCounter = 1;
  let dtCounter = 1;

  FEEDER_NAMES.forEach((feederId, feederIndexNumber) => {
    const feeder = {
      feeder_id: feederId,
      dt_ids: [],
    };

    const dtCount = feederIndexNumber === 0 ? 8 : feederIndexNumber === 1 ? 8 : feederIndexNumber === 2 ? 9 : 7;
    const feederLat = BASE_LAT + feederIndexNumber * 0.015;
    const feederLon = BASE_LON + feederIndexNumber * 0.018;

    for (let dtOffset = 0; dtOffset < dtCount; dtOffset += 1) {
      const dtId = createId('D', dtCounter, 4);
      const dtLat = feederLat + (prng() - 0.5) * 0.014 + dtOffset * 0.002;
      const dtLon = feederLon + (prng() - 0.5) * 0.014 + dtOffset * 0.001;
      const topologyKnown = prng() > 0.6;
      const householdsServed = 180 + Math.floor(prng() * 240);
      const capacityKva = householdsServed > 300 ? 250 : householdsServed > 220 ? 160 : 100;

      const dt = {
        dt_id: dtId,
        feeder_id: feederId,
        lat: Number(dtLat.toFixed(6)),
        lon: Number(dtLon.toFixed(6)),
        capacity_kva: capacityKva,
        households_served: householdsServed,
      };

      const line = buildDtLine({
        prng,
        dt,
        knownTopology: topologyKnown,
        poleCounterRef: () => poleCounter,
        nextPoleCounter: () => {
          const current = poleCounter;
          poleCounter += 1;
          return current;
        },
      });

      line.poles.forEach((pole) => {
        poles.push(pole);
        polesById[pole.pole_id] = pole;
        truthParentByPole[pole.pole_id] = line.truthParentByPole[pole.pole_id] ?? null;
        truthChildrenByPole[pole.pole_id] = line.truthChildrenByPole[pole.pole_id] || [];
        if (pole.device_id) {
          deviceByPole[pole.pole_id] = {
            device_id: pole.device_id,
            fw: line.deviceFirmwareByPole[pole.pole_id],
            battery_mv: 3400 + Math.floor(prng() * 120),
            rssi: -64 - Math.floor(prng() * 42),
            online: true,
            latest_seq: 0,
          };
        }
      });

      feeder.dt_ids.push(dtId);
      dts.push({
        ...dt,
        topology_known: topologyKnown,
        root_pole_id: line.rootPoleId,
      });
      dtIndex[dtId] = {
        ...dt,
        topology_known: topologyKnown,
        root_pole_id: line.rootPoleId,
        pole_ids: line.poles.map((pole) => pole.pole_id),
      };
      topologyKnownByDt[dtId] = topologyKnown;
      dtCounter += 1;
    }

    feeders.push(feeder);
    feederIndex[feederId] = feeder;
  });

  const scheduledOutages = makeScheduledOutages({ dts, prng });

  return {
    seed,
    feeders,
    dts,
    poles,
    polesById,
    feederIndex,
    dtIndex,
    truthParentByPole,
    truthChildrenByPole,
    deviceByPole,
    topologyKnownByDt,
    scheduledOutages,
  };
}

function buildDtLine({ prng, dt, knownTopology, nextPoleCounter }) {
  const rootPoleId = `P-${String(nextPoleCounter()).padStart(6, '0')}`;
  const rootAngle = (prng() * Math.PI * 2) - Math.PI;
  const mainLength = 26 + Math.floor(prng() * 55);
  const branchCount = 1 + Math.floor(prng() * 4);
  const nodes = [];
  const truthParentByPole = {};
  const truthChildrenByPole = {};
  const deviceFirmwareByPole = {};

  let seq = 1;
  const rootPole = createPole({
    poleId: rootPoleId,
    lat: dt.lat + metersToLat(26 * Math.cos(rootAngle)),
    lon: dt.lon + metersToLon(26 * Math.sin(rootAngle), dt.lat),
    feederId: dt.feeder_id,
    dtId: dt.dt_id,
    seqOnLine: knownTopology ? seq : '',
    parentPoleId: knownTopology ? '' : '',
    poleType: pick(prng, POLE_TYPES),
    ward: pick(prng, WARD_POOL),
    pincode: prng() < 0.03 ? '' : pick(prng, PICOINCODE_POOL),
    device_id: prng() < 0.91 ? `KSPDB-${dt.dt_id}-${String(seq).padStart(4, '0')}` : '',
  });
  nodes.push(rootPole);
  truthChildrenByPole[rootPoleId] = [];
  if (rootPole.device_id) {
    deviceFirmwareByPole[rootPoleId] = prng() < 0.08 ? '1.2.9' : '1.4.2';
  }

  let chain = [rootPole];
  let currentParent = rootPole;
  let currentLat = rootPole.lat;
  let currentLon = rootPole.lon;
  const branchAnchors = [];

  for (let index = 0; index < mainLength; index += 1) {
    seq += 1;
    const stepMeters = 32 + prng() * 18;
    const bearingJitter = (prng() - 0.5) * 0.35;
    const bearing = rootAngle + bearingJitter;
    currentLat += metersToLat(stepMeters * Math.cos(bearing));
    currentLon += metersToLon(stepMeters * Math.sin(bearing), currentLat);
    const poleId = `P-${String(nextPoleCounter()).padStart(6, '0')}`;
    const pole = createPole({
      poleId,
      lat: currentLat,
      lon: currentLon,
      feederId: dt.feeder_id,
      dtId: dt.dt_id,
      seqOnLine: knownTopology ? seq : '',
      parentPoleId: knownTopology ? currentParent.pole_id : '',
      poleType: pick(prng, POLE_TYPES),
      ward: pick(prng, WARD_POOL),
      pincode: prng() < 0.03 ? '' : pick(prng, PICOINCODE_POOL),
      device_id: prng() < 0.91 ? `KSPDB-${dt.dt_id}-${String(seq).padStart(4, '0')}` : '',
    });
    nodes.push(pole);
    truthChildrenByPole[currentParent.pole_id] = truthChildrenByPole[currentParent.pole_id] || [];
    truthChildrenByPole[currentParent.pole_id].push(poleId);
    truthParentByPole[poleId] = currentParent.pole_id;
    truthChildrenByPole[poleId] = [];
    if (pole.device_id) {
      deviceFirmwareByPole[poleId] = prng() < 0.08 ? '1.2.9' : '1.4.2';
    }
    currentParent = pole;
    chain.push(pole);
    branchAnchors.push(pole);
  }

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const anchor = branchAnchors[Math.floor(prng() * branchAnchors.length)];
    let branchParent = anchor;
    let branchLat = anchor.lat;
    let branchLon = anchor.lon;
    const branchLength = 5 + Math.floor(prng() * 14);
    const branchAngle = rootAngle + (branchIndex % 2 === 0 ? 1 : -1) * (0.9 + prng() * 0.7);

    for (let branchStep = 0; branchStep < branchLength; branchStep += 1) {
      seq += 1;
      const stepMeters = 28 + prng() * 14;
      branchLat += metersToLat(stepMeters * Math.cos(branchAngle + (prng() - 0.5) * 0.18));
      branchLon += metersToLon(stepMeters * Math.sin(branchAngle + (prng() - 0.5) * 0.18), branchLat);
      const poleId = `P-${String(nextPoleCounter()).padStart(6, '0')}`;
      const pole = createPole({
        poleId,
        lat: branchLat,
        lon: branchLon,
        feederId: dt.feeder_id,
        dtId: dt.dt_id,
        seqOnLine: knownTopology ? seq : '',
        parentPoleId: knownTopology ? branchParent.pole_id : '',
        poleType: pick(prng, POLE_TYPES),
        ward: pick(prng, WARD_POOL),
        pincode: prng() < 0.03 ? '' : pick(prng, PICOINCODE_POOL),
        device_id: prng() < 0.91 ? `KSPDB-${dt.dt_id}-${String(seq).padStart(4, '0')}` : '',
      });
      nodes.push(pole);
      truthChildrenByPole[branchParent.pole_id] = truthChildrenByPole[branchParent.pole_id] || [];
      truthChildrenByPole[branchParent.pole_id].push(poleId);
      truthParentByPole[poleId] = branchParent.pole_id;
      truthChildrenByPole[poleId] = [];
      if (pole.device_id) {
        deviceFirmwareByPole[poleId] = prng() < 0.08 ? '1.2.9' : '1.4.2';
      }
      branchParent = pole;
    }
  }

  return {
    rootPoleId,
    poles: nodes,
    truthParentByPole,
    truthChildrenByPole,
    deviceFirmwareByPole,
  };
}

function createPole({ poleId, lat, lon, feederId, dtId, seqOnLine, parentPoleId, poleType, ward, pincode, device_id }) {
  return {
    pole_id: poleId,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    feeder_id: feederId,
    dt_id: dtId,
    seq_on_line: seqOnLine,
    parent_pole_id: parentPoleId,
    pole_type: poleType,
    ward,
    pincode,
    device_id,
  };
}

function makeScheduledOutages({ dts, prng }) {
  const outages = [];
  const feederTargets = shuffle(prng, [...new Set(dts.map((dt) => dt.feeder_id))]).slice(0, 2);
  const dtTargets = shuffle(prng, [...dts.map((dt) => dt.dt_id)]).slice(0, 4);

  feederTargets.forEach((feederId, index) => {
    const start = new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + (index + 1) * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString();
    outages.push({
      id: `SO-F-${index + 1}`,
      scope: 'feeder',
      target_id: feederId,
      start,
      end,
      reason: 'Planned maintenance - jumper replacement',
    });
  });

  dtTargets.forEach((dtId, index) => {
    const start = new Date(Date.now() + (index + 2) * 90 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + (index + 2) * 90 * 60 * 1000 + 60 * 60 * 1000).toISOString();
    outages.push({
      id: `SO-D-${index + 1}`,
      scope: 'dt',
      target_id: dtId,
      start,
      end,
      reason: 'Load shedding',
    });
  });

  return outages;
}

module.exports = {
  generateNetwork,
};
