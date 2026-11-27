// Pure request/response adapters shared by the desktop client and Pages Functions.
const routes = { openai: '/chat/completions', responses: '/responses', anthropic: '/messages', json: '' }
const defaultPath = 'choices.0.message.content'

function validAuthHeader(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(value) &&
    !/^(?:host|cookie|set-cookie|origin|referer|server|connection|expect|forwarded|accept|range|upgrade|trailer|transfer-encoding|te|via|user-agent|content-.*|proxy-.*|sec-.*|cf-.*|x-forwarded-.*|x-real-ip|x-mosic-.*)$/i.test(value)
}

function pathParts(path) {
  if (typeof path !== 'string' || path.length > 256 || !/^[\w-]+(?:\.[\w-]+)*$/.test(path)) throw new Error('填写有效的回复字段路径。')
  return path.split('.')
}

export function modelRequest(options) {
  const { baseUrl, requestUrl, protocol, model, key, system, messages } = options
  if (!Object.hasOwn(routes, protocol)) throw new Error('请选择接口协议。')
  const url = new URL(requestUrl || baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      [...url.searchParams.keys()].some(name => /key|token|secret|password|signature|credential/i.test(name))) {
    throw new Error('请使用 HTTPS 地址，并单独填写 API Key。')
  }
  const suffix = routes[protocol]
  const path = url.pathname.replace(/\/+$/, '')
  if (!requestUrl && suffix && !path.endsWith(suffix)) url.pathname = path + suffix
  const header = options.authHeader || (protocol === 'anthropic' ? 'x-api-key' : 'Authorization')
  const scheme = options.authScheme || (header.toLowerCase() === 'authorization' ? 'bearer' : 'raw')
  if (!validAuthHeader(header) || !['raw','bearer'].includes(scheme) || !key || /[^!-~]/.test(key)) throw new Error('密钥请求头或密钥格式无效。')
  const headers = { 'content-type': 'application/json', [header]: scheme === 'bearer' ? 'Bearer ' + key : key }
  const all = [{ role: 'system', content: system }, ...messages]
  let body
  if (protocol === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
    body = { model, max_tokens: 640, system, messages }
  } else if (protocol === 'responses') {
    body = { model, input: messages, instructions: system, store: false, stream: false }
  } else if (protocol === 'openai') {
    body = { model, messages: all, stream: false }
  } else {
    const template = options.bodyTemplate || (model ? '{"model":"{{model}}","messages":"{{messages}}"}' : '{"messages":"{{messages}}"}')
    pathParts(options.responsePath || defaultPath)
    if (typeof template !== 'string' || template.length > 4800 || !/{{(?:prompt|messages)}}/.test(template)) throw new Error('JSON 模板需要包含 {{messages}} 或 {{prompt}}。')
    const fields = { model, system, messages: all, prompt: all.map(m => m.role + ': ' + m.content).join('\n\n') }
    body = JSON.parse(template, (_name, value) => {
      if (typeof value !== 'string') return value
      if (value === '{{messages}}') return all
      return value.replace(/{{(model|system|prompt|messages)}}/g, (_, field) => field === 'messages' ? JSON.stringify(all) : fields[field])
    })
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 128000) throw new Error('请填写有效的 JSON 请求对象。')
  }
  return { url: url.href, headers, body }
}

export function modelReply(result, protocol, responsePath) {
  if (protocol === 'json') {
    let value = result
    for (const field of pathParts(responsePath || defaultPath)) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, field)) return ''
      value = value[field]
    }
    return typeof value === 'string' ? value : ''
  }
  if (protocol === 'responses') {
    if (typeof result?.output_text === 'string') return result.output_text
    return Array.isArray(result?.output) ? result.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('') : ''
  }
  const content = protocol === 'anthropic' ? result?.content : result?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('') : ''
}
