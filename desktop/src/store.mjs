import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function openStore(directory, secure) {
  mkdirSync(directory,{recursive:true,mode:0o700})
  const file = join(directory,'desk.json')
  const initial = {host:'urn:uuid:'+randomUUID(),provider:'local',endpoint:'http://127.0.0.1:11434/v1',models:{},accounts:{},account:null,
    vault:{},history:[],memories:[],catalog:null,personality:'简洁',currentId:null}
  let db
  try { db={...initial,...JSON.parse(readFileSync(file,'utf8'))} }
  catch(e) { if (e.code!=='ENOENT') throw new Error('本机数据无法读取，请保留原文件后恢复。'); db=initial }
  const save = () => {writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600});renameSync(file+'.tmp',file)}
  const prune = () => {db.history=db.history.filter(m=>m.at>Date.now()-7*86400000).slice(-160)}
  const put = (name,value) => {
    if (!value) delete db.vault[name]
    else {
      if (!secure.isEncryptionAvailable()) throw new Error('系统钥匙串不可用，凭据尚未保存。')
      db.vault[name]=secure.encryptString(JSON.stringify(value)).toString('base64')
    }
    save()
  }
  const get = name => db.vault[name] ? JSON.parse(secure.decryptString(Buffer.from(db.vault[name],'base64'))) : null
  prune();save()
  return {db,save,get,put,prune}
}
