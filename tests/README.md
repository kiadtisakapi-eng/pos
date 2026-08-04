# ชุดทดสอบ (ใช้ Node อย่างเดียว ไม่ต้องติดตั้งอะไรเพิ่ม)

```bash
node tests/run-all.js     # รันทั้งหมด — ใช้ก่อน deploy ทุกครั้ง
```

| ไฟล์ | ทดสอบอะไร |
|---|---|
| `test_app.js` | นำเข้า/กู้ข้อมูลจาก Drive |
| `test_gas.js` | คอลัมน์ในชีต + ความปลอดภัยไฟล์สำรอง |
| `test_shift_variance.js` | เงินขาด/เกินตอนปิดกะ ตั้งแต่แอปถึงชีต |
| `test_update_flow.js` | กลไกอัปเวอร์ชัน Service Worker |
| `test_vat.js` | VAT รายกลุ่ม + ปัดเศษขึ้นเต็มบาท |

`harness.js` = DOM/Dexie/localStorage ปลอม ไว้โหลด `app.js` มารันใน Node
ไม่แตะข้อมูลจริงในเครื่อง และไม่ยิงเน็ตออกไปไหน
