function createPrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(prng, values) {
  return values[Math.floor(prng() * values.length)];
}

function shuffle(prng, values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(prng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  createPrng,
  pick,
  shuffle,
  clamp,
};
