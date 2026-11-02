# 기능 명세: 해리포터 작품별 응원 보드

## 한 줄 기획

내 홈페이지는 해리포터 팬을 위한 곳이다. 방문자는 좋아하는 해리포터 편에 응원을 남긴다. 서버에는 작품 번호와 저장 시각을 기록한다. 화면에는 편별 누적 응원 수가 보인다. 다른 기기에서도 같은 집계가 보이고 재배포 후에도 유지되면 완성이다.

---

## 작품 목록 (item_id)

| item_id | 제목 |
|---------|------|
| hp1 | 해리포터와 마법사의 돌 (2001) |
| hp2 | 해리포터와 비밀의 방 (2002) |
| hp3 | 해리포터와 아즈카반의 죄수 (2004) |
| hp4 | 해리포터와 불의 잔 (2005) |
| hp5 | 해리포터와 불사조 기사단 (2007) |
| hp6 | 해리포터와 혼혈 왕자 (2009) |
| hp7 | 해리포터와 죽음의 성물 1부 (2010) |
| hp8 | 해리포터와 죽음의 성물 2부 (2011) |

---

## 저장 데이터 (Supabase `reactions` 테이블)

| 열 | 타입 | 설명 |
|----|------|------|
| id | bigserial | 반응 고유 번호 (자동 증가) |
| item_id | text | 작품 번호 (hp1~hp8만 허용) |
| created_at | timestamptz | 저장 시각 (자동) |

---

## API 구조

- `GET /api/reactions` — 작품별 누적 응원 수 반환
- `POST /api/reactions` — 응원 한 건 저장 `{ "item_id": "hp1" }`

---

## 배포 구성

- **배포 서비스:** Netlify
- **서버 함수:** `netlify/functions/reactions.mjs` → `/api/reactions`
- **저장소:** Supabase (`reactions` 테이블)
- **GitHub 저장소:** https://github.com/sujong45/sujong45.github.io
- **브랜치:** main

---

## 환경 변수 (Netlify 대시보드에 직접 입력)

| 이름 | 설명 |
|------|------|
| SUPABASE_URL | Supabase Project URL |
| SUPABASE_SERVICE_ROLE_KEY | service_role 키 |

---

## 완성 검사 방법

1. 배포 사이트에서 응원 버튼 클릭 → 숫자 증가 확인
2. Supabase Table Editor에서 해당 행 생성 확인
3. 휴대폰에서 같은 사이트 열어 동일 집계 확인
4. 재배포 후 기록 유지 확인
5. 없는 작품 번호(`hp9`) POST 시 400 오류 확인
6. 저장 실패 시 성공 메시지 미표시 확인
