// Measured idle compute has a cost even when a generous budget would hide it.
export function efficiencyOf(S) {
  const out = [];
  for (const n of S.model.nodes) {
    const i = n.i;
    if (n.elastic || !n.hasCap || !n.el.knobs?.includes('units') || !n.el.cost?.perUnit || !(S.peakUtil[i] < 0.35)) continue;
    const installed = S.peakInstalledUnits[i] || n.units;
    if (!(installed > 0)) continue;
    const needed = Math.max(n.el.units.min, n.zones || 1, 2, Math.ceil(S.peakUtil[i] * installed / 0.7));
    const floor = S.unitsLo[i];
    if (!Number.isFinite(floor)) continue;
    if (floor <= needed * 1.5 || floor - needed < 2) continue;
    const perUnit = n.el.cost.perUnit * n.tierCost;
    const saving = Math.round((floor - needed) * perUnit);
    if (saving < 20) continue;
    out.push({ nodeId: n.id, label: n.g.label || n.el.name, units: floor, suggestedUnits: needed, peakUtil: S.peakUtil[i], savingPerMonth: saving });
  }
  return out.sort((a,b) => b.savingPerMonth - a.savingPerMonth);
}

export function efficiencyLoss(items, cost, weight = 200) {
  const saving = items.reduce((sum, item) => sum + item.savingPerMonth, 0);
  return saving > 0 ? Math.max(1, Math.min(weight / 2, Math.round(weight * saving / Math.max(1, cost)))) : 0;
}
