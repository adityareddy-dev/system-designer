// Read-only reference settings, including the defaults used by the engine.
export function referenceSettings(node, catalog, homeRegion = 'us') {
  const el = catalog.elementById.get(node.type);
  const keys = [...new Set(['units', 'zones', 'region', 'tier', ...(el?.knobs || [])])];
  return keys.map((key) => {
    let value;
    if (key === 'units') value = node.units ?? el?.units?.default ?? 1;
    else if (key === 'zones') value = node.zones ?? 1;
    else if (key === 'region') value = !node.region || node.region === 'problem' ? homeRegion : node.region;
    else if (key === 'tier') value = node.tier ?? 'M';
    else value = node.knobs?.[key] ?? (key === 'mode' ? el?.params?.modes?.[0] :
      ['ttlSec', 'retentionDays', 'replication'].includes(key) ? el?.params?.[key] ?? catalog.knobs[key]?.default : catalog.knobs[key]?.default);
    if (value == null) return null;
    if (key === 'region') value = catalog.world.regions.find((r) => r.id === value)?.name || value;
    if (typeof value === 'boolean') value = value ? 'On' : 'Off';
    if (key === 'autoscale') value = value.on ? `${value.min} to ${value.max}, target ${Math.round(value.targetUtil * 100)}% busy` : 'Off';
    return `${catalog.knobs[key]?.label || key}: ${value}`;
  }).filter(Boolean).join(' · ');
}
