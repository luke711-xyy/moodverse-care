const {contextBridge, ipcRenderer}=require('electron')
if (process.isMainFrame) {
  const request = (action, data) => ipcRenderer.invoke('mosic:cockpit', action, data)
  // Only the dedicated intercom key can arm a native capture, once per hold.
  let armedHold = null
  const intercomPressed = event => event.isTrusted && event.composedPath().some(
    node => node instanceof HTMLButtonElement && node.matches('button.cp-intercom:enabled')
  )
  window.addEventListener('pointerdown', event => {
    armedHold = intercomPressed(event) && event.isPrimary && event.button === 0 ? event.pointerId : null
  }, true)
  window.addEventListener('keydown', event => {
    if (!event.repeat && intercomPressed(event) && (event.code === 'Space' || event.key === 'Enter')) armedHold = event.code
  }, true)
  const releasePointer = event => { if (armedHold === event.pointerId) armedHold = null }
  window.addEventListener('pointerup', releasePointer, true)
  window.addEventListener('pointercancel', releasePointer, true)
  window.addEventListener('keyup', event => { if (armedHold === event.code) armedHold = null }, true)
  window.addEventListener('blur', () => { armedHold = null })
  contextBridge.exposeInMainWorld('mosicDesktop', {
    status:()=>request('status'),
    openSettings:()=>request('settings'),
    chat:input=>request('chat',input),
    history:range=>request('history',range),
    clearHistory:()=>request('clearHistory'),
    onHistoryChanged:callback=>{
      const listener=()=>callback()
      ipcRenderer.on('cockpit-history-changed',listener)
      return ()=>ipcRenderer.removeListener('cockpit-history-changed',listener)
    },
    cancel:()=>request('cancel'),
    voiceStart:()=>{
      if (armedHold === null) return Promise.reject(new Error('请按住说话键开始听写。'))
      armedHold = null
      return request('voiceStart')
    },
    voiceFinish:()=>request('voiceFinish'),
    voiceCancel:()=>request('voiceCancel'),
    onVoice:callback=>{
      const listener=(_event,data)=>callback(data)
      ipcRenderer.on('cockpit-speech',listener)
      return ()=>ipcRenderer.removeListener('cockpit-speech',listener)
    },
  })
}

// Only a genuine link activation reaches the OS browser. Redirects and
// programmatic navigations never inherit this privilege.
if(process.isMainFrame) {
  const follow=(event)=>{
    if(!event.isTrusted || event.defaultPrevented || (event.type==='auxclick' && event.button!==1)) return
    const anchor=event.composedPath().find(n=>n instanceof HTMLAnchorElement && n.hasAttribute('href'))
    if(!anchor)return
    let url
    try{url=new URL(anchor.href)}catch{return}
    const sameRoot=url.origin===location.origin&&['/','/index.html'].includes(url.pathname)
    if(sameRoot && (!anchor.target || anchor.target==='_self') && !event.metaKey && !event.ctrlKey && event.button!==1)return
    event.preventDefault()
    void ipcRenderer.invoke('mosic:follow-link',url.href).catch(()=>{})
  }
  document.addEventListener('click',follow)
  document.addEventListener('auxclick',follow)
}
