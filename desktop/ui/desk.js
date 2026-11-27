'use strict'
const $=id=>document.getElementById(id)
const call=window.mosic.call
let state, busy=false, listening=false, current, voiceActive=false
let utterance, ducked, playbackTicket=0, turnTicket=0
const audio=$('radio')
const settings=$('settings')
function notice(message) {$(settings.open?'settings-status':'notice').textContent=message||''}
function errorText(e){return String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')}
function on(id,event,handler){$(id).addEventListener(event,async e=>{try{await handler(e)}catch(cause){notice(errorText(cause))}})}
function el(tag,text,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node}
function action(label,run,cls){const node=el('button',label,cls);node.type='button';node.onclick=async()=>{try{await run()}catch(e){notice(errorText(e))}};return node}
function duck(on) {
  if (on && !ducked) {
    ducked = { original: audio.volume, quiet: audio.volume * .23 }
    audio.volume = ducked.quiet
  } else if (!on && ducked) {
    // Native controls still own manual volume and mute changes during speech.
    if (Math.abs(audio.volume - ducked.quiet) < .00001) audio.volume = ducked.original
    ducked = null
  }
}
function stopVisibility() { $('stop').hidden = !busy && !voiceActive && !listening }
function stopVoice() {
  if (utterance) { utterance.onend = utterance.onerror = null; utterance = null }
  speechSynthesis.cancel(); voiceActive=false; duck(listening); stopVisibility()
}
function speak(text){
  stopVoice()
  const v=speechSynthesis.getVoices().find(v=>v.localService&&/^zh/i.test(v.lang))
  if(!v){notice('本机未找到中文语音，答复已显示。');return}
  const u=new SpeechSynthesisUtterance(text);utterance=u;u.voice=v;u.lang=v.lang;voiceActive=true;duck(true);stopVisibility()
  u.onend=u.onerror=()=>{if (utterance!==u) return;utterance=null;voiceActive=false;duck(listening);stopVisibility()}
  speechSynthesis.speak(u)
}
async function play(track){
  const ticket=++playbackTicket
  await call('select',{id:track.id})
  if(ticket!==playbackTicket)return
  current=track;state.currentId=track.id;$('station').hidden=false;$('playing').textContent=track.title+' · '+track.artist
  $('planets').replaceChildren();audio.src=track.url
  try { await audio.play() } catch (error) {
    if(ticket===playbackTicket && error.name!=='AbortError') throw new Error('这首歌暂时无法播放，请试试另一首。')
  }
}
function songButton(t){const b=action('',()=>play(t),'song');b.append(el('strong',t.title),el('small',t.artist));return b}
function render(s){
  state=s
  const names={local:'本机模型',openai:'OpenAI API',anthropic:'Anthropic API',subscription:'ChatGPT 套餐'}
  $('connection').textContent=names[s.provider]+' / '+(s.model||'待选择模型')
  const log=$('messages');log.replaceChildren()
  if(!s.history.length)log.append(el('p',s.model?'通讯已接通。今天想听什么？':'连接一个模型开始对话，或在电台查询并试听歌曲。','empty'))
  for(const m of s.history){const section=el('article',null,'entry');section.append(el('strong',m.role==='user'?'船长':'副驾'),el('p',m.text))
    for(const t of m.cards||[])section.append(action('▶ '+t.title,()=>play(t)))
    log.append(section)}
  log.scrollTop=log.scrollHeight
  $('tracks').replaceChildren(...s.tracks.map(songButton))
  const sources={live:'实时曲库',cached:'缓存曲库',offline:'离线缓存',local:'站内曲库'}
  $('catalog-status').textContent=s.catalogAt?(sources[s.source]||'音乐目录')+' · '+s.tracks.length+' 首':'查询后可试听，私人对话保存在这台电脑。'
  $('unpair').hidden=!s.paired
  $('memories').replaceChildren(...s.memories.map(m=>{const row=el('div',null,'row'),input=el('input');input.value=m.text;input.maxLength=120
    row.append(input,action('保存',async()=>render(await call('memory',{id:m.id,text:input.value}))),action('遗忘',async()=>render(await call('memory',{id:m.id,remove:true}))));return row}))
}
function providerFields(){
  const p=$('provider').value
  $('local-settings').hidden=p!=='local';$('keys').hidden=!['openai','anthropic'].includes(p);$('subscription').hidden=p!=='subscription'
}
function fillSettings(){
  $('allow-cockpit').checked=!!state.allowCockpit;$('provider').value=state.provider;$('endpoint').value=state.endpoint;$('personality').value=state.personality
  $('model').value=state.model;$('key').value='';$('key').placeholder=state.keyPresent?'已保存；留空保留':'保存到系统钥匙串'
  $('account').replaceChildren(...state.accounts.map(a=>new Option(a.label+' · '+a.clientId.slice(-5),a.clientId)))
  $('account').value=state.account||'';$('reauth').disabled=!state.account;$('signout').disabled=!state.accounts.find(a=>a.clientId===state.account)?.connected
  providerFields()
}
async function save(removeKey=false){render(await call('settings',{provider:$('provider').value,endpoint:$('endpoint').value,model:$('model').value,
  key:$('key').value,removeKey,allowCockpit:$('allow-cockpit').checked,personality:$('personality').value}));fillSettings()}
async function submit(text, fromVoice=false) {
  if(busy || !text.trim()) return
  const ticket=++turnTicket
  const whenSent={player:playbackTicket,paused:audio.paused}
  busy=true;$('send').disabled=true;stopVisibility();notice('副驾正在回应…')
  try {
    const reply=await call('chat',{text})
    if (ticket!==turnTicket) return
    render(reply)
    if ($('message').value===text) $('message').value=''
    notice('')
    const selectionUnchanged=playbackTicket===whenSent.player && audio.paused===whenSent.paused
    if(reply.playId && selectionUnchanged){
      const track=reply.history.at(-1)?.cards?.find(t=>t.id===reply.playId)
      if(track) void play(track).catch(e=>notice(errorText(e)))
    }
    if(fromVoice && reply.reply)speak(reply.reply)
  } catch (e) {
    if(ticket===turnTicket)notice(errorText(e))
  } finally {busy=false;$('send').disabled=false;stopVisibility()}
}
on('composer','submit',e=>{e.preventDefault();return submit($('message').value)})
on('message','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();return submit($('message').value)}})
on('searchform','submit',async e=>{e.preventDefault();notice('正在调取曲库…');render(await call('catalog',{query:$('query').value}));notice('')})
on('match','click',async()=>{if(!current)return;const planets=await call('planets',{trackId:current.id});$('planets').replaceChildren()
  for(const p of planets)$('planets').append(action(p.displayName+' ↗',()=>call('visit',{id:p.planetId,name:p.displayName})))
  if(!planets.length)$('planets').textContent='目前没有查到公开的同歌星球。'})
on('configure','click',()=>{fillSettings();settings.showModal();notice('')});on('close','click',()=>settings.close())
settings.addEventListener('close',()=>{if(document.body.dataset.deskMode==='settings')void call('closeSettings')})
on('provider','change',()=>{providerFields();$('model').value='';$('models').replaceChildren();$('key').value=''})
on('save','click',async()=>{await save();notice('连接设置已保存。')});on('remove-key','click',async()=>{await save(true);notice('密钥已移除。')})
on('load-models','click',async()=>{await save();notice('正在读取模型…');const models=await call('models')
  const chatModels=models.filter(m=>!/(?:^|[./_:-])(?:embedding|embed|rerank(?:er)?)(?:s|[./_:-]|$)/i.test(m.id))
  $('models').replaceChildren(...chatModels.map(m=>new Option(m.name,m.id)))
  if(chatModels.length===1 && !$('model').value){$('model').value=chatModels[0].id;await save()}
  notice(chatModels.length?'已读取 '+chatModels.length+' 个对话模型。':'没有找到对话模型，可以手动输入兼容的模型 ID。')})
async function auth(clientId){notice('请在系统浏览器完成授权。');render(await call('signin',{clientId}));fillSettings();notice('已连接，请读取可用模型。')}
on('signin','click',()=>auth());on('reauth','click',()=>auth(state.account))
on('account','change',async()=>{render(await call('switchAccount',{clientId:$('account').value}));fillSettings()})
on('signout','click',async()=>{const s=await call('disconnectAccount');render(s);fillSettings();notice(s.warning||'已撤销此连接。')})
on('pair','click',async()=>{render(await call('pair',{code:$('code').value}));$('code').value='';notice('配对成功。')})
on('unpair','click',async()=>{render(await call('unpair'));notice('设备已断开。')})
on('clear','click',async()=>{if(confirm('清除本机这七天的副驾对话？'))render(await call('clear'))})
on('open-site','click',()=>call('site'));on('usage','click',()=>call('site',{page:'usage'}))
let holdTimer,held=false
async function record(){if(listening||busy)return;stopVoice();listening=true;duck(true);stopVisibility();$('mic').textContent='结束对讲';notice('正在连接本机麦克风…')
  try{await call('speechStart')}catch(e){endUI();throw e}}
function endUI(){listening=false;duck(voiceActive);stopVisibility();$('mic').textContent='按键对讲'}
async function finish(){if(listening)await call('speechStop')}
on('mic','pointerdown',e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);held=false;holdTimer=setTimeout(async()=>{held=true;try{await record()}catch(e){notice(errorText(e))}},300)})
on('mic','pointerup',async()=>{clearTimeout(holdTimer);if(held)await finish()})
on('mic','pointercancel',async()=>{clearTimeout(holdTimer);await call('speechCancel');endUI()})
on('mic','click',async()=>{if(held){held=false;return}if(listening)await finish();else await record()})
window.mosic.onSpeech(async e=>{if(e.type==='ready')notice('正在收音，结束后发送。');if(e.type==='cancelled'){endUI();notice('录音已取消。')}if(e.type==='error'){endUI();notice(e.message||'本机语音识别不可用。')}
  if(e.type==='text'){endUI();$('message').value=e.text||'';await submit(e.text||'',true)}})
async function stopAll(){++turnTicket;clearTimeout(holdTimer);held=false;await Promise.all([call('cancel'),call('speechCancel')]);stopVoice();endUI();notice('已停止。')}
on('stop','click',stopAll)
let spaceHeld=false
on('mic','keydown',async e=>{if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!spaceHeld){spaceHeld=true;await record()}}})
on('mic','keyup',async e=>{if(e.code==='Space'){e.preventDefault();if(spaceHeld){spaceHeld=false;await finish()}}})
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!settings.open&&(listening||busy||voiceActive)){e.preventDefault();void stopAll().catch(cause=>notice(errorText(cause)))}})
window.addEventListener('blur',()=>{spaceHeld=false;clearTimeout(holdTimer);if(listening){void call('speechCancel');endUI()}})
audio.volume=.65;audio.onerror=()=>notice('这首歌暂时无法播放。')


async function switchDeskMode(view) {
  const next=view.settings?'settings':'radio'
  document.body.dataset.deskMode=next
  if(!state)render(await call('state'))
  if(view.settings){fillSettings();if(!settings.open)settings.showModal()}
  else {
    if(settings.open)settings.close()
    if(view.offline)notice('音乐宇宙暂时离线。恢复网络后可点击「进入宇宙」。')
  }
}
window.mosic.onView(view=>{void switchDeskMode(view).catch(e=>notice(errorText(e)))})
Promise.all([call('state'),call('deskMode')]).then(([s,mode])=>{render(s);return switchDeskMode({settings:mode==='settings'})}).catch(e=>notice(errorText(e)))
