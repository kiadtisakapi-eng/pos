const CACHE_NAME = 'jahn-pos-v57-uifix';
// ไฟล์หลัก — ต้องแคชให้สำเร็จ (ขาดไม่ได้ ไม่งั้นออฟไลน์ใช้ไม่ได้)
const CORE_ASSETS = [
  './',
  './index.html',
  './style_v2.css',
  './app.js',
  './dexie.min.js',
  './promptpay-qr.js',
  './manifest.json',
  // Font Awesome เก็บในโปรเจกต์แล้ว (เดิมโหลดจาก cdnjs ทุกครั้ง)
  // ต้องอยู่ใน CORE ไม่ใช่ OPTIONAL — ถ้าแคชไม่ติด ออฟไลน์แล้วไอคอนทั้งแอปหายเกลี้ยง
  './vendor/fontawesome/css/all.min.css',
  // เฉพาะ .woff2 3 ไฟล์ที่ใช้จริง — เบราว์เซอร์เลือก woff2 ก่อน .ttf เสมอ
  // (.ttf เก็บไว้ในโปรเจกต์ให้ครบชุด แต่ไม่เคยถูกเรียก จึงไม่ต้องแคช)
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './vendor/fontawesome/webfonts/fa-brands-400.woff2',
  // ตัวประกาศฟอนต์ต้องอยู่ CORE — ถ้าไฟล์นี้ไม่มี ตัวอักษรทั้งแอปตกไปใช้ฟอนต์ระบบ
  './vendor/fonts/app-fonts.css'
];
// ไฟล์ฟอนต์ตัวอักษร — แคชแบบ best-effort ทีละไฟล์
// ตั้งใจไม่ใส่ใน CORE: ถ้าน้ำหนักใดน้ำหนักหนึ่งโหลดไม่ติด การติดตั้ง SW จะล้มทั้งยวง
// แล้วแอปจะอัปเดตไม่ได้เลย ซึ่งแย่กว่าตัวหนังสือบางจุดหนาไม่ตรงแบบตอนออฟไลน์มาก
const FONT_ASSETS = [
  'sarabun-thai-300-normal', 'sarabun-thai-400-normal', 'sarabun-thai-500-normal',
  'sarabun-thai-600-normal', 'sarabun-thai-700-normal', 'sarabun-thai-800-normal',
  'sarabun-latin-300-normal', 'sarabun-latin-400-normal', 'sarabun-latin-500-normal',
  'sarabun-latin-600-normal', 'sarabun-latin-700-normal', 'sarabun-latin-800-normal',
  'outfit-latin-300-normal', 'outfit-latin-400-normal', 'outfit-latin-500-normal',
  'outfit-latin-600-normal', 'outfit-latin-700-normal', 'outfit-latin-800-normal',
  'outfit-latin-900-normal'
].map((n) => './vendor/fonts/' + n + '.woff2');
// ไฟล์เสริม — แคชแบบ best-effort (ถ้าโหลดไม่ได้ก็ไม่ทำให้ติดตั้งล้มทั้งยวง)
const OPTIONAL_ASSETS = [
  './apple-touch-icon.png'
];

// ติดตั้ง Service Worker และแคชไฟล์
// หมายเหตุ: ไม่เรียก skipWaiting() ที่นี่ — ให้ SW ใหม่ "รอ" จนกว่าผู้ใช้กดปุ่ม "อัปเดตเลย" (ผ่าน message)
self.addEventListener('install', (e) => {
  // ⚠️ ต้องใช้ cache:'reload' บังคับโหลดจากเซิร์ฟเวอร์จริง ห้ามหยิบจาก HTTP cache ของเบราว์เซอร์
  // GitHub Pages ส่ง Cache-Control: max-age=600 มาด้วย ถ้าไม่บังคับ SW ตัวใหม่อาจแคชไฟล์ "เก่า"
  // ไว้ใต้ชื่อแคชใหม่ → ผู้ใช้เห็นว่าอัปเดตแล้ว แต่โค้ดยังเป็นตัวเดิม และจะไม่ลองใหม่จนกว่า sw.js จะเปลี่ยนอีกรอบ
  const fresh = (cache, url) =>
    fetch(new Request(url, { cache: 'reload' })).then((res) => {
      if (!res || (res.status !== 200 && res.type !== 'opaque')) throw new Error('bad response ' + url);
      return cache.put(url, res);
    });

  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((u) => fresh(cache, u))).then(() =>
        Promise.allSettled(OPTIONAL_ASSETS.concat(FONT_ASSETS).map((u) => fresh(cache, u)))
      )
    )
  );
});

// รับสัญญาณจากหน้าแอป (กดปุ่มอัปเดต) → ให้ SW ใหม่เริ่มทำงานทันที
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // ให้หน้าแอปถามได้ว่า "ตอนนี้ไฟล์ที่เสิร์ฟอยู่มาจากแคชเวอร์ชันไหน"
  // ใช้ยืนยันว่าอัปเดตลงเครื่องจริงหรือยัง — ค่านี้ deploy.ps1 บวกเลขให้อัตโนมัติทุกครั้ง เชื่อถือได้กว่าเลขที่พิมพ์มือ
  if (e.data.type === 'GET_VERSION' && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ cacheName: CACHE_NAME });
  }
});

// เคลียร์แคชเก่าเมื่อมีเวอร์ชันใหม่
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ดึงข้อมูลจากแคชเมื่อไม่มีอินเทอร์เน็ต (Offline First / Cache with Network Fallback & Dynamic Caching for CDNs)
self.addEventListener('fetch', (e) => {
  // ข้าม request ที่ไม่ใช่ GET (เช่น POST ไป Google Sheets / Telegram) — ปล่อยให้ผ่านตามปกติ
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // ⚠️ ตั้งแต่ v1.5.2 แอปไม่เรียกไฟล์จากเว็บนอกแล้ว (Font Awesome + ฟอนต์ย้ายมาไว้ใน vendor/)
        // เงื่อนไขนี้จึงไม่ทำงานอีกแล้วในทางปฏิบัติ — เก็บไว้เป็นตาข่ายรองรับเผื่ออนาคตมีใครเพิ่ม CDN กลับเข้ามา
        // ถ้าไม่มีแผนจะเพิ่ม ลบทิ้งได้เลย
        const isCdn = e.request.url.includes('fonts.googleapis.com') ||
                      e.request.url.includes('fonts.gstatic.com') ||
                      e.request.url.includes('cdnjs.cloudflare.com');
        // รับทั้ง response ปกติ (200) และ opaque (no-cors — status เป็น 0 เสมอ เช่น stylesheet/webfont จาก CDN)
        // เดิมเช็คแค่ 200 ทำให้ Font Awesome ไม่เคยถูกแคชจริง → ออฟไลน์แล้วไอคอนทั้งแอปกลายเป็นสี่เหลี่ยม
        // ข้อแลก: opaque ตรวจไม่ได้ว่าเป็น error หรือไม่ — ยอมรับได้เพราะเป็นไฟล์ static จาก CDN ที่เสถียร
        if (isCdn && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // หากดึงข้อมูลล้มเหลวและเป็นหน้าหลัก ให้ส่งหน้า index.html กลับไป
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // request อื่นๆ ที่ล้มเหลวออฟไลน์ — คืน response ว่างแทน undefined (กัน error ใน respondWith)
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
