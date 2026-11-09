import { createHash, timingSafeEqual } from 'node:crypto'

// CORS 헤더
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const VALID_HOUSES = ['gryffindor', 'slytherin', 'ravenclaw', 'hufflepuff']
const BUCKET = 'guestbook-photos'
const MAX_IMG_BYTES = 3 * 1024 * 1024 // 3MB
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function getEnv() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  return { url, key }
}

// 4자리 숫자 비번 해시 (salt 포함)
function hashPw(pw) {
  const salt = 'sujong-guestbook-v1'
  return createHash('sha256').update(salt + ':' + pw).digest('hex')
}

function safeCompare(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export default async function handler(req) {
  const method = req.method
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const { url, key } = getEnv()
    const base = `${url}/rest/v1`
    const restHeaders = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    }

    // ── GET: 최근 글 목록 ──
    if (method === 'GET') {
      const res = await fetch(
        `${base}/guestbook?select=id,nickname,house,photo_url,message,created_at&order=created_at.desc&limit=30`,
        { headers: restHeaders }
      )
      if (!res.ok) {
        console.error('Supabase GET 오류:', await res.text())
        throw new Error('목록 조회에 실패했습니다.')
      }
      const rows = await res.json()
      return new Response(JSON.stringify({ entries: rows }), { status: 200, headers: CORS })
    }

    // ── POST: 방명록 저장 (사진 파일 업로드 포함) ──
    if (method === 'POST') {
      let body
      try {
        body = await req.json()
      } catch {
        return bad('요청 본문을 읽을 수 없습니다.')
      }

      let { nickname, house, message, delete_pw, photo_data } = body

      if (typeof nickname !== 'string' || typeof message !== 'string' ||
          typeof house !== 'string' || typeof delete_pw !== 'string') {
        return bad('필수 항목을 입력해 주세요.')
      }

      nickname = nickname.trim()
      message = message.trim()
      house = house.trim()

      if (nickname.length < 2 || nickname.length > 12) return bad('별명은 2~12자로 입력해 주세요.')
      if (!VALID_HOUSES.includes(house)) return bad('올바른 기숙사를 선택해 주세요.')
      if (message.length < 1 || message.length > 300) return bad('메시지는 1~300자로 입력해 주세요.')
      if (!/^\d{4}$/.test(delete_pw)) return bad('삭제 비밀번호는 숫자 4자리로 설정해 주세요.')

      // 사진 업로드 (선택) — photo_data: "data:image/png;base64,...."
      let photoUrl = null
      if (photo_data) {
        const uploaded = await uploadImage(url, key, photo_data)
        if (uploaded.error) return bad(uploaded.error)
        photoUrl = uploaded.publicUrl
      }

      const res = await fetch(`${base}/guestbook`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify({
          nickname, house, message,
          photo_url: photoUrl,
          delete_pw: hashPw(delete_pw),
        }),
      })
      if (!res.ok) {
        console.error('Supabase POST 오류:', await res.text())
        throw new Error('저장에 실패했습니다.')
      }
      return new Response(JSON.stringify({ success: true }), { status: 201, headers: CORS })
    }

    // ── DELETE: 방명록 삭제 (본인 비번 또는 마스터 비번) ──
    if (method === 'DELETE') {
      let body
      try {
        body = await req.json()
      } catch {
        return bad('요청 본문을 읽을 수 없습니다.')
      }

      const { id, pw } = body
      if (!id || typeof pw !== 'string') return bad('삭제할 글과 비밀번호가 필요합니다.')

      // 대상 글 조회
      const getRes = await fetch(
        `${base}/guestbook?id=eq.${encodeURIComponent(id)}&select=id,delete_pw,photo_url`,
        { headers: restHeaders }
      )
      if (!getRes.ok) throw new Error('글 조회에 실패했습니다.')
      const rows = await getRes.json()
      if (rows.length === 0) return bad('해당 글을 찾을 수 없습니다.', 404)

      const row = rows[0]
      const masterPw = process.env.GUESTBOOK_MASTER_PW
      const isMaster = masterPw && safeCompare(pw, masterPw)
      const isOwner = safeCompare(hashPw(pw), row.delete_pw)

      if (!isMaster && !isOwner) {
        return bad('비밀번호가 일치하지 않습니다.', 403)
      }

      // 사진이 있으면 Storage에서도 삭제
      if (row.photo_url) {
        const marker = `/object/public/${BUCKET}/`
        const idx = row.photo_url.indexOf(marker)
        if (idx !== -1) {
          const path = row.photo_url.slice(idx + marker.length)
          await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
            method: 'DELETE',
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
          }).catch(() => {})
        }
      }

      const delRes = await fetch(`${base}/guestbook?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: restHeaders,
      })
      if (!delRes.ok) {
        console.error('Supabase DELETE 오류:', await delRes.text())
        throw new Error('삭제에 실패했습니다.')
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS })
    }

    return bad('허용되지 않은 메서드입니다.', 405)

  } catch (err) {
    console.error('guestbook 함수 오류:', err.message)
    return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), { status: 500, headers: CORS })
  }
}

// base64 data URL을 Storage에 업로드
async function uploadImage(url, key, dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return { error: '이미지 형식을 읽을 수 없습니다.' }
  const mime = m[1]
  const ext = ALLOWED_TYPES[mime]
  if (!ext) return { error: 'JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.' }

  const buffer = Buffer.from(m[2], 'base64')
  if (buffer.length > MAX_IMG_BYTES) return { error: '이미지 크기는 3MB 이하만 가능합니다.' }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const upRes = await fetch(`${url}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': mime,
      'x-upsert': 'false',
    },
    body: buffer,
  })
  if (!upRes.ok) {
    console.error('Storage 업로드 오류:', await upRes.text())
    return { error: '사진 업로드에 실패했습니다.' }
  }
  return { publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${filename}` }
}

function bad(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: CORS })
}

export const config = {
  path: '/api/guestbook'
}
