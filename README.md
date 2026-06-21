# Erotica Barber & Massage — POS

ระบบขายหน้าร้าน (POS) สำหรับร้านตัดผม + นวดเพื่อสุขภาพ ทำงานเป็น **PWA** (ติดตั้งลงมือถือ/iPad ได้ ใช้ออฟไลน์ได้) เก็บข้อมูลในเครื่องด้วย IndexedDB และ sync ขึ้น Google Sheets

> 📘 **คู่มือเริ่มใช้งานแบบละเอียด (มีภาพ): เปิดไฟล์ `คู่มือเริ่มใช้งาน.html`**

---

## เริ่มใช้งานเร็ว (Quick Start)

### 1) นำขึ้นเว็บ (เลือกวิธีใดวิธีหนึ่ง)

**Netlify (ง่ายสุด ไม่ต้องมีบัญชี Git):**
1. เปิด https://app.netlify.com/drop
2. ลากทั้งโฟลเดอร์นี้ไปวาง → ได้ลิงก์ HTTPS ทันที

**GitHub Pages (ลิงก์ถาวร):**
1. สร้าง repository ใหม่ แล้วอัปโหลดไฟล์ทั้งหมดนี้ไว้ที่ root
2. Settings → Pages → Source = `Deploy from a branch` → Branch = `main` / `/ (root)` → Save
3. รอสักครู่ จะได้ลิงก์ `https://<user>.github.io/<repo>/`

> ไฟล์ `.nojekyll` มีไว้กันไม่ให้ GitHub ประมวลผลแบบ Jekyll — อย่าลบ

### 2) ติดตั้งบน iPad
เปิดลิงก์ด้วย **Safari** → ปุ่ม **แชร์** → **เพิ่มไปยังหน้าจอโฮม**

### 3) Deploy Backend (Google Apps Script)
1. เปิด Google Sheets ใหม่ → Extensions → Apps Script
2. วางโค้ดจาก `google_apps_script.js` ทั้งหมด → Save
3. Deploy → New deployment → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. คัดลอก Web App URL → ใส่ในหน้า **ตั้งค่า** ของแอป

### 4) ตั้งค่าครั้งแรกในแอป (หน้า "ตั้งค่า")
- เปลี่ยน **PIN เจ้าของร้าน** (ค่าเริ่มต้น `123456`)
- ใส่ **เลขพร้อมเพย์** (เบอร์ 10 หลัก หรือเลขบัตร 13 หลัก) → QR สแกนจ่ายได้จริง
- วาง **Google Sheets URL**
- (ถ้าต้องการ) ใส่ **Telegram Token + Chat ID** สำหรับรายงานปิดกะ

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|------|--------|
| `index.html` | หน้าจอทั้งหมด (SPA) |
| `app.js` | ลอจิกระบบทั้งหมด |
| `style.css` | ดีไซน์ |
| `promptpay-qr.js` | สร้าง QR PromptPay มาตรฐาน EMVCo (สแกนจ่ายจริง) |
| `dexie.min.js` | ไลบรารี IndexedDB |
| `sw.js` | Service Worker (ออฟไลน์) |
| `manifest.json` | PWA manifest |
| `google_apps_script.js` | Backend บน Google Sheets |

## ข้อควรรู้
- ข้อมูลเก็บในเครื่อง (per-device). ควรกด **ส่งออกข้อมูล (Export)** สำรองสม่ำเสมอ และตั้ง Google Sheets URL ให้ข้อมูลขึ้นคลาวด์
- แก้ไขโค้ด GAS ภายหลังต้อง **สร้าง deployment เวอร์ชันใหม่** ทุกครั้ง
- เปลี่ยน Service Worker (`sw.js`) แล้วผู้ใช้ต้องปิด-เปิดแอปใหม่เพื่อรับเวอร์ชันล่าสุด
