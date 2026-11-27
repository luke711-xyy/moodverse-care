'use strict'
const $=id=>document.getElementById(id)
const call=window.mosic.call
let state, busy=false, current, dictation=null
let ducked, playbackTicket=0, turnTicket=0
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
function updateComposer() {
  $('stop').hidden = !busy && !dictation
  $('send').disabled = !state?.configured || busy || Boolean(dictation)
  $('message').readOnly = Boolean(dictation)
  $('mic').disabled = busy
  $('mic').textContent = !dictation ? '按住说话' : dictation.released ? '正在完成转写' : '松开结束'
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
function entry(m, timeLabel = '') {
  const section=el('article',null,'entry')
  section.append(el('strong', (m.role==='user' ? '船长' : '副驾') + (timeLabel ? ' · '+timeLabel : '')),el('p',m.text))
  for(const t of m.cards||[])section.append(action('▶ '+t.title,()=>play(t)))
  return section
}
function render(s){
  state=s
  const names={none:'未配置',custom:'自定义 API',codex:'Codex CLI',copilot:'GitHub Copilot CLI',local:'本机模型',openai:'OpenAI API',anthropic:'Anthropic API',subscription:'ChatGPT 套餐'}
  $('connection').textContent=s.configured ? names[s.provider]+(s.model?' / '+s.model:'') : '未配置'
  updateComposer()
  const log=$('messages');log.replaceChildren()
  if(!s.history.length)log.append(el('p',s.configured?'通讯已接通。今天想听什么？':'连接一个模型开始对话，或在电台查询并试听歌曲。','empty'))
  for(const message of s.history) log.append(entry(message))
  log.scrollTop=log.scrollHeight
  $('tracks').replaceChildren(...s.tracks.map(songButton))
  const sources={live:'实时曲库',cached:'缓存曲库',offline:'离线缓存',local:'站内曲库'}
  $('catalog-status').textContent=s.catalogAt?(sources[s.source]||'音乐目录')+' · '+s.tracks.length+' 首':'查询后可试听，私人对话保存在这台电脑。'
  $('unpair').hidden=!s.paired
  $('memories').replaceChildren(...s.memories.map(m=>{const row=el('div',null,'row'),input=el('input');input.value=m.text;input.maxLength=120
    row.append(input,action('保存',async()=>render(await call('memory',{id:m.id,text:input.value}))),action('遗忘',async()=>render(await call('memory',{id:m.id,remove:true}))));return row}))
}
const defaultTemplate=JSON.stringify({messages:'{{messages}}'},null,2)
function providerFields(){
  const p=$('provider').value
  $('local-settings').hidden=p!=='local'
  $('custom-settings').hidden=p!=='custom'
  $('custom-header-settings').hidden=$('custom-auth').value!=='other'
  const json=$('custom-protocol').value==='json'
  $('custom-json-settings').hidden=!json
  $('custom-full').disabled=json
  if(json)$('custom-full').checked=true
  $('keys').hidden=!['openai','anthropic','custom'].includes(p)
  $('subscription').hidden=p!=='subscription'
  const agent=p==='codex' || p==='copilot'
  $('agent-settings').hidden=!agent
  if (agent) {
    const name=p==='codex'?'Codex CLI':'GitHub Copilot CLI'
    const login=p==='codex'?'codex login':'copilot login'
    $('agent-help').textContent='使用这台电脑上已登录的 '+name+'。先在终端运行 '+login+'，再点「读取可用模型」。模型 ID 填 default 即使用该 CLI 的默认模型。'
  }
  $('model-settings').hidden=p==='none'
  $('model-label').textContent=p==='custom' && json ? '模型 ID（接口已指定时可留空）':'模型 ID'
  $('load-models').disabled=p==='custom' && json
  $('allow-cockpit').disabled=p==='none'
}
function fillSettings(){
  $('allow-cockpit').checked=!!state.allowCockpit;$('provider').value=state.provider;$('endpoint').value=state.endpoint;$('personality').value=state.personality
  $('legacy-subscription').hidden=state.accounts.length===0 && state.provider!=='subscription'
  const c=state.custom || {}
  $('custom-url').value=c.url || '';$('custom-protocol').value=c.protocol || 'completions';$('custom-full').checked=!!c.full
  $('custom-auth').value=c.auth || 'bearer';$('custom-header').value=c.authHeader || '';$('custom-scheme').value=c.authScheme || 'raw'
  $('body-template').value=c.bodyTemplate || defaultTemplate;$('response-path').value=c.responsePath || 'choices.0.message.content'
  $('model').value=state.model;$('key').value='';$('key').placeholder=state.keyPresent?'已保存，留空保留':'保存到系统钥匙串'
  $('account').replaceChildren(...state.accounts.map(a=>new Option(a.label+' · '+a.clientId.slice(-5),a.clientId)))
  $('account').value=state.account||'';$('reauth').disabled=!state.account;$('signout').disabled=!state.accounts.find(a=>a.clientId===state.account)?.connected
  providerFields()
}
function connectionInput(){
  return {provider:$('provider').value,endpoint:$('endpoint').value,model:$('model').value,key:$('key').value,
    allowCockpit:$('allow-cockpit').checked,personality:$('personality').value,
    custom:{url:$('custom-url').value,protocol:$('custom-protocol').value,full:$('custom-full').checked,auth:$('custom-auth').value,
      authHeader:$('custom-header').value,authScheme:$('custom-scheme').value,bodyTemplate:$('body-template').value,responsePath:$('response-path').value}}
}
async function save(removeKey=false){
  render(await call('settings',{...connectionInput(),removeKey}));fillSettings()
}
async function submit(text) {
  if(busy || dictation || !text.trim()) return
  const ticket=++turnTicket
  const whenSent={player:playbackTicket,paused:audio.paused}
  busy=true;updateComposer();notice('副驾正在回应…')
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
  } catch (e) {
    if(ticket===turnTicket)notice(errorText(e))
  } finally {if(ticket===turnTicket){busy=false;updateComposer()}}
}
on('composer','submit',e=>{e.preventDefault();if(e.submitter===$('send'))return submit($('message').value)})
on('searchform','submit',async e=>{e.preventDefault();notice('正在调取曲库…');render(await call('catalog',{query:$('query').value}));notice('')})
on('match','click',async()=>{if(!current)return;const planets=await call('planets',{trackId:current.id});$('planets').replaceChildren()
  for(const p of planets)$('planets').append(action(p.displayName+' ↗',()=>call('visit',{id:p.planetId,name:p.displayName})))
  if(!planets.length)$('planets').textContent='目前没有查到公开的同歌星球。'})
on('configure','click',async()=>{await cancelDictation();fillSettings();settings.showModal();notice('')});on('close','click',()=>settings.close())
settings.addEventListener('close',()=>{if(document.body.dataset.deskMode==='settings')void call('closeSettings')})
on('copy-setup','click',async()=>{await call('copySetup');notice('提示词已复制，请粘贴给这台电脑上的 Agent。')})
on('provider','change',()=>{
  const p=$('provider').value
  $('model').value=state.models[p] || (p==='codex' || p==='copilot' ? 'default' : '')
  $('models').replaceChildren();$('key').value=''
  $('key').placeholder='新密钥或保留此接口已保存的密钥'
  $('allow-cockpit').checked=p!=='none' && (state.provider==='none' || !!state.allowCockpit)
  providerFields()
})
on('custom-protocol','change',()=>{
  $('custom-auth').value=$('custom-protocol').value==='messages'?'x-api-key':'bearer'
  providerFields()
})
on('custom-auth','change',providerFields)
on('save','click',async()=>{await save();notice(state.configured?'连接设置已保存。':'副驾未配置。')});on('remove-key','click',async()=>{await save(true);notice('密钥已移除。')})
let modelRequest=0
on('load-models','click',async()=>{
  const ticket=++modelRequest, input=connectionInput()
  notice('正在读取模型…')
  const models=await call('models',input)
  if(ticket!==modelRequest || JSON.stringify(input)!==JSON.stringify(connectionInput())) return
  const chatModels=models.filter(m=>!/(?:^|[./_:-])(?:embedding|embed|rerank(?:er)?)(?:s|[./_:-]|$)/i.test(m.id))
  $('models').replaceChildren(...chatModels.map(m=>new Option(m.name,m.id)))
  if(chatModels.length===1 && !$('model').value)$('model').value=chatModels[0].id
  notice(chatModels.length?'已读取 '+chatModels.length+' 个模型，确认所选模型后点「保存连接」。':'没有找到对话模型，可以手动输入服务商提供的模型 ID。')
})
async function auth(clientId){notice('请在系统浏览器完成授权。');render(await call('signin',{clientId}));fillSettings();notice('已连接，请读取可用模型。')}
on('signin','click',()=>auth());on('reauth','click',()=>auth(state.account))
on('account','change',async()=>{render(await call('switchAccount',{clientId:$('account').value}));fillSettings()})
on('signout','click',async()=>{const s=await call('disconnectAccount');render(s);fillSettings();notice(s.warning||'已撤销此连接。')})
on('pair','click',async()=>{render(await call('pair',{code:$('code').value}));$('code').value='';notice('配对成功。')})
on('unpair','click',async()=>{render(await call('unpair'));notice('设备已断开。')})
on('clear','click',async()=>{
  if(!confirm('清除这台设备上全部离线电台聊天记录？此操作无法撤销。'))return
  ++turnTicket
  busy=false
  render(await call('clear'))
  updateComposer()
  if ($('archive').open) await loadArchive()
  notice('离线电台聊天记录已清除。')
})
on('open-site','click',()=>call('site'));on('usage','click',()=>call('site',{page:'usage'}))
async function startDictation(hold) {
  if (dictation || busy || settings.open) return
  const field = $('message')
  const session = {
    hold, released: false,
    prefix: field.value.slice(0, field.selectionStart),
    suffix: field.value.slice(field.selectionEnd),
  }
  dictation = session
  updateComposer()
  notice('正在连接本机麦克风…')
  try {
    await call('speechStart')
  } catch (error) {
    if (session !== dictation) return
    resetDictation()
    notice(errorText(error))
  }
}
function resetDictation() {
  dictation = null
  duck(false)
  updateComposer()
}
async function finishDictation(hold) {
  if (!dictation || dictation.hold !== hold || dictation.released) return
  dictation.released = true
  duck(false)
  updateComposer()
  notice('正在完成本机转写…')
  try {
    await call('speechStop')
  } catch (error) {
    await cancelDictation()
    notice(errorText(error))
  }
}
async function cancelDictation() {
  if (!dictation) return
  resetDictation()
  await call('speechCancel')
}
on('mic', 'pointerdown', async event => {
  if (dictation || event.button !== 0 || !event.isPrimary) return
  event.currentTarget.setPointerCapture(event.pointerId)
  await startDictation(event.pointerId)
})
on('mic', 'pointerup', event => finishDictation(event.pointerId))
on('mic', 'pointercancel', event => {
  if (dictation?.hold === event.pointerId) return cancelDictation()
})
on('mic', 'lostpointercapture', event => {
  if (dictation?.hold === event.pointerId && !dictation.released) return cancelDictation()
})
on('mic', 'keydown', event => {
  if (event.code !== 'Space' && event.key !== 'Enter') return
  event.preventDefault()
  if (!event.repeat) return startDictation(event.code)
})
window.addEventListener('keyup', event => {
  if (dictation?.hold === event.code) {
    event.preventDefault()
    void finishDictation(event.code)
  }
})
window.mosic.onSpeech(event => {
  if (!dictation) return
  switch (event.type) {
    case 'ready':
      if (!dictation.released) {
        duck(true)
        notice('正在听写，松开后可以修改。')
      }
      break
    case 'partial':
    case 'text': {
      const {prefix, suffix} = dictation
      const field = $('message')
      const text = String(event.text ?? '').slice(0, Math.max(0, field.maxLength - prefix.length - suffix.length))
      field.value = prefix + text + suffix
      field.selectionStart = field.selectionEnd = prefix.length + text.length
      if (event.type === 'text') {
        resetDictation()
        notice('听写完成，可修改后点击发送。')
      }
      break
    }
    case 'error':
      resetDictation()
      notice(event.message || '本机语音识别不可用。')
      break
    case 'cancelled':
      resetDictation()
      notice('听写已结束。')
      break
  }
})
async function stopAll() {
  ++turnTicket
  busy = false
  await Promise.all([call('cancel'), cancelDictation()])
  updateComposer()
  notice('已停止。')
}
on('stop', 'click', stopAll)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !settings.open && (dictation || busy)) {
    event.preventDefault()
    void stopAll().catch(error => notice(errorText(error)))
  }
})
const stopOnLeave = () => { void cancelDictation().catch(error => notice(errorText(error))) }
window.addEventListener('blur', stopOnLeave)
document.addEventListener('visibilitychange', () => { if (document.hidden) stopOnLeave() })
audio.volume=.65;audio.onerror=()=>notice('这首歌暂时无法播放。')


const archive=$('archive')
const dateKey = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
function chosenPeriod() {
  const start=new Date(($('anchor-date').value || dateKey(new Date()))+'T00:00:00')
  const mode=$('period').value
  if (mode==='week') start.setDate(start.getDate()-(start.getDay()+6)%7)
  if (mode==='month') start.setDate(1)
  if (mode==='year') start.setMonth(0,1)
  const end=new Date(start)
  if(mode==='year') end.setFullYear(end.getFullYear()+1)
  else if(mode==='month') end.setMonth(end.getMonth()+1)
  else end.setDate(end.getDate()+(mode==='week'?7:1))
  return {start,end}
}
let archiveRequest=0, archiveCursor=null, archiveMessages=[]
async function loadArchive(earlier=false) {
  const ticket=++archiveRequest, {start,end}=chosenPeriod()
  const cursor=earlier ? archiveCursor : undefined
  if (!earlier) {archiveMessages=[];archiveCursor=null;$('archive-entries').replaceChildren()}
  $('earlier').hidden=true
  $('archive-status').textContent='正在读取…'
  const finalDay=new Date(end.getTime()-1)
  $('period-label').textContent=dateKey(start)+(dateKey(start)===dateKey(finalDay)?'':' 至 '+dateKey(finalDay))
  $('next-period').disabled=end.getTime()>Date.now()
  try {
    const page=await call('history',{start:start.toISOString(),end:end.toISOString(),cursor})
    if (!archive.open || ticket!==archiveRequest) return
    archiveCursor=page.nextCursor
    archiveMessages=page.messages.concat(archiveMessages)
    let lastDay=''
    const nodes=[]
    for (const message of archiveMessages) {
      const date=new Date(message.at), day=dateKey(date)
      if(day!==lastDay){nodes.push(el('h3',day));lastDay=day}
      nodes.push(entry(message,date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})))
    }
    $('archive-entries').replaceChildren(...nodes)
    $('archive-status').textContent=nodes.length ? '' : '这段时间没有聊天记录。'
  } catch (error) {
    if (ticket===archiveRequest) $('archive-status').textContent=errorText(error)
  } finally {
    if (ticket===archiveRequest) $('earlier').hidden=!archiveCursor
  }
}
function shiftPeriod(back) {
  const {start,end}=chosenPeriod()
  $('anchor-date').value=dateKey(back ? new Date(start.getTime()-1) : end)
  return loadArchive()
}
on('browse-history','click',async()=>{
  $('anchor-date').value=dateKey(new Date())
  $('anchor-date').max=$('anchor-date').value
  archive.showModal()
  await loadArchive()
})
on('close-archive','click',()=>archive.close())
archive.addEventListener('close',()=>{archiveRequest++;archiveMessages=[];archiveCursor=null;$('archive-entries').replaceChildren()})
on('period','change',()=>loadArchive());on('anchor-date','change',()=>loadArchive())
on('previous-period','click',()=>shiftPeriod(true));on('next-period','click',()=>shiftPeriod(false))
on('earlier','click',()=>loadArchive(true))

let renderedDay = dateKey(new Date()), midnightTimer
function checkDay() {
  clearTimeout(midnightTimer)
  const now=new Date(), today=dateKey(now)
  if (today!==renderedDay) {
    renderedDay=today
    if (state) render({...state,history:state.history.filter(message=>dateKey(new Date(message.at))===today)})
    $('anchor-date').max=today
    if (archive.open) void loadArchive()
  }
  const midnight=new Date(now)
  midnight.setHours(24,0,0,0)
  midnightTimer=setTimeout(checkDay,midnight.getTime()-now.getTime()+20)
}
document.addEventListener('visibilitychange',()=>{if (!document.hidden) checkDay()})
window.addEventListener('focus',checkDay)
checkDay()

async function switchDeskMode(view) {
  const next=view.settings?'settings':'radio'
  document.body.dataset.deskMode=next
  if(view.settings || !state)render(await call('state'))
  if(view.settings){await cancelDictation();fillSettings();if(!settings.open)settings.showModal()}
  else {
    if(settings.open)settings.close()
    if(view.offline)notice('音乐宇宙暂时离线。恢复网络后可点击「进入宇宙」。')
  }
}
window.mosic.onView(view=>{void switchDeskMode(view).catch(e=>notice(errorText(e)))})
call('deskMode').then(mode=>switchDeskMode({settings:mode==='settings'})).catch(e=>notice(errorText(e)))
