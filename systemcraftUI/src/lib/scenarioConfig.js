export const SCENARIO_SERVICES = {
  url_shortener: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 'redis',
        name: 'Redis',
        port: ':6379',
        meta: ['cache', '64MB'],
        addState: 'state1_cache',
        removeState: 'state0_baseline',
        presentIn: ['state1_cache', 'state2_thundering_herd', 'state3_hotkey'],
      },
    ],
  },

  write_scaling: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 'redis',
        name: 'Redis',
        port: ':6379',
        meta: ['queue', '64MB'],
        addState: 'state1_queue',
        removeState: 'state0_baseline',
        presentIn: ['state1_queue', 'state2_backpressure', 'state3_dlq'],
      },
      {
        id: 'cassandra',
        name: 'Cassandra',
        port: ':9042',
        meta: ['LSM', 'write-opt'],
        addState: 'state2_backpressure',
        removeState: 'state1_queue',
        presentIn: ['state2_backpressure', 'state3_dlq'],
      },
    ],
  },

  fan_out: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 'redis',
        name: 'Redis',
        port: ':6379',
        meta: ['fan-out', '64MB'],
        addState: 'state1_fanout',
        removeState: 'state0_baseline',
        presentIn: ['state1_fanout', 'state2_write_amp', 'state3_eventual'],
      },
    ],
  },

  rate_limiting: {
    core: ['client', 'app', 'redis'],
    addable: [],
  },

  blob_store: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 's3',
        name: 'S3 (LocalStack)',
        port: ':4566',
        meta: ['object store', 'local'],
        addState: 'state1_presigned',
        removeState: 'state0_baseline',
        presentIn: ['state1_presigned', 'state2_multipart', 'state3_cdn'],
      },
    ],
  },

  stream_proc: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 'kafka',
        name: 'Kafka',
        port: ':9092',
        meta: ['broker', '3 partitions'],
        addState: 'state1_partitions',
        removeState: 'state0_baseline',
        presentIn: ['state1_partitions', 'state2_at_least_once', 'state3_offsets'],
      },
    ],
  },

  search: {
    core: ['client', 'app', 'postgres'],
    addable: [
      {
        id: 'elasticsearch',
        name: 'Elasticsearch',
        port: ':9200',
        meta: ['search', '1 shard'],
        addState: 'state1_inverted',
        removeState: 'state0_baseline',
        presentIn: ['state1_inverted', 'state2_relevance', 'state3_lag'],
      },
    ],
  },

  consistency: {
    core: ['client', 'app', 'postgres'],
    addable: [],
  },
}

export function getAddableServices(scenario, currentState) {
  const cfg = SCENARIO_SERVICES[scenario]
  if (!cfg) return []
  return cfg.addable.filter(svc => !svc.presentIn.includes(currentState))
}

export function getRemovableServices(scenario, currentState) {
  const cfg = SCENARIO_SERVICES[scenario]
  if (!cfg) return []
  return cfg.addable.filter(svc => svc.presentIn.includes(currentState))
}

export function isCoreSevice(scenario, nodeId) {
  const cfg = SCENARIO_SERVICES[scenario]
  if (!cfg) return true
  return cfg.core.includes(nodeId)
}
