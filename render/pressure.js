// Presentation of measured queue pressure; no simulation or invented message histories.
const compact = new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:1 });
export const count = n => compact.format(Math.max(0,n||0));
export function ageLabel(seconds) {
  if(seconds<60)return `${Math.round(seconds)}s`;
  if(seconds<3600)return `${Math.floor(seconds/60)}m`;
  return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
}
export function queuePressure(state={}) {
  const age=Math.max(0,state.oldestJobAgeSec||0),limit=Math.max(1,state.queueLimitSec||1);
  const net=(state.queueAcceptedRps||0)-(state.queueDrainRps||0);
  return {fill:Math.min(1,age/limit),late:age>limit,net,
    text:`${count(state.queueDepth)} waiting\nOldest ${ageLabel(age)} / ${ageLabel(limit)}\n${net>=0?'+':'−'}${count(Math.abs(net))}/s ${state.queueDepth>0?(net>=0?'growing':'draining'):'net'}`};
}
