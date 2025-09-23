const EVENT_SEMVER = '1.0.0';
const SNAPSHOT_THRESHOLD = 200;
const MAX_MESSAGE_SIZE = 10000;

function generateId(prefix = '') {
  const core = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}${core}` : core;
}

function makeEvent(op, payload, actor, refs = []) {
  return {
    id: generateId('evt-'),
    op,
    payload,
    actor: actor || 'system',
    refs,
    at: Date.now(),
    semver: EVENT_SEMVER
  };
}
