import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openStore } from '../src/store.mjs'
import { openHistory, radioScope, todayRange } from '../src/history.mjs'

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(),'mosic-history-test-'))
  t.after(() => rmSync(dir,{recursive:true,force:true}))
  return dir
}

test('upgrading copies the complete radio history once, including old chats and saved song cards', t => {
  const dir=temp(t), file=join(dir,'desk.json'), at=Date.parse('2023-10-13T12:00:00Z')
  const messages=Array.from({length:200},(_,i)=>({role:'user',text:'记住 '+i,at}))
  messages.push({role:'assistant',text:'试听',at,cards:[{id:'old-song'}]})
  const legacy={memories:[{id:'m1',text:'喜欢爵士'}],history:messages}
  writeFileSync(file,JSON.stringify(legacy))
  let store=openStore(dir,{})
  assert.equal(store.db.memories[0].text,'喜欢爵士')
  assert.equal(JSON.parse(readFileSync(file)).history,undefined)
  const range=todayRange(new Date(at))
  assert.equal(store.history.page(radioScope,range).messages.length,100)
  assert.ok(store.history.hasRadioTrack('old-song'))
  assert.equal(store.history.today(radioScope).length,0)
  store.history.close()
  writeFileSync(file,JSON.stringify(legacy)) // simulate restart just before legacy cleanup
  store=openStore(dir,{})
  try {
    assert.equal(store.history.today(radioScope,-1,new Date(at)).length,messages.length)
    store.history.forgetRadioText('记住')
    assert.deepEqual(store.history.today(radioScope,-1,new Date(at)),messages.slice(-1))
  } finally {store.history.close()}
})

test('stable pagination covers tied timestamps across inserts; deleting one scope survives restart', t => {
  const dir=temp(t), start=new Date(2026,0,1), end=new Date(2027,0,1), at=start.getTime()
  const range={start:start.toISOString(),end:end.toISOString()}
  let store=openHistory(dir)
  const messages=Array.from({length:105},(_,i)=>({id:'msg'+i,text:String(i),createdAt:start.toISOString()}))
  store.addTurn('a','test',messages)
  store.addTurn('b','test',[{role:'user',text:'other',at}])
  store.addTurn('a','outside',[{role:'user',text:'next year',at:end.getTime()}])
  const first=store.page('a',range)
  assert.deepEqual(first.messages,messages.slice(-100))
  store.addTurn('a','added',[{role:'assistant',text:'after page one',at}])
  const second=store.page('a',{...range,cursor:first.nextCursor})
  assert.deepEqual(second.messages,messages.slice(0,5));assert.equal(second.nextCursor,null)
  assert.throws(()=>store.page('a',{...range,cursor:'oops'}))
  assert.throws(()=>store.page('a',{...range,end:'2080-01-01T00:00:00Z'}))
  assert.equal(store.turn('a','test').length,messages.length)
  store.clear('a');store.close();store=openHistory(dir)
  try {
    assert.deepEqual(store.page('a',range),{messages:[],nextCursor:null})
    assert.equal(store.turn('a','outside').length,0)
    assert.equal(store.page('b',range).messages[0].text,'other')
  } finally {store.close()}
})

test('today and the archive use the same exclusive local midnight boundary', t => {
  const store=openHistory(temp(t))
  try {
    const next=new Date(2026,10,27,0,0,0), prev=new Date(next.getTime()-1)
    const messages=[{role:'user',text:'昨天',at:prev.getTime()},{role:'assistant',text:'今天',at:next.getTime()}]
    store.addTurn(radioScope,null,messages)
    assert.deepEqual(store.today(radioScope,-1,prev),messages.slice(0,1))
    assert.deepEqual(store.today(radioScope,-1,next),messages.slice(1))
  } finally {store.close()}
})
