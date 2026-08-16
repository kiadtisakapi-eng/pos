module.exports = () => {
  const now = Date.now();
  app.state.staff = [
    { id:'st-1', name:'สมชาย ใจดี', role:'ช่างตัดผมอาวุโส', active:true, accessLevel:'staff', pin:null },
    { id:'st-2', name:'มาลี รักงาม', role:'พนักงานนวดแผนไทย', active:true, accessLevel:'staff', pin:null },
    { id:'st-3', name:'ประสิทธิ์ มือทอง', role:'ช่างตัดผม', active:true, accessLevel:'manager', pin:null }
  ];
  app.state.customers = [
    { id:'c-1', name:'คุณอนันต์ วรรณกิจโสภณ', phone:'0812345678', visitCount:12, tier:'แพลทินัม (Platinum)', note:'ชอบตัดสั้นด้านข้าง' },
    { id:'c-2', name:'คุณสุดา', phone:'0898765432', visitCount:6, tier:'ทอง (Gold)', note:'ไม่มี' }
  ];
  app.state.shift = { active:true, startTime: now - 3*3600e3, startCash:3000, startDetails:{1000:3},
                      expenses:[{id:'e1',type:'supply',amount:350,note:'ซื้อของอื่นๆ: น้ำยาสระผม',time:now-3600e3}], history:[] };
  app.state.transactions = [];
  for (let i=0;i<14;i++){
    app.state.transactions.push({
      id:'TX-'+(now-i*600000)+'-DEMO'+i, date: now - i*600000,
      customerName: i%3===0?'คุณอนันต์ วรรณกิจโสภณ':'ลูกค้าทั่วไป (Walk-in)',
      services:['นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส'],
      details:[{name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส',price:1000,netPrice:1000,staffId:'st-2',staffName:'มาลี รักงาม',
                commission:20,commissionType:'percent',commissionAmount:200,category:'premium',vatable:false}],
      subtotal:1000, discount:0, vatRate:0, nonVatBase:1000, vatableBase:0, vatAmount:0, rounding:0,
      total:1000, paymentMethod: i%2?'cash':'promptpay', staffNames:['มาลี รักงาม'], syncStatus:'synced'
    });
  }
  app.state.queue = [
    { id:'q1', customerName:'คุณอนันต์ วรรณกิจโสภณ', status:'waiting',  startTime:null, totalDuration:120, totalAmount:1000,
      services:[{name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส',price:1000,staffId:'st-2',staffName:'มาลี รักงาม'}] },
    { id:'q2', customerName:'ลูกค้าทั่วไป (Walk-in)', status:'serving', startTime: now-1800e3, totalDuration:90, totalAmount:600,
      services:[{name:'นวดน้ำมันอโรมาอุ่นบำบัด',price:600,staffId:'st-1',staffName:'สมชาย ใจดี'}] }
  ];
  app.state.cart = [
    { uniqueCartId:'k1', id:'s9', name:'นวดอโรม่าพรีเมียมบำบัดผิวหน้ากระจ่างใส', price:1000, duration:120,
      commission:20, commissionType:'percent', category:'premium', staffId:'st-2', staffName:'มาลี รักงาม' },
    { uniqueCartId:'k2', id:'s1', name:'ตัดผมชายสไตล์วินเทจ', price:300, duration:45,
      commission:10, commissionType:'percent', category:'barber', staffId:'st-1', staffName:'สมชาย ใจดี' }
  ];
  app.currentRole='owner'; app.currentUser={id:'__owner__',name:'เจ้าของร้าน'};
  app.clearDateKeyCache();
  ['modal-login','modal-cash-counter'].forEach(m=>app.closeModal(m));
  app.updateUserRoleUI();
};;