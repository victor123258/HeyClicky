const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let config, mode = 'talk', busy = false, approvalId, activityCount = 0;
const shortcutInfo = { talk: ['Talk to your buddy', 'Press, speak, pause. Get screen-aware help.'], agent: ['Start an agent', 'Speak a task for your buddy to carry out.'], dictate: ['Dictate anywhere', 'Press to start; press again to stop. Types in the active app.'], panel: ['Show or hide panel', 'Your buddy stays running in the tray.'], stop: ['Stop everything', 'Cancel the current request, voice, dictation or agent.'] };
async function call(name, ...args) {
  const result = await window.clicky.call(name, ...args);
  if (!result.ok) throw Error(result.error);
  return result.data;
}
function notify(text) { $('#toast').textContent = text; $('#toast').hidden = false; }
function safeTask(task) { return async (...args) => { try { await task(...args); } catch (e) { notify(e.message); } }; }
function view(name) {
  $$('.view').forEach(v => v.hidden = v.id !== `view-${name}`);
  $$('.nav-item[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  const titles = { chat: ['Conversation', 'A little help, right here'], activity: ['Activity', 'Every step, out in the open'], shortcuts: ['Keyboard shortcuts', 'A keystroke away'], privacy: ['Privacy & safety', 'You are in control'], settings: ['Settings', 'Make it yours'] };
  $('#page-title').textContent = titles[name][0]; $('#page-subtitle').textContent = titles[name][1];
}
function setMode(next) { mode = next; $$('[data-mode]').forEach(b => b.classList.toggle('selected', b.dataset.mode === next)); $('#prompt').placeholder = next === 'agent' ? 'What would you like me to do? Review each action before it runs…' : 'Ask anything about your screen…'; }
function setState(state) {
  busy = state !== 'idle';
  const labels = { idle:'Ready to help',starting:'Starting microphone…',listening:'Listening…',dictating:'Typing your speech…',thinking:'Thinking…',working:'Working on it…',speaking:'Speaking…',approval:'Waiting for your approval' };
  $('#status-label').textContent = labels[state] || state;
  $('#status-dot').style.background = busy ? '#b29ad3' : '#79b791';
  $('#stop').hidden = !busy; $('#send').disabled = busy;
  $('#enter-hint').hidden = busy;
  $('#voice-test').disabled = busy;
  $('#voice-test-stop').hidden = !busy;
  $('#voice').querySelector('span').textContent = state === 'starting' ? 'Opening microphone…' : state === 'listening' ? 'Listening… press to cancel' : 'Talk to Clicky';
  if (state === 'starting') { $('#voice-feedback').hidden=false; $('#voice-feedback').textContent='Opening the Windows default microphone. Wait for “Listening”…'; }

}
function scrollChat() { const el = $('#conversation'); el.scrollTop = el.scrollHeight; }
function message({ role, text, mode: messageMode }) {
  $('#welcome').hidden = true;
  const row = document.createElement('div'); row.className = `message ${role}`;
  const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'Y' : '↖';
  const content = document.createElement('div'); content.className = 'message-content';
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = role === 'user' ? 'You' : 'Clicky';
  const time = document.createElement('small'); time.textContent = (messageMode === 'agent' ? 'AGENT · ' : '') + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); meta.append(time);
  const body = document.createElement('div'); body.className = 'message-text'; body.textContent = text;
  content.append(meta,body); row.append(avatar,content); $('#messages').append(row); scrollChat();
}
function tool(data) {
  const row = document.createElement('div'); row.className='tool-message'; row.textContent = `◇ ${data.name.replaceAll('_',' ')} · ${data.status}`;
  $('#messages').append(row); scrollChat();
  if (activityCount === 0) $('#activity-list').replaceChildren();
  const item = document.createElement('div'); item.className='activity-item'; item.textContent = data.name.replaceAll('_',' ');
  const status = document.createElement('span'); status.textContent = `${data.status} · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`; item.append(status); $('#activity-list').prepend(item);
  $('#activity-count').textContent = String(++activityCount);
}
function showApproval(data) {
  approvalId = data?.id; $('#approval-card').hidden = !data;
  if (data) { view('chat'); $('#approval-name').textContent = data.name.replaceAll('_',' '); $('#approval-args').textContent = JSON.stringify(data.args,null,2); $('#allow').focus(); }
}
function updateConfig(data) {
  config = data;
  $('#edge-window-mode').value=data.edgeWindowMode||'minimized';
  $('#voice-provider').value=data.voiceProvider||'windows';$('#edge-language').value=data.edgeLanguage||'en-US';$('#edge-fallback').checked=data.edgeFallback!==false;$('#edge-options').hidden=$('#voice-provider').value!=='edge';if(data.edgeStatus)renderEdgeStatus(data.edgeStatus);
  $('#model-label').textContent = data.model;
  $('#connection-dot').classList.toggle('connected', data.hasKey);
  $('#key-status').textContent = data.hasKey ? 'Key saved on this PC' : 'Not connected';
  $('#api-key').value = ''; $('#api-key').placeholder = data.hasKey ? '•••••••••••• · leave blank to keep saved key' : 'sk-or-v1-…';
  $('#model').value = data.model; $('#rate').value = data.rate; $('#rate-value').textContent = data.rate;
  for (const [id,key] of Object.entries({speak:'speak',buddy:'buddy','ask-before':'askBeforeActions','start-windows':'startWithWindows','screen-context':'screenContext','notch-enabled':'notch'})) $(`#${id}`).checked = data[key];
  $('#safety-note').hidden = data.askBeforeActions;
  $('#context-hint').textContent = data.screenContext ? 'Display under your cursor · captured on send' : 'Text only · screenshots disabled';
  if (data.voice && ![...$('#voice-select').options].some(o => o.value === data.voice)) { const option = document.createElement('option'); option.value = data.voice; option.textContent = data.voice; $('#voice-select').append(option); }
  $('#voice-select').value = data.voice;
  const language=data.speechLanguage || '';
  if (language && ![...$('#speech-language').options].some(o=>o.value===language)) { const o=document.createElement('option'); o.value=language; o.textContent=language; $('#speech-language').append(o); }
  $('#speech-language').value=language;
  $('#shortcut-list').replaceChildren(); $('#hotkey-fields').replaceChildren();
  for (const [key, [title, description]] of Object.entries(shortcutInfo)) {
    const row = document.createElement('div'); row.className='shortcut-row'; const left = document.createElement('div'), heading = document.createElement('strong'), desc = document.createElement('p'); heading.textContent=title; desc.textContent=description; left.append(heading,desc);
    const combo=document.createElement('div'); combo.className='key-combo';
    for (const part of data.hotkeys[key].replace('CommandOrControl','Ctrl').split('+')) { const kbd=document.createElement('kbd'); kbd.textContent=part; combo.append(kbd); }
    row.append(left,combo); $('#shortcut-list').append(row);
    const field = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'); input.id=`hotkey-${key}`; input.value=data.hotkeys[key]; input.maxLength=80; label.htmlFor=input.id; label.textContent=title; field.append(label,input); $('#hotkey-fields').append(field);
  }
}
function renderEdgeStatus(data){if(config)config.edgeBackground=Boolean(data.backgroundAllowed);$('#edge-status').textContent=(data.connected?'Connected. ':'Not connected. ')+(data.backgroundAllowed?'Automatic minimized launches enabled. ':'Automatic minimized launches off. ')+(data.detail||'');$('#edge-disable').hidden=!data.backgroundAllowed;}
window.clicky.onEvent(({ type, data }) => {
  if(type==='edge-status')renderEdgeStatus(data);
  if (type === 'voice-notice') { notify(data); $('#microphone-result').textContent=data; }
  if (type === 'state') setState(data);
  if (type === 'message') message(data);
  if (type === 'error') { notify(data); if ($('#voice-feedback').textContent || busy) { $('#voice-feedback').hidden=false; $('#voice-feedback').textContent=data; $('#microphone-result').textContent=data; } }
  if (type === 'voice-ready') {
    const text=`Listening${data.provider ? ' · '+data.provider : ''}${data.language ? ' · '+data.language : ''}. Speak now, then pause to finish.`;
    $('#voice-feedback').hidden=false; $('#voice-feedback').textContent=text; $('#microphone-result').textContent=text;
  }
  if (type === 'voice-heard') { $('#voice-feedback').hidden=false; $('#voice-feedback').textContent='Heard: '+data; $('#microphone-result').textContent='Heard: '+data; }
  if (type === 'voice-test-result') $('#microphone-result').textContent='✓ Microphone test complete. Heard: '+data;

  if (type === 'tool') tool(data);
  if (type === 'approval') showApproval(data);
  if (type === 'settings-open') view('settings');
  if (type === 'cleared') { $('#messages').replaceChildren(); $('#welcome').hidden=false; $('#voice-feedback').hidden=true; $('#voice-feedback').textContent=''; showApproval(null); }
  if (type === 'dictation') tool({name:'dictation',status:'typed (text not retained)'});
});
$$('[data-view]').forEach(b => b.onclick = () => view(b.dataset.view));
$('.brand').onclick = e => { e.preventDefault(); view('chat'); };
$$('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$$('.suggestion').forEach(b => b.onclick = () => {
  view('chat'); if (b.dataset.agentCard) { setMode('agent'); $('#prompt').value=''; } else { setMode('talk'); $('#prompt').value=b.dataset.prompt; }
  $('#prompt').focus();
});
$('#toast').onclick = () => $('#toast').hidden = true;
$('#composer').onsubmit = safeTask(async e => {
  e.preventDefault(); if (busy) return;
  const text=$('#prompt').value.trim(); if (!text) return;
  if (!config.hasKey && !window.clicky.demo) { view('settings'); notify('Add your OpenRouter key and save settings to get started.'); return; }
  setState('thinking');
  try { await call('ask',text,mode); $('#prompt').value=''; } catch(e) { setState('idle'); throw e; }
});
$('#prompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } };
$('#voice').onclick = safeTask(() => call('listen',mode));
$('#dictate').onclick = safeTask(() => call('dictate'));
$('#stop').onclick = safeTask(() => call('stop'));
$('#hide').onclick = safeTask(() => call('hide'));
$('#clear').onclick = safeTask(() => call('clear'));
$('#allow').onclick = safeTask(() => call('approval',approvalId,true));
$('#deny').onclick = safeTask(() => call('approval',approvalId,false));
$('#github-link').onclick = safeTask(() => call('open-link','github'));
$('#privacy-link').onclick = safeTask(() => call('open-link','privacy'));
$('#get-key').onclick = safeTask(() => call('open-link','key'));
$('#delete-data').onclick = safeTask(() => call('delete-data'));
$('#rate').oninput = () => $('#rate-value').textContent = $('#rate').value;
$('#ask-before').onchange = () => $('#safety-note').hidden = $('#ask-before').checked;
$('#test-key').onclick = safeTask(async () => {
  $('#test-key').disabled=true; $('#test-result').textContent='Testing saved model…';
  try { $('#test-result').textContent=await call('test-key'); } catch(e) { $('#test-result').textContent=e.message; }
  finally { $('#test-key').disabled=false; }
});
$('#voice-provider').onchange=()=>$('#edge-options').hidden=$('#voice-provider').value!=='edge';
$('#edge-background').onclick=safeTask(async()=>renderEdgeStatus(await call('edge-background')));
$('#edge-setup').onclick=safeTask(async()=>renderEdgeStatus(await call('edge-setup')));
$('#edge-close').onclick=safeTask(async()=>renderEdgeStatus(await call('edge-close')));
$('#edge-disable').onclick=safeTask(async()=>{const saved=await call('save-settings',{...config,edgeBackground:false});config.edgeBackground=saved.edgeBackground;renderEdgeStatus(await call('edge-status'));});
$('#voice-test').onclick = safeTask(async () => { $('#microphone-result').textContent='Starting microphone test…'; await call('voice-test'); });
$('#voice-test-stop').onclick = safeTask(() => call('stop'));
$$('[data-audio-settings]').forEach(button=>button.onclick=safeTask(()=>call('windows-audio-settings',button.dataset.audioSettings)));
$('#speech-diagnostics').onclick = safeTask(async () => {
  const report=await call('speech-diagnostics');
  const select=$('#speech-language'); select.replaceChildren();
  const automatic=document.createElement('option'); automatic.value=''; automatic.textContent='Automatic · installed Windows language'; select.append(automatic);
  for(const language of report.languages.filter((l,i,all)=>all.findIndex(v=>v.id===l.id)===i)) { const option=document.createElement('option'); option.value=language.id; option.textContent=`${language.name} (${language.id})`; select.append(option); }
  select.value=config.speechLanguage || '';
  $('#microphone-result').textContent=report.languages.length ? 'Installed recognition languages: '+report.languages.map(l=>l.id).join(', ')+'. Select one, save settings, then test your microphone.' : 'No Windows speech recognition engine found. Install a Speech language pack under Windows Settings → Time & language → Language & region → Language options. Speaking voices alone are not sufficient.';
});
$('#load-voices').onclick = safeTask(async () => {
  const voices=await call('voices'); const select=$('#voice-select'); select.replaceChildren();
  for (const name of ['', ...voices]) { const option=document.createElement('option'); option.value=name; option.textContent=name || 'Windows default'; select.append(option); }
  select.value=config.voice;
});
$('#settings-form').onsubmit = safeTask(async e => {
  e.preventDefault();
  const value={ ...config, model:$('#model').value.trim(),voice:$('#voice-select').value,speechLanguage:$('#speech-language').value,voiceProvider:$('#voice-provider').value,edgeWindowMode:$('#edge-window-mode').value,edgeLanguage:$('#edge-language').value.trim(),edgeFallback:$('#edge-fallback').checked,notch:$('#notch-enabled').checked,rate:Number($('#rate').value),speak:$('#speak').checked,buddy:$('#buddy').checked,askBeforeActions:$('#ask-before').checked,startWithWindows:$('#start-windows').checked,screenContext:$('#screen-context').checked,hotkeys:{} };
  for (const key of Object.keys(shortcutInfo)) value.hotkeys[key]=$(`#hotkey-${key}`).value.trim();
  const key=$('#api-key').value.trim() || undefined;
  const saved=await call('save-settings',value,key); updateConfig(saved); $('#save-result').textContent='✓ Settings saved on this PC';
});
$('#screen-context').onchange = safeTask(async () => {
  const next=$('#screen-context').checked;
  try { const saved=await call('save-settings',{ ...config,screenContext:next }); updateConfig(saved); }
  catch(e) { $('#screen-context').checked=config.screenContext; throw e; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') call('stop').catch(e=>notify(e.message)); });
safeTask(async () => {
  const data=await call('get-settings'); updateConfig(data); setState(data.state || 'idle');
  for (const item of data.history || []) message({role:item.role,text:item.content});
  if (!data.hasKey && !window.clicky.demo) view('settings');
  if (data.loadError) notify(data.loadError);
  if (window.clicky.demo) $('#demo-banner').hidden=false;
})();
