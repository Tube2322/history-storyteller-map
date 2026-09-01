# ที่มาข้อมูลแผนที่

ขอบเขตจังหวัด/อำเภอในโฟลเดอร์นี้ดัดแปลงมาจาก
[chingchai/OpenGISData-Thailand](https://github.com/chingchai/OpenGISData-Thailand)
(`provinces.geojson`, `districts.geojson`) แล้วลดความละเอียดด้วย mapshaper

- `provinces.geojson` — 77 จังหวัดทั้งประเทศ (simplify dp 8%)
- `chonburi-districts.geojson` — 11 อำเภอของจังหวัดชลบุรี (pro_code 20) เท่านั้น (simplify dp 12%)

ต้นทางไม่ได้ระบุสัญญาอนุญาตชัดเจน — ใช้สำหรับพัฒนา/ต้นแบบ ก่อนเผยแพร่เชิงพาณิชย์ต้องตรวจสอบสิทธิ์การใช้งานอีกครั้ง
หรือพิจารณาย้ายไปใช้ข้อมูลทางการจากกรมการปกครอง/GISTDA แทน
