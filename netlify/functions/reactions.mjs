// 허용된 작품 번호 목록
const VALID_ITEMS = ['hp1','hp2','hp3','hp4','hp5','hp6','hp7','hp8']

// CORS 헤더
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

function getEnv() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  return { url, key }
}

export default async function handler(req) {
  const method = req.method

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const { url, key } = getEnv()
    const base = `${url}/rest/v1`
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    }

    // ── GET: 작품별 응원 수 집계 ──
    if (method === 'GET') {
      const res = await fetch(`${base}/reactions?select=item_id`, { headers })
      if (!res.ok) {
        const err = await res.text()
        console.error('Supabase GET 오류:', err)
        throw new Error('데이터 조회에 실패했습니다.')
      }
      const rows = await res.json()

      const counts = {}
      VALID_ITEMS.forEach(id => { counts[id] = 0 })
      rows.forEach(row => {
        if (counts[row.item_id] !== undefined) counts[row.item_id]++
      })

      return new Response(JSON.stringify({ counts }), { status: 200, headers: CORS })
    }

    // ── POST: 응원 한 건 저장 ──
    if (method === 'POST') {
      let body
      try {
        body = await req.json()
      } catch {
        return new Response(
          JSON.stringify({ error: '요청 본문을 읽을 수 없습니다.' }),
          { status: 400, headers: CORS }
        )
      }

      const { item_id } = body

      if (!item_id || typeof item_id !== 'string') {
        return new Response(
          JSON.stringify({ error: 'item_id가 없습니다.' }),
          { status: 400, headers: CORS }
        )
      }
      if (!VALID_ITEMS.includes(item_id)) {
        return new Response(
          JSON.stringify({ error: `허용되지 않은 작품 번호입니다: ${item_id}` }),
          { status: 400, headers: CORS }
        )
      }

      const res = await fetch(`${base}/reactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ item_id }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('Supabase POST 오류:', err)
        throw new Error('저장에 실패했습니다.')
      }

      return new Response(
        JSON.stringify({ success: true, item_id }),
        { status: 201, headers: CORS }
      )
    }

    return new Response(
      JSON.stringify({ error: '허용되지 않은 메서드입니다.' }),
      { status: 405, headers: CORS }
    )

  } catch (err) {
    console.error('reactions 함수 오류:', err.message)
    return new Response(
      JSON.stringify({ error: '서버 오류가 발생했습니다.' }),
      { status: 500, headers: CORS }
    )
  }
}

export const config = {
  path: '/api/reactions'
}
