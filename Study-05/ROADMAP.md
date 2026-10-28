<!-- 작성일시: 2026-10-28 10:00 -->
# ROADMAP (Study-05)

상태는 코드와 커밋을 확인한 사실로만 바꿉니다.

| 단계 | PRD 파일 | 목표 요약 | 상태 | 의존 단계 |
|---|---|---|---|---|
| D | (PRD 없음, `CLAUDE.md`에 정리) | AI 공감 다이어리: 한 줄 일기 감정 분석·공감 메시지·저장 | 완료 (커밋 9fbc596) | - |
| PDF-M1 | `PDF_PRD.md` 11절 M1 | PDF 원본 업로드(`POST /api/pdf/summarize`)·검사·메모리 텍스트 추출, 오류 코드 | 계획 | D |
| PDF-M2 | `PDF_PRD.md` 11절 M2 | rerank 핵심 조각 선택 + 채팅 모델 한국어 요약, full/rerank/head 경로, 1건당 호출 4회 | 계획 | PDF-M1 |
| PDF-M3 | `PDF_PRD.md` 11절 M3 | `index_pdf.html`(`GET /pdf`): 드래그&드롭·진행·취소·결과·복사·file:// 처리 | 계획 | PDF-M2 (M1 뒤 병행 가능) |
| PDF-M4 | `PDF_PRD.md` 11절 M4·12절 | QA 41개 상황 확인, 회귀 테스트 고정, CLAUDE.md·.env.example 갱신 확인 | 계획 | PDF-M3 |
