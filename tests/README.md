# ชุดทดสอบ (ไม่ต้องติดตั้งอะไรเพิ่ม ใช้ Node อย่างเดียว)

```bash
node tests/test_app.js    # ฝั่งแอป: นำเข้า/กู้ข้อมูล
node tests/test_gas.js    # ฝั่ง Google Sheets: คอลัมน์ + ความปลอดภัยไฟล์สำรอง
```

`harness.js` = DOM/Dexie/localStorage ปลอม ไว้โหลด `app.js` มารันใน Node
ไม่แตะข้อมูลจริงในเครื่องและไม่ยิงเน็ตออกไปไหน
