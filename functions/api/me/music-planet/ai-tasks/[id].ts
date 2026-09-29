import { authenticatedMusicUser, type Env } from '../../../../_shared'

type TaskRow = {
  id: string
  kind: string
  status: string
  model_name: string
  model_version: string
  schema_version: number
  result_json: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return respond({ error: 'UNAUTHENTICATED' }, 401)

  const id = typeof params?.id === 'string' ? params.id : ''
  const task = id ? await env.DB.prepare(`
    SELECT id, kind, status, model_name, model_version, schema_version, result_json,
           error_code, created_at, updated_at
    FROM music_ai_tasks
    WHERE id = ?1 AND requester_user_id = ?2 AND kind = 'planet_composer'
  `).bind(id, identity.userId).first<TaskRow>() : null
  if (!task) return respond({ error: 'AI_TASK_NOT_FOUND' }, 404)

  let result: unknown = null
  if (task.status === 'succeeded' && task.result_json) {
    try {
      result = JSON.parse(task.result_json)
    } catch {
      result = null
    }
  }
  return respond({
    task: {
      id: task.id,
      kind: task.kind,
      status: task.status,
      model: { name: task.model_name, version: task.model_version },
      schemaVersion: task.schema_version,
      result,
      errorCode: task.error_code,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    },
  })
}
