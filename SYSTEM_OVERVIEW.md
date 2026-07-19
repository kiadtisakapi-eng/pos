# Erotica Barber & Massage — POS System Overview
> เอกสารสรุปการทำงานของระบบ POS สำหรับร้านตัดผมและนวดเพื่อสุขภาพ

---

## 📁 Directory Tree

```
โปรเจค POS/
├── index.html              # UI หลัก — ทุกหน้าอยู่ในไฟล์เดียว (SPA)
├── app.js                  # Logic ทั้งหมด (class PosApp, ~4,400 บรรทัด)
├── style_v2.css            # Dark Premium CSS Design System (~1,900 บรรทัด)
├── sw.js                   # Service Worker — cache offline (v40)
├── manifest.json           # PWA manifest — ติดตั้งบนมือถือได้
├── google_apps_script.js   # Backend บน Google Sheets (deploy เป็น Web App)
└── ลิ้งข้อมูลต่างๆ/
    └── ข้อมูลลิ้งค์ต่างๆ.txt
```

---

## 🏗 สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────┐
│                    Browser / PWA                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  index.html  │  │ style_v2.css │  │    sw.js     │  │
│  │  (6 screens) │  │  (Dark UI)   │  │ (Offline SW) │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │                                               │
│  ┌──────▼───────────────────────────────────────────┐   │
│  │                   app.js (PosApp class)          │   │
│  │                                                  │   │
│  │  State ──► Dexie.js (IndexedDB)                  │   │
│  │  ├── services, staff, customers                  │   │
│  │  ├── transactions, queue, shift                  │   │
│  │  └── settings (PIN hash, PromptPay, Sheets URL)  │   │
│  └──────────────────────┬───────────────────────────┘   │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTPS POST (fetch)
          ┌───────────────▼───────────────┐
          │    Google Apps Script (GAS)   │
          │    deployed as Web App        │
          │                               │
          │  action = "transaction"       │
          │    └─► บันทึกบิล → MM-yyyy   │
          │                               │
          │  action = "summary_day"       │
          │    └─► สร้าง สรุป-YYYY-MM-DD │
          │                               │
          │  action = "summary_month"     │
          │    └─► สร้าง สรุป-MM-yyyy    │
          │    └─► อัปเดต สรุปรายเดือน  │
          └───────────────────────────────┘
                          │
          ┌───────────────▼───────────────┐
          │       Google Sheets           │
          │  ├── สรุปรายเดือน (master)   │
          │  ├── 06-2026 (บิลรายการ)     │
          │  ├── สรุป-06-2026 (monthly)  │
          │  └── สรุป-2026-06-06 (daily) │
          └───────────────────────────────┘

          ┌───────────────────────────────┐
          │     Telegram Bot API          │
          │  └─► รายงานสรุปปิดกะ         │
          └───────────────────────────────┘
```

---

## 🔄 Data Flow หลัก

### 1. เปิดร้าน
```
เปิดแอป → [บล็อกหน้าจอ] → นับเงินสดเปิดกะ → บันทึก startCash + startTime → เข้าใช้งานได้
```

### 2. ขาย (POS)
```
เลือกบริการ → เลือกพนักงาน → ระบุลูกค้า → ส่วนลด
→ เลือกวิธีชำระ (เงินสด / QR / Credit)
→ processCheckout()
  ├── สร้าง Transaction (TX-{timestamp}-{8chars})
  ├── สร้าง Queue item (waiting)
  ├── saveState() → Dexie.js (IndexedDB)
  ├── syncPendingTransactions() → GAS [background]
  ├── พิมพ์ใบเสร็จ
  └── lazy render (dashboard + pos + queue)
```

### 3. คิวงาน
```
Queue: waiting → [startQueue] → serving [timer] → [completeQueue] → ลบออก
```

### 4. ปิดร้าน
```
นับเงินสดปิดกะ → เปรียบเทียบ expected vs counted → บันทึก shiftLog
→ sendTelegramReport()    [Telegram Bot]
→ syncDailySummary()      [GAS → สรุป-YYYY-MM-DD]
→ syncMonthlySummary()    [GAS → สรุป-MM-yyyy + สรุปรายเดือน]
→ รีเซ็ต queue + cart → เปิดหน้านับเงินใหม่
```

---

## 📱 6 หน้าหลัก

| หน้า | ฟีเจอร์หลัก |
|------|-------------|
| **Dashboard** | KPI วันนี้, คิวงาน live, ยอดขายล่าสุด, บริการยอดนิยม, ค่าใช้จ่ายรายวัน |
| **POS** | เลือกบริการ, ตะกร้า, เลือกพนักงาน, ส่วนลด, ชำระเงิน 3 ช่องทาง |
| **คิวงาน** | รอ / กำลังบริการ, progress bar countdown, เริ่ม/เสร็จ/ยกเลิก |
| **ลูกค้า** | ค้นหา, ระบบ tier (General/Gold/Platinum), note พิเศษ |
| **รายงาน** | กรองวัน/เดือน, กรองพนักงาน, commission, บริการยอดขาย, ส่งสรุป Sheets |
| **ตั้งค่า** | บริการ, พนักงาน, PromptPay, PIN, Google Sheets URL, Telegram |

---

## 🔐 ระบบความปลอดภัย

| จุด | วิธีการ |
|-----|---------|
| PIN เจ้าของร้าน | SHA-256 hash ก่อนเก็บ — ไม่มี plain text ใน IndexedDB |
| Migration | PIN เก่า (plain text) → hash อัตโนมัติตอนเปิดแอปครั้งแรก |
| Role control | staff (default) / owner (ต้องใส่ PIN) — รายงาน+ตั้งค่า owner only |
| Telegram token | เก็บใน IndexedDB (persistent ข้ามวัน) |
| GAS sync | HTTPS POST + LockService ป้องกัน race condition |

---

## ☁️ Google Sheets Structure

```
สรุปรายเดือน (sheet แรก — master)
├── ประเภท | ช่วงเวลา | บิล | รายได้รวม | ค่าใช้จ่าย | กำไรสุทธิ | อัปเดตล่าสุด
├── รายเดือน | 05-2026 | 128 | ...
├── รายเดือน | 06-2026 | 47  | ...
├── รายวัน   | 2026-06-05 | 8 | ...
└── รายวัน   | 2026-06-06 | 9 | ...

สรุป-06-2026 (monthly snapshot)
├── Section: KPI 5 ตัว (รายได้, ค่าใช้จ่าย, กำไร, บิล, เฉลี่ย/บิล)
├── Section: ช่องทางชำระเงิน (เงินสด / QR / Credit)
├── Section: รายการบริการ (จำแนกตามยอดขาย + %)
├── Section: รายละเอียดค่าใช้จ่าย + รวม
├── Section: สรุปกำไรสุทธิ (รายได้ − ค่าใช้จ่าย)
└── Section: ค่าคอมมิชชั่นพนักงานรายบุคคล

สรุป-2026-06-06 (daily snapshot) — เนื้อหาเดียวกัน เฉพาะวันนั้น

06-2026 (transaction detail)
└── เลขที่บิล | วันที่-เวลา | ลูกค้า | บริการ | ช่องทาง | ราคา | ส่วนลด | สุทธิ | พนักงาน
```

---

## ⚡ PWA & Offline

```
Service Worker (jahn-pos-v40)
├── install   → cache: index.html, app.js, style_v2.css, dexie.min.js, promptpay-qr.js, manifest.json
├── activate  → ลบ cache เก่า
└── fetch     → cache-first → fallback to network → fallback to index.html

ทำงานออฟไลน์ได้ทันที — ข้อมูลอยู่ใน Dexie.js (IndexedDB)
Sync ขึ้น Sheets เมื่อมี internet (pending → synced)
```

---

## ⚠️ จุดอ่อนที่พบ และสถานะการแก้ไข

### ✅ แก้ไขแล้ว

| จุดอ่อน | ปัญหา | วิธีแก้ |
|---------|--------|---------|
| **TX ID ซ้ำ** | ใช้ `length+1` ทำให้ซ้ำหลัง void | `TX-{timestamp}-{8char random}` |
| **PIN plain text** | เห็นได้ใน DevTools | SHA-256 hash ก่อนเก็บ |
| **GAS sync ไม่รู้ผล** | `no-cors` → ไม่รู้ว่าสำเร็จหรือเปล่า | ลบ no-cors + ตรวจ response.ok |
| **ใบเสร็จราคาผิด** | แสดง subtotal แทนราคาต่อรายการ | ใช้ `tx.details[i].price` |
| **พื้นที่ข้อมูลเต็ม** | พื้นที่จัดเก็บเบราว์เซอร์ไม่พอ | Auto-archive 90/180 วัน |
| **GAS merge crash** | cells ซ้อนกัน → script หยุด | แก้ column range ให้ถูกต้อง |
| **GAS KPI สีผิด** | กำไรติดลบยังแสดงเขียว | ตรวจ `netIncome >= 0` |
| **alert() blocking** | หน้าจอค้างทุกครั้ง | Toast notification system |
| **ไม่ validate phone** | กรอกผิดรูปแบบได้ | regex `/^0[0-9]{8,9}$/` |
| **ลูกค้าซ้ำได้** | เบอร์เดียวกัน 2 คน | Duplicate phone check |
| **addService ไม่ validate** | ราคา/เวลา = 0 ได้ | ตรวจ price > 0, duration > 0 |

### 🟡 จุดอ่อนที่ยังเหลือ (แนะนำแก้ในอนาคต)

| จุด | ผลกระทบ | แนวทาง |
|-----|---------|---------|
| **ข้อมูลไม่ real-time ข้ามอุปกรณ์** | แต่ละเครื่องข้อมูลแยกกัน + sync เป็นทางเดียว (ขึ้น Sheets เท่านั้น) | ใช้เครื่องเดียวก่อน / ย้ายไป Firebase Firestore ถ้าต้องหลายเครื่อง |
| **API_SECRET ฝังใน client** | ใครเปิด View Source เห็น secret ได้ (GAS เปิด Anyone) | ข้อจำกัดของแอป client ล้วน — รับได้สำหรับร้านเล็ก |
| **ข้อมูลบวมขนาดใหญ่** | ข้อมูลสะสมเยอะเกินไป | มี auto-archive แล้ว แต่แนะนำ export บ่อยๆ |
| **ไม่มีระบบ backup อัตโนมัติเต็มรูปแบบ** | auto-backup ทำตอนปิดกะ + ต้องตั้ง GAS URL; ถ้า browser clear ก่อนหน้าอาจหาย | กด Export JSON เองสม่ำเสมอ |
| **ไม่มี rate limiting** | ส่ง GAS ซ้ำๆ ถ้าเครือข่ายไม่เสถียร | retry with exponential backoff |

> ✅ **แก้แล้ว (มิ.ย. 2569):** QR PromptPay เป็น EMVCo มาตรฐานจริง (สแกนจ่ายได้) · ตัด fallback เบอร์พร้อมเพย์ปลอม + validate · ค่าคอมคิดบนยอดหลังหักส่วนลด · ใบเสร็จเก็บเงินรับ-ทอน · void รีเฟรชชีตสรุป · custom modal แทน confirm/alert/prompt · ล้างข้อมูล demo · apple-touch-icon สำหรับ iOS
>
> ✅ **แก้แล้ว (ก.ค. 2569 — audit รอบ 2):** ที่อยู่/เบอร์ร้านบนใบเสร็จเป็นค่าตั้งค่า (เลิก hardcode ข้อมูลปลอม) · void ส่งคำสั่งลบแถวชีตเสมอ + กัน race บิลถูก void ระหว่าง sync (ปิดช่องแถวผี) · กะข้ามเที่ยงคืน/ข้ามเดือนรีเฟรชสรุปทั้งวันเปิดและวันปิดกะ · แก้บิลย้อนหลังรีเฟรชชีตสรุปอัตโนมัติ · clamp ส่วนลด [0, subtotal] · เกลี่ยเศษสตางค์กระจายส่วนลด (largest remainder) · บล็อกขายเมื่อยังไม่มีพนักงาน · PIN ผิด 5 ครั้งล็อก 30 วิ · outbox retry มี backoff 5 นาที · GAS อ่าน master sheet ทั้งคอลัมน์ครั้งเดียว + ลบไฟล์ backup เก่ากว่า 30 วันใน Drive · validate shopLogo ตอน import

---

## 📦 IndexedDB State Keys

```
jahn_pos_services         → บริการทั้งหมด
jahn_pos_staff            → พนักงานทั้งหมด
jahn_pos_customers        → ลูกค้าทั้งหมด
jahn_pos_transactions     → ประวัติบิล (auto-archive > 365 วัน + synced)
jahn_pos_queue            → คิวงานปัจจุบัน
jahn_pos_shift            → ข้อมูลกะ (history auto-archive > 90 วัน)
jahn_pos_shop_owner_pin   → PIN เจ้าของร้าน (SHA-256 hash)
jahn_pos_shop_promptpay   → เลขพร้อมเพย์
jahn_pos_google_sheets_url → URL GAS Web App
jahn_pos_telegram_token   → Telegram Bot Token
jahn_pos_telegram_chatid  → Telegram Chat ID
(ระบบเริ่มต้นด้วยพนักงาน/ลูกค้าว่าง — ไม่มีข้อมูล demo ค้างในระบบจริง)
```

---

## 🚀 การ Deploy และ Setup

### 1. Google Apps Script
```
1. เปิด Google Sheets → Extensions → Apps Script
2. วางโค้ดจาก google_apps_script.js
3. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
4. คัดลอก URL → ใส่ในหน้าตั้งค่า POS
```

### 2. เปิดใช้งาน POS
```
Option A: เปิด index.html ตรงๆ ใน Chrome (ง่ายสุด)
Option B: Local server → python -m http.server 8080
Option C: Host บน GitHub Pages / Netlify (PWA เต็มรูปแบบ)
```

### 3. ติดตั้งบน Mobile (PWA)
```
Android: Chrome → เมนู ⋮ → Add to Home Screen
iOS:     Safari → Share → Add to Home Screen
```

---

## 🔢 Version History (สรุป)

| Feature | รายละเอียด |
|---------|-----------|
| Core POS | ขาย, คิว, ลูกค้า, พนักงาน, บริการ |
| Security | SHA-256 PIN, Role-based access |
| Cloud Sync | Google Sheets (transaction + summary) |
| Notification | Telegram Bot (shift-close report) |
| UI | Dark Premium, PWA, Mobile-first |
| Validation | Phone format, duplicate check, price/duration |
| Reliability | Toast system, auto-archive, lazy render |

---

## ⚠️ ข้อจำกัดเชิงสถาปัตยกรรม (ต้องรู้ก่อนใช้/ส่งต่อ)

1. **ใช้เครื่องเดียวเท่านั้น (single-device)** — ข้อมูลเก็บใน IndexedDB ของแต่ละเครื่องแยกกัน ถ้าเปิดขายพร้อมกัน 2 เครื่อง สรุปวัน/เดือนบนชีตจะมาจากเครื่องที่กดปิดกะเท่านั้น (บิลของอีกเครื่องไม่ถูกรวม) ห้ามใช้หลายเครื่องพร้อมกัน
2. **API_SECRET ไม่ใช่ความลับจริง** — แอปถูก deploy บน GitHub Pages (repo สาธารณะ) ใครก็เปิดอ่าน `app.js` ได้ สิ่งที่กันการยิง API ปลอมจริงๆ คือ URL `/exec` ของ Apps Script ที่ไม่อยู่ใน repo → **อย่าแชร์ URL นี้ให้ใคร** และอย่าเปิดหน้าตั้งค่าให้คนนอกเห็น ถ้าสงสัยว่า URL รั่ว ให้ Deploy เวอร์ชันใหม่ (ได้ URL ใหม่) แล้วเปลี่ยนในหน้าตั้งค่า
3. **Timezone ของ Apps Script ควรตั้งเป็น Bangkok** — ตั้งแต่ v1.2.0 แอปส่ง monthKey จากเวลาหน้าร้านไปด้วย บิลจึงลงแท็บถูกเดือนแม้ timezone ฝั่ง GAS ผิด แต่ timestamp "สร้างเมื่อ" และรอบลบแท็บรายวันเก่ายังอิง timezone ของโปรเจกต์ GAS (Project Settings > Time zone)
4. **PIN ป้องกันเฉพาะระดับหน้าจอ** — คนที่เข้าถึง DevTools ของเครื่องร้านได้สามารถอ่านข้อมูล/เดา PIN แบบ offline ได้ (PIN 6 หลัก + SHA-256) เหมาะกับ threat model ร้านค้า ไม่ใช่ระบบความปลอดภัยระดับธนาคาร
5. **ระบบนับยอดแบบ "วันทำการ" ตัดวันตอน 06:00 น.** (ตั้งแต่ v1.3.0) — ร้านเปิด 11:00 ถึงตี 3: บิล/ค่าใช้จ่ายก่อน 06:00 เช้า นับเป็นยอดของ "เมื่อวาน" ทั้งหมด (แดชบอร์ด, สรุปวัน/เดือนบนชีต, รายงาน, กราф) ผลข้างเคียงที่ต้องรู้ตอนทำบัญชี: บิลช่วง 00:00–06:00 ของเช้าวันที่ 1 จะลงแท็บเดือนของเดือนก่อนหน้า (ยึดคืนสิ้นเดือน) และการแก้/void บิลช่วงตี 0–6 ที่ sync ไว้ตั้งแต่ก่อนอัปเดต v1.3.0 อาจชี้แท็บเดือนไม่ตรงแถวเดิม (ต้องลบแถวเก่าในชีตเอง — เกิดเฉพาะบิลเก่าคาบเกี่ยวเที่ยงคืน) ค่าตัดวันแก้ได้ที่ค่าคงที่ `BUSINESS_DAY_CUTOFF_HOUR` ใน app.js

---

*เอกสารนี้สร้างอัตโนมัติจากการวิเคราะห์โค้ด — อัปเดตล่าสุด: 19 กรกฎาคม 2569 (v1.3.0)*
