// CORS 헤더
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

// 허용된 기숙사 값
const VALID_HOUSES = ['gryffindor', 'slytherin', 'ravenclaw', 'hufflepuff']

function getEnv() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  return { url, key }
}

// 안전한 이미지 URL인지 검증 (http/https만 허용)
function isSafeImageUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false
  if (u.length > 500) return false
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export default async function handler(req) {
  const method = req.method

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

    // ── GET: 최근 글 목록 (최신 20건) ──
    if (method === 'GET') {
      const res = await fetch(
        `${base}/guestbook?select=id,nickname,house,photo_url,message,created_at&order=created_at.desc&limit=20`,
        { headers }
      )
      if (!res.ok) {
        console.error('Supabase GET 오류:', await res.text())
        throw new Error('목록 조회에 실패했습니다.')
      }
      const rows = await res.json()
      return new Response(JSON.stringify({ entries: rows }), { status: 200, headers: CORS })
    }

    // ── POST: 방명록 한 건 저장 ──
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

      let { nickname, house, photo_url, message } = body

      if (typeof nickname !== 'string' || typeof message !== 'string' || typeof house !== 'string') {
        return new Response(
          JSON.stringify({ error: '필수 항목을 입력해 주세요.' }),
          { status: 400, headers: CORS }
        )
      }

      nickname = nickname.trim()
      message = message.trim()
      house = house.trim()

      // 별명 검증
      if (nickname.length < 2 || nickname.length > 12) {
        return new Response(
          JSON.stringify({ error: '별명은 2~12자로 입력해 주세요.' }),
          { status: 400, headers: CORS }
        )
      }
      // 기숙사 검증
      if (!VALID_HOUSES.includes(house)) {
        return new Response(
          JSON.stringify({ error: '올바른 기숙사를 선택해 주세요.' }),
          { status: 400, headers: CORS }
        )
      }
      // 메시지 검증 (최대 300자)
      if (message.length < 1 || message.length > 300) {
        return new Response(
          JSON.stringify({ error: '메시지는 1~300자로 입력해 주세요.' }),
          { status: 400, headers: CORS }
        )
      }

      // 사진 URL 검증 (선택 항목 — 있으면 http/https만 허용)
      let safePhoto = null
      if (photo_url !== undefined && photo_url !== null && String(photo_url).trim() !== '') {
        if (!isSafeImageUrl(String(photo_url).trim())) {
          return new Response(
            JSON.stringify({ error: '사진 주소는 http 또는 https 링크만 사용할 수 있습니다.' }),
            { status: 400, headers: CORS }
          )
        }
        safePhoto = String(photo_url).trim()
      }

      const res = await fetch(`${base}/guestbook`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ nickname, house, photo_url: safePhoto, message }),
      })

      if (!res.ok) {
        console.error('Supabase POST 오류:', await res.text())
        throw new Error('저장에 실패했습니다.')
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 201, headers: CORS }
      )
    }

    return new Response(
      JSON.stringify({ error: '허용되지 않은 메서드입니다.' }),
      { status: 405, headers: CORS }
    )

  } catch (err) {
    console.error('guestbook 함수 오류:', err.message)
    return new Response(
      JSON.stringify({ error: '서버 오류가 발생했습니다.' }),
      { status: 500, headers: CORS }
    )
  }
}

export const config = {
  path: '/api/guestbook'
}
