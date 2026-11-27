const {contextBridge, ipcRenderer}=require('electron')
if (process.isMainFrame) {
  const request = (action, data) => ipcRenderer.invoke('mosic:cockpit', action, data)
  contextBridge.exposeInMainWorld('mosicDesktop', {
    status:()=>request('status'),
    openSettings:()=>request('settings'),
    chat:input=>request('chat',input),
    cancel:()=>request('cancel'),
    voiceStart:()=>navigator.userActivation?.isActive ? request('voiceStart') : Promise.reject(new Error('请按键开始对讲。')),
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
