const $ = selector => document.querySelector(selector);
// A DOM id named 'notch' also creates window.notch in plain browsers.
const desktopAPI = window.notch && typeof window.notch.get === 'function' ? window.notch : null;
const api = desktopAPI || {
  get: async () => ({ state:'idle',expanded:true,preview:'A little help, without leaving what you’re doing.' }),
  action: async () => { render({ ...snapshot, preview:'Desktop controls are available in the Windows app only.' }); },
  expand: async expanded => render({ ...snapshot,expanded }), onEvent: () => {}
};
if (!desktopAPI) document.body.classList.add('preview-page');
let snapshot = { state:'idle',expanded:false }, collapseTimer;
const titles = { idle:"Hey, I'm here",starting:'Starting microphone…',listening:'Listening — go ahead',dictating:'Dictating to your app',thinking:'Thinking with you…',speaking:'Speaking…',working:'Working on your task…',approval:'Your permission, first' };
function render(data) {
  snapshot = data;
  const busy = data.state !== 'idle';
  $('#status').textContent = titles[data.state] || data.state;
  $('#details').hidden = !data.expanded;
  $('#expand').setAttribute('aria-expanded', String(data.expanded));
  $('#notch').classList.toggle('busy',busy);
  $('#notch').classList.toggle('expanded',data.expanded);
  $('#preview').textContent = data.preview || (data.state === 'starting' ? 'Wait a moment while Windows opens the microphone…' : data.state === 'listening' ? 'Speak your question, then pause to finish.' : data.state === 'approval' ? 'Open Chat to review the full action and allow or deny it.' : 'Ask about your screen, or let me lend a hand.');
  $('#preview').classList.toggle('error',data.kind === 'error');
  $('#mode-label').textContent = data.state === 'listening' || data.state === 'dictating' ? 'MICROPHONE IS ON' : 'YOUR DESKTOP PLUS ONE';
  $('#stop').hidden = !busy;
  $('#quick-talk').textContent = busy ? '■' : '♩';
  $('#quick-talk').setAttribute('aria-label',busy ? 'Stop current task' : 'Start voice input');
  $('#hint').textContent = data.state === 'approval' ? 'Approvals are only in the full panel' : busy ? 'Ctrl + Shift + X to stop' : 'Speak after “Listening” appears';
  document.querySelectorAll('[data-action="talk"], [data-action="agent"], [data-action="dictate"]').forEach(button => button.disabled=busy);
}
async function action(name) { try { const result=await api.action(name); if (result?.error) throw Error(result.error); } catch(e) { render({...snapshot,preview:e.message,kind:'error'}); } }
async function expand(value) { try { await api.expand(value); } catch(e) { render({...snapshot,preview:e.message,kind:'error'}); } }
$('#expand').onclick=()=>expand(true);
$('#collapse').onclick=()=>expand(false);
$('#quick-talk').onclick=()=>action(snapshot.state==='idle'?'talk':'stop');
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>action(button.dataset.action));
$('#notch').onmouseenter=()=>{clearTimeout(collapseTimer);expand(true);};
$('#notch').onmouseleave=()=>{collapseTimer=setTimeout(()=>{if(snapshot.state==='idle' && snapshot.kind!=='error')expand(false);},600);};
api.onEvent(render);
api.get().then(render).catch(e=>render({...snapshot,preview:e.message,kind:'error'}));
