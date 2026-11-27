const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('mosic',{
  call:(action,data)=>ipcRenderer.invoke('mosic:call',action,data),
  onSpeech:fn=>ipcRenderer.on('speech-event',(_event,event)=>fn(event)),
  onView:fn=>ipcRenderer.on('desk-view',(_event,event)=>fn(event)),
})
