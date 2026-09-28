'use strict';
// Front-end preview ownership only; this is not a replacement for server authorization.
const ownCaptainApproval=commands.approve;
commands.approve=b=>{if(role!=='captain'||Number(b.dataset.id)!==2){toast('该签署需由对应部长独立完成。');return;}ownCaptainApproval(b)};
commands['finance-approve']=()=>toast('产业部长与国家队长须在各自席位确认。');
function showSeatBoundaries(){document.querySelectorAll('[data-cmd=finance-approve],[data-operation=finance-approve]').forEach(b=>{b.disabled=true;b.textContent=(s.approvals[Number(b.dataset.id)]?'已有样例确认 · ':'待签署 · ')+['产业部长','国家队长'][Number(b.dataset.id)];});if(role==='captain')document.querySelectorAll('[data-cmd=approve],[data-operation=approve]').forEach(b=>{const i=Number(b.dataset.id);if(i!==2){b.disabled=true;b.textContent=(s.approvals[i]?'已有样例确认 · ':'待签署 · ')+['财政部长','社会部长'][i];}else if(!s.approvals[i]){b.innerHTML='国家队长<small>本职签署</small>';}});}
const seatPatch=patchSceneHTML;patchSceneHTML=function(html){seatPatch(html);showSeatBoundaries()};
const seatReady=setInterval(()=>{if(!window.GameTest)return;clearInterval(seatReady);showSeatBoundaries()},50);
// A preview URL selects one operator at entry; in-game navigation never changes that operator.
const operatorSeat=role;
commands.roles=commands.switch=()=>toast('当前页面不切换操作者身份。');
const operatorRoute=routeFromHash;
routeFromHash=function(hash=location.hash){const bits=hash.slice(1).split('/'),target=bits[0]==='action'?Object.keys(roles).find(r=>roles[r].code===catalog?.modules.find(m=>m.id===bits[1])?.role):['journey','office','location','scene'].includes(bits[0])?bits[1]:operatorSeat;if(target&&target!==operatorSeat){if(countryScope)countryHome();else goJourney('brief',0);return;}operatorRoute(hash);};
