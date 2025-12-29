# RFC – In-Browser ETL Runtime Module (Updated After CTO Review)

**Status:** Draft – For Review
**Author:** Erdem
**Audience:** CTO, Frontend Architecture Group
**Decision Type:** Architectural
**Scope:** Browser-Runtime Compute / High-Volume Schema Transformation
**Revision:** Includes CTO feedback – PoC first, timeline revised

---

## 1. Problem Tanımı

Frontend şu sorunları içeren veri modeliyle çalışmak zorunda:

* API payloadları büyük (200KB – 5MB)
* Satır sayısı yüksek (5.000 – 890.000)
* Nested JSON (depth ~10)
* UI migration için **schema mismatch** var (eski → yeni data model)
* Transform işlemi CPU-bound → UI thread freeze
* Query cache hâlâ eski formatı tutuyor → UI tutarsızlık riski
* Sayfa geçişlerinde tekrar işleme → maliyet artışı

Backend tarafı schema migrasyonu 80+ DB etki zinciri nedeniyle yapılabilir değil.
Bu nedenle çözüm FE-runtime içinde data reshaping & caching.

---

## 2. Önerilen Çözüm – Internal ETL Runtime

Tarayıcı içinde, network response geldikten sonra:

```
Extract  →  Transform  →  Load (Cache)
```

Bu modül:

* TanStack/React bağımlısı değildir
* Tek sorumluluğa sahip compute katmanı sağlar
* UI yalnızca **final structured dataset** ile çalışır

---

## 3. Mimari (High-Level)

```
API Response / JSON stream
        │
        ▼
Extract Layer
- JSON → iterable / async iterable
- (streaming optional – v2)

        │
        ▼
Transform Layer
- Strong schema DSL
- cast (date / bigint / number)
- compute fields
- nullable / default
- validators
- chunk-based mapping (~4.000 rows)
- worker isolation (CPU off-thread)

        │
        ▼
Load Layer
- L1 memory cache
- L2 persistent cache (IndexedDB > LocalStorage fallback)
- preload, hydrate, invalidate, TTL
```

Worker merkezlidir → UI freeze sıfır.

---

## 4. Strong Schema DSL – Amaç

UI modeline uygun veri üretilmesi:
Type-correct, sanitized, predictable.

Örnek rule:

```ts
{
  id: "meta.id",
  createdAt: { path: "meta.ts", cast: "date" },
  items: {
    mapArray: "payload.items",
    item: {
      sku: "id",
      qty: { path: "count", cast: "number", default: 0 }
    }
  }
}
```

---

## 5. Sprint Planı (REVIZE – CTO Feedback Included)

Önce PoC – sonra implementasyon.

### Objective-based Plan

| Sprint | Deliverable                                    | Amaç                                |
| ------ | ---------------------------------------------- | ----------------------------------- |
| 1      | **PoC** – Worker + minimal transform + UI test | Risk: UI freeze çözülüyor mu?       |
| 2      | Runtime core + basic chunk executor            | Compute altyapısı                   |
| 3      | Medium schema DSL + sanitize                   | Strong DSL değil – basit başlayarak |
| 4      | Cache L1 + invalidate + preload + hydrate      | Performans / correctness            |
| 5      | Full Strong DSL + validators                   | Feature completion                  |
| 6      | Persistent cache (IndexedDB)                   | Durability                          |
| 7      | Streaming-reader + backpressure (optional)     | High-volume optimizasyon            |
| 8      | React adapter + pilot integration (1 ekran)    | Controlled rollout                  |

**Toplam süre (2w sprint varsayımı): 14–16 hafta**

> 1 senior dev için tahmini: 14-16 hafta. 0.5 FTE veya interruption varsa: +30% buffer.

---

## 6. CTO-Level Açık Karar Maddeleri (Needed Before Sprint 1)

Aşağıdaki sorular PoC öncesinde netleşmelidir:

| Konu              | Karar Bekleniyor                            |
| ----------------- | ------------------------------------------- |
| DSL kapsamı       | Medium → Strong’a geçiş ne zaman?           |
| Memory eviction   | LRU / TTL / persistent-only?                |
| Error mode        | soft (log + continue) mı, strict (stop) mı? |
| Streaming         | V1 ertelensin mi? (Öneri: evet)             |
| Cache persistence | IndexedDB MVP’de zorunlu mu?                |

---

## 7. Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Worker overhead (structured clone) | Medium | High | Benchmark Sprint 1'de |
| SAB / Transferable security policy | Low | Medium | V2'ye ertelendi |
| DSL learning curve | Low | Medium | Tooling Sprint 5'te |
| Cache invalidation complexity | Medium | Medium | Ayrı RFC planlanacak |
| Partial failure handling | Medium | Low | Error mode kararı Sprint 1 |
| Memory growth (20-40MB) | High | Medium | Eviction policy Sprint 4 |

---

## 8. İlk Adım – MVP / Proof of Concept

**PoC Scope:**

* Tek dataset, örn. 200KB–1MB
* Worker + transform + UI-observable
* Chunk execution
* Final structured output

**PoC Success Criteria:**

| Metric | Target |
|--------|--------|
| Transform 10K row | < 50ms (worker time) |
| Main thread block | = 0ms |
| Memory delta | < 5MB |
| UI render | Observable output doğru render |

PoC sonrası **continue / pivot / kill** kararı verilebilir.

---

## 9. Neden Bu Yöntem?

Alternatif: backend schema değiştirme → büyük zincir etki.
Modüler çözüm: transformation FE-runtime’da; UI ve backend ayrışır.

Bu runtime – gelecekte offline-first, sync, background compute gibi özellikleri destekleyebilecek doğru “center of gravity”.

---

## 10. Talep

**Bu doküman ile talep edilen yalnızca:**

* PoC geliştirmesi için onay
* Yukarıdaki CTO-level açık karar maddelerinin cevaplanması
* Sonrasında implementasyon backlog’unun finalize edilmesi

---
