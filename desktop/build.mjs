import { packager } from '@electron/packager'
import { mkdirSync, mkdtempSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('./',import.meta.url))
const dist = join(root,'dist')
const tmp = mkdtempSync(join(tmpdir(),'mosic-mac-'))
mkdirSync(dist,{recursive:true})
try {
  execFileSync('sh',[join(root,'speech/build.sh')],{cwd:root,stdio:'inherit'})
  const bundleSrc=join(tmp,'source','mosic-copilot')
  mkdirSync(bundleSrc,{recursive:true})
  const files=['src','ui','speech','test','package.json','package-lock.json','README.md','LICENSE','build.mjs']
  for (const f of files) cpSync(join(root,f), join(bundleSrc,f),{recursive:true})
  const zip=(file,cwd,name)=>{
    if (existsSync(file)) rmSync(file)
    execFileSync('/usr/bin/ditto',['-c','-k','--keepParent','--norsrc',name,file],{cwd})
  }
  zip(join(dist,'mosic-copilot-source.zip'),dirname(bundleSrc),basename(bundleSrc))
  const [out] = await packager({dir:bundleSrc,out:tmp,platform:'darwin',arch:'arm64',name:'MOSIC Copilot',appBundleId:'dev.mosic.copilot',
    electronVersion:'45.5.0',asar:true,prune:false,overwrite:true,
    ignore:[/^\/test($|\/)/,/^\/speech($|\/)/,/^\/build\.mjs$/],
    extraResource:[join(dist,'speech/mosic-speech')],extendInfo:{
      NSMicrophoneUsageDescription:'按键对讲时使用麦克风，将你的指令交给本机语音识别。',
      NSSpeechRecognitionUsageDescription:'使用设备上的中文语音识别转写对讲。'
    }})
  const app=join(out,'MOSIC Copilot.app')
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'})
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app])
  zip(join(dist,'mosic-copilot-macos-arm64.zip'),out,basename(app))
  console.log('发布包：'+readdirSync(dist).filter(f=>f.endsWith('.zip')).join('、'))
} finally { rmSync(tmp,{recursive:true,force:true}) }
