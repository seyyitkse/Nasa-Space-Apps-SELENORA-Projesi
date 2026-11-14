# SELENORA Phase 3 — DeepSeek AI Mission Analyst Report

**Date:** 2026-11-14  
**Branch:** `feature/phase3-deepseek-analyst`  
**Algorithm version:** `0.3.0-phase3`  
**Prompt version:** `explain-v1`

---

## 1. Genel durum

Phase 3 tamamlandı (mock testlerle). DeepSeek canlı API anahtarı ortamda **yoktu** → **live DeepSeek: not tested**.

Phase 2 bilimsel motor, Horizons hattı ve UI korundu. AI yalnızca açıklama katmanı.

## 2. Değişen dosyalar (özet)

- Alembic: `alembic.ini`, `alembic/env.py`, `alembic/versions/20261114_0001_phase3_schema.py`, `app/db/migrate.py`
- AI: `evidence_package.py`, `explain_service.py`, DeepSeek `client.py` / `prompts.py`, `ai_guard.py`
- API: `POST/GET /api/v1/analyses/{id}/explain`
- Models/schemas: AI report metadata + `mission_tradeoffs` + `regenerate`
- Frontend: AnalystPage, Reports AI block, types/API hooks, i18n
- Tests: `test_explain_service.py` (+ DeepSeek empty content)
- Docs: this report + PROGRESS / TEST_RESULTS / NEXT_STEPS / ARCHITECTURE / API_CONTRACT / DECISIONS / README

## 3. DeepSeek entegrasyonu

| Madde | Durum |
|---|---|
| `DEEPSEEK_*` env vars | Destekleniyor (`.env.example`) |
| Anahtar yokken sunucu | Ayakta; explain → **503** |
| `response_format=json_object` | Evet |
| `extra_body.thinking.disabled` | Evet (SDK desteklemezse fallback) |
| Model | `DEEPSEEK_MODEL` (default `deepseek-flash`) |
| Live `/models` / completions | **not tested** (no key) |

## 4. Scientific Evidence Package

`build_evidence_package(AnalysisResult)` — allow-listed metrikler, skorlar, provenance, limitations. Timeline / ham Horizons satırı yok. Site adları “untrusted identifier” notu ile gönderilir.

## 5. AI JSON güvenliği

- Pydantic `AIMissionReport` doğrulaması
- `find_unsupported_numbers`
- `ranking_contradicts` → **502 reject**, bilimsel kayıt silinmez
- `recommended_site_label` her zaman deterministik motordan

## 6. Alembic migration

- Mevcut `selenora.db` yedeklendi (`*.db.backup*`, gitignored)
- Migration eksik kolonları ekledi: `result_json`, `timeline_json`, `details`, AI metadata
- Satır silinmedi (upgrade testi geçti)
- Startup: `create_all` + `run_migrations`

## 7. Frontend AI Analyst

- Tamamlanmış analiz seçimi
- Generate / regenerate / loading / 503 not-configured
- Deterministik evidence her zaman görünür
- EN/TR dil seçimi

## 8. Mission Reports

- Kayıtlı AI brifingi varsa özet + model + zaman gösterilir
- NASA / deterministik / AI katmanları metinsel olarak ayrılır (disclaimer)

## 9. Test sonuçları

| Suite | Sonuç |
|---|---|
| Backend pytest (not live) | **56 passed** |
| Frontend vitest | **28 passed** |
| `tsc -b` | 0 errors |
| `npm run build` | success |
| Live Horizons | Phase 2’de doğrulanmış (bu turda yeniden koşulmadı) |
| Live DeepSeek | **not tested** |

## 10. Performans / API kullanımı

- Explain cache: analysis + language + model + prompt_version + evidence hash
- Token usage JSON’da saklanır (canlı çağrıda)
- Bilimsel endpoint’ler DeepSeek’ten bağımsız

## 11. Kalan riskler

- Canlı model kimliği (`deepseek-flash`) henüz `/models` ile doğrulanmadı
- Senkron Horizons POST hâlâ büyük pencerelerde uzun sürebilir (Phase 2 notu)
- Ranking-contradiction heuristic dil/ifade varyantlarına karşı kırılgan olabilir

## 12. Jüri demosu

- Horizons + comparison + transparency: hazır
- AI briefing: anahtar girilince hazır; anahtarsız demoda 503 + bilimsel sonuçlar durur

## 13. Sonraki üç öneri (Phase 4’e geçme)

1. LOLA terrain horizon (`EPHEMERIS_TERRAIN`)
2. Anahtar sonrası canlı DeepSeek smoke + model id doğrulama
3. Büyük analizler için opsiyonel background job (202 semantics)

**Phase 4’e kullanıcı onayı olmadan geçilmedi.**
