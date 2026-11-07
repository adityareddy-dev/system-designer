// Small labelled reading diagrams. The diagrams supplement, rather than replace, the explanation.
import { h } from './dom.js';
export function lessonVisualStyles(){
 if(document.querySelector('[data-lesson-visuals]'))return;
 const style=h('style',{'data-lesson-visuals':'',text:`
 .sh-reading-figure{margin:0;display:grid;gap:12px;padding:20px;border:1px solid var(--border-strong);border-radius:8px;background:var(--canvas)}
 .sh-reading-figure figcaption{font:12px var(--font-mono);color:var(--cat-compute);letter-spacing:.04em}
 .sh-reading-parts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
 .sh-reading-parts li{position:relative;border-top:2px solid var(--accent);padding-top:12px;display:grid;align-content:start;gap:6px;min-width:0}
 .sh-reading-parts li+li:before{content:'→';position:absolute;left:-20px;top:8px;color:var(--text-3)}
 .sh-reading-parts strong{font:600 18px var(--font-display);color:var(--text)}
 .sh-reading-parts span{font-size:14px;line-height:1.5;color:var(--text-2)}
 .sh-estimate-form{display:grid;gap:16px;padding:24px;border:1px solid var(--border-strong);background:var(--canvas);border-radius:8px}
 .sh-estimate-form label{display:grid;gap:8px}.sh-estimate-form .sh-input{width:100%;max-width:360px}
 .sh-estimate-receipt{border-left:3px solid var(--cat-compute);padding-left:12px;font-size:14px;color:var(--text-2)}
 .sh-demo-stage[hidden],.sh-demo-guidance[hidden],.sh-estimate-form[hidden],.sh-estimate-receipt[hidden],.sh-lp-card--demo .sh-btn[hidden]{display:none}
 @media(max-width:719px){.sh-reading-figure{padding:16px}.sh-reading-parts{grid-template-columns:1fr;gap:22px}.sh-reading-parts li+li:before{content:'↓';left:auto;right:4px;top:-23px}.sh-estimate-form{padding:16px}}
 `});document.head.append(style);
}
export function readingDiagram(diagram){
 return h('figure',{class:'sh-reading-figure'},h('figcaption',{text:diagram.label}),
  h('ol',{class:'sh-reading-parts'},diagram.parts.map(([label,detail])=>h('li',null,h('strong',{text:label}),h('span',{text:detail})))));
}
