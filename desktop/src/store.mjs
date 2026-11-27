import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { openHistory } from './history.mjs'

export function openStore(directory, secure) {
  mkdirSync(directory,{recursive:true,mode:0o700})
  const file = join(directory,'desk.json')
  const initial = {host:'urn:uuid:'+randomUUID(),provider:'none',endpoint:'http://127.0.0.1:11434/v1',models:{},accounts:{},account:null,
    vault:{},memories:[],catalog:null,personality:'简洁',currentId:null}
  let db
  try { db={...initial,...JSON.parse(readFileSync(file,'utf8'))} }
  catch(e) { if (e.code!=='ENOENT') throw new Error('本机数据无法读取，请保留原文件后恢复。'); db=initial }
  // Older fresh profiles persisted 'local' before the listener chose a model.
  if (db.provider==='local' && !db.models.local) db.provider='none'
  const save = () => {writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600});renameSync(file+'.tmp',file)}
  const history = openHistory(directory, db.history)
  delete db.history
  const put = (name,value) => {
    if (!value) delete db.vault[name]
    else {
      if (!secure.isEncryptionAvailable()) throw new Error('系统钥匙串不可用，凭据尚未保存。')
      db.vault[name]=secure.encryptString(JSON.stringify(value)).toString('base64')
    }
    save()
  }
  const get = name => db.vault[name] ? JSON.parse(secure.decryptString(Buffer.from(db.vault[name],'base64'))) : null
  save()
  return {db,save,get,put,history}
}
