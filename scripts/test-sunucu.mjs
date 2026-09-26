#!/usr/bin/env node
// NÖBETÇİ YEREL SUNUCUSU — "npm run baslat" (ya da "npm run test-sunucu") ile başlar; platform
// arayüzünü (GET /) ve /platform/* uç noktalarını sunar, Nöbetçi'den başlatılan Playwright koşularını
// bu makinede çalıştırır (/platform/senaryolar/calistir → senaryoyuCalistirVeYanitla), durdurur
// (/durdur), canlı ekran görüntüsünü verir (/canli) ve girişte SMS kodu "elle" girilecekse koşu
// panelinin kod isteğini/yanıtını iletir (/kod-istegi, /kod-gonder). Proje verisi YALNIZCA platform veritabanındadır
// (veri/platform.db); eski dosya tabanlı uçlar (dashboard, /calistir, /kosu-listesi, JetSeyahat
// senaryo dosyası düzenleyicileri) kaldırıldı.
//
// GÜVENLİK NOTLARI:
// 1) Sunucu YALNIZCA 127.0.0.1'e bağlanır — ağdaki başka hiçbir cihaz erişemez.
// 2) Yalnızca sunucunun kendi sunduğu arayüzün aynı-köken istekleri (http://127.0.0.1:<PORT>) kabul
//    edilir; başka bir origin'den gelen her istek reddedilir.
// 3) Her istek, her sunucu başlangıcında üretilen ve YALNIZCA bellekte duran oturum token'ını taşır
//    (sayfaya yanıt içinde enjekte edilir, diske yazılmaz). Playwright raporlayıcısı ayrı, yine
//    yalnızca bellekte duran bir raporlayıcı token'ı kullanır (alt sürecin ortamıyla verilir).
// 4) Çalıştırılacak senaryo adı serbest metin olarak KABUL EDİLMEZ — gelen ad,
//    "playwright test --list" ile o an gerçekten var olan senaryo başlıklarıyla
//    birebir eşleşmek zorundadır (whitelist). Eşleşmeyen istekler reddedilir.
// 5) Süreç başlatma her zaman execFile/spawn ARGÜMAN DİZİSİ ile yapılır, shell HİÇ
//    kullanılmaz — "npx" yerine doğrudan node_modules/@playwright/test/cli.js,
//    bu makinedeki Node ile (process.execPath) çalıştırılır. Komut enjeksiyonu mümkün değildir.
//
// Kullanım: "npm run baslat" (tarayıcıda Nöbetçi'yi de açar) ya da "npm run test-sunucu".

import 'dotenv/config';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, appendFileSync, readdirSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  platformCalismaAlanlariniHazirla, platformEtkinligiBildir, platformIsteginiIsle, platformKapanirken, platformKasaAcikMi, platformKosuSonucu,
  platformKosusunuKapat, platformKosucusunuAyarla, platformMedyaTemizligiZamanla, platformOtomatikYedekZamanla, platformSonucKaydiEtkinMi,
  platformSunucuBaglantisiniAyarla, platformTestOrtami, platformTumVeritabaniYollari, platformVeritabaniYolu
} from './platform/sunucu-platform.mjs';
import { KOD_YOLU_DEGISKENI, kodIstegiOku, kodIsteginiTemizle, koduYanitla } from './platform/giris/elle-kod.mjs';
import { taramalariKapat } from './platform/tarama/yonetici.mjs';
import {
  DOSYA_KLASORU_DEGISKENI, artikKlasorleriTemizle, geciciDosyaKoku, kosuKlasoruOlustur, kosuKlasorunuSil, sahipYaz
} from './platform/dosyalar/gecici-dosyalar.mjs';

const buDosyaninKlasoru = dirname(fileURLToPath(import.meta.url));
const projeKoku = join(buDosyaninKlasoru, '..');
const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
// Nöbetçi'den başlatılan tek bir koşunun (süreç başladıktan sonra) en fazla ne kadar
// sürebileceği. En uzun senaryo zaman aşımı 3 dk + giriş; 10 dk güvenli bir üst sınır.
// Gerekirse .env içinde TEST_SUNUCU_SURE_LIMITI_DK ile değiştirilebilir.
const KOSU_SURE_LIMITI_MS = (Number(process.env.TEST_SUNUCU_SURE_LIMITI_DK) || 10) * 60 * 1000;
// YALNIZCA doğrulama/geliştirme örnekleri için: TEST_SUNUCU_KOSU_KAPALI=1 ise bu sunucu hiçbir
// Playwright koşusu başlatmaz (▷, Koşuyu başlat, Dene); istek açık bir hatayla reddedilir.
const KOSU_KAPALI = process.env.TEST_SUNUCU_KOSU_KAPALI === '1';

// Terminal panelinin scrollback'i sınırlı/silinebilir olduğundan (ör. aynı panelde
// başka bir komut çalıştırılırsa), TÜM konsol çıktısını AYRICA kalıcı bir dosyaya da
// yazıyoruz — terminali göremediğimizde bile "test-sunucu.log" dosyasını okuyarak son
// koşunun tam çıktısını görebiliyoruz. Dosya sınırsız büyümesin diye 2MB'ı geçince baştan
// kırpılır.
// TEST_SUNUCU_LOG_DOSYASI: ikinci bir örnek (ör. birim testlerinin geçici sunucusu) kendi log dosyasına yazar.
const logDosyasi = process.env.TEST_SUNUCU_LOG_DOSYASI || join(buDosyaninKlasoru, 'test-sunucu.log');
function logaYaz(satir) {
  try {
    if (existsSync(logDosyasi) && statSync(logDosyasi).size > 2 * 1024 * 1024) {
      const mevcut = readFileSync(logDosyasi, 'utf-8');
      writeFileSync(logDosyasi, mevcut.slice(-1 * 1024 * 1024));
    }
    appendFileSync(logDosyasi, `[${new Date().toISOString()}] ${satir}\n`);
  } catch {
    // yok sayılır — loglama asla asıl işi bozmamalı
  }
}
const orijinalConsoleLog = console.log.bind(console);
console.log = (...args) => {
  orijinalConsoleLog(...args);
  logaYaz(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};
const orijinalConsoleError = console.error.bind(console);
console.error = (...args) => {
  orijinalConsoleError(...args);
  logaYaz('[error] ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

// OTURUM TOKEN'I — platform arayüzü (GET / ile sunulan kabuk) için. Her sunucu başlangıcında
// rastgele üretilir, YALNIZCA bellekte durur ve HİÇBİR dosyaya yazılmaz: sunucu her yanıtta sayfaya
// (HTML içine) enjekte eder; yanıt "no-store" ile önbelleğe alınmaz.
const OTURUM_TOKEN = randomBytes(32).toString('hex');
// RAPORLAYICI TOKEN'I — Playwright raporlayıcısı (scripts/platform/raporlayici.mjs) sonuçları bu
// sunucuya bununla yazar (yalnızca /platform/sonuc/* uçlarında geçerli). Her başlangıçta yeniden
// üretilir; Nöbetçi koşularına ortam değişkeniyle verilir. Terminal koşularının sunucuyu bulabilmesi
// için veritabanının yanındaki bağlantı dosyasına (0600, veri/ altında, kapanışta silinir) yazılır —
// bkz. scripts/platform/sunucu-baglantisi.mjs.
const RAPORLAYICI_TOKENI = randomBytes(32).toString('hex');

/** Zamanlamadan bağımsız karşılaştırma. @param {unknown} a @param {string} b */
function tokenEsit(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Bu sürecin oturum token'ı mı? @param {unknown} token */
function tokenGecerli(token) {
  const gecerli = tokenEsit(token, OTURUM_TOKEN);
  // Kimliği doğrulanmış arayüz etkinliği platform kasasının otomatik kilit sayacını sıfırlar.
  if (gecerli) platformEtkinligiBildir();
  return gecerli;
}

/** Koşu anahtarı "<dosya>::<başlık>" (dosya "/" ayraçlı; tests/support/kosu-listesi.ts ile aynı biçim). */
function kosuAnahtari(dosya, ad) {
  return `${String(dosya).replace(/\\/g, '/')}::${ad}`;
}

// "npx playwright ..." yerine kullanılıyor: node_modules/@playwright/test/cli.js
// dosyasının tam yolu. Bu, npm'in kendi "playwright" komutunun da altta çalıştırdığı
// GERÇEK JavaScript dosyasıdır — bunu process.execPath (bu makinedeki node.exe) ile
// doğrudan çalıştırmak, "npx"i (ve onun Windows'taki .cmd sorununu) tamamen devre
// dışı bırakır.
const PLAYWRIGHT_CLI_YOLU = join(projeKoku, 'node_modules', '@playwright', 'test', 'cli.js');

function playwrightCliVarMi() {
  if (existsSync(PLAYWRIGHT_CLI_YOLU)) return true;
  console.error(
    `[test-sunucu] "${PLAYWRIGHT_CLI_YOLU}" bulunamadı — önce "npm install" çalıştırmanız gerekiyor.`
  );
  return false;
}

// Klasör adı -> Allure Epic (ürün) görünen adı. tests/support/fixtures.ts'teki
// EPIC_ADLARI ile AYNI TUTULMALI — "Senaryolar" tablosundaki ürün adı, allure
// raporundaki ve Nöbetçi'deki diğer tablolardakiyle tutarlı olsun diye.
const EPIC_ADLARI = {
  'jet-kasko': 'JetKasko',
  'jet-seyahat': 'JetSeyahat',
  'jet-dask': 'JetDASK',
  'jet-kobi': 'JetKOBİ',
  'jet-konut': 'JetKonut',
  'jet-saglik': 'JetSağlık',
  'jet-ilk-ates-konut': 'İlk Ateş Konut',
  'jet-satis': 'Jet Satış',
  trafik: 'Trafik',
  portal: 'Portal'
};

function urunAdiBul(dosyaYolu) {
  if (!dosyaYolu) return 'Diğer';
  // "--list --reporter=json" çıktısındaki spec.file, testDir'e GÖRE GÖRELİ bir yol
  // ("scenarios/jet-kobi/teklif-matrisi.spec.ts" gibi, başında "/" YOK) — bu yüzden
  // eşleşme başta "/" aramaz (fixtures.ts'teki testInfo.file MUTLAK yol olduğundan
  // orada "/" aranıyor, ikisi farklı kaynak).
  const normalizeEdilmisYol = dosyaYolu.replace(/\\/g, '/');
  const senaryoEslesme = normalizeEdilmisYol.match(/(?:^|\/)scenarios\/([^/]+)\//);
  if (senaryoEslesme) return EPIC_ADLARI[senaryoEslesme[1]] ?? senaryoEslesme[1];
  const canliEslesme = normalizeEdilmisYol.match(/(?:^|\/)canli\/([^/]+)\.spec\.ts$/);
  if (canliEslesme) return EPIC_ADLARI[canliEslesme[1]] ?? canliEslesme[1];
  return 'Diğer';
}

function jsonGonder(res, durumKodu, govde) {
  const metin = JSON.stringify(govde);
  res.writeHead(durumKodu, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(metin);
}

// Yalnızca sunucunun kendi sunduğu arayüzün aynı-köken istekleri (http://127.0.0.1:<PORT>,
// http://localhost:<PORT>) kabul edilir; Origin başlığı olmayan istekler (ör. aynı-köken GET
// gezintileri) de kabul edilir (token ayrıca zorunludur). Başka bir origin her zaman reddedilir.
const AYNI_KOKENLER = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
function originIzinliMi(req) {
  const origin = req.headers.origin;
  return origin === undefined || (typeof origin === 'string' && AYNI_KOKENLER.has(origin.toLowerCase()));
}

// Sunucu zaten yalnızca 127.0.0.1'e bağlanıyor; bu kontrol ek bir savunma katmanı:
// (1) İsteğin KAYNAĞI gerçekten bu makine mi (loopback adresi)?
// (2) Host başlığı bizim adresimiz mi? — "DNS rebinding" saldırısında kötü niyetli bir
//     site kendi alan adını 127.0.0.1'e çözdürüp tarayıcıyı bu sunucuya yönlendirebilir;
//     o durumda Host başlığı saldırganın alan adını (ör. evil.com) taşır ve burada reddedilir.
// Arayüz her zaman "http://127.0.0.1:<PORT>" (aynı köken) üzerinden konuşur, bu yüzden meşru
// istekler etkilenmez.
const LOOPBACK_ADRESLERI = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const IZINLI_HOST_BASLIKLARI = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function yerelIstekMi(req) {
  const kaynak = req.socket?.remoteAddress;
  const host = String(req.headers.host ?? '').toLowerCase();
  return Boolean(kaynak && LOOPBACK_ADRESLERI.has(kaynak) && IZINLI_HOST_BASLIKLARI.has(host));
}

function govdeOku(req, maxBoyut = 1_000_000) {
  return new Promise((resolve, reject) => {
    let parcalar = '';
    req.on('data', (parca) => {
      parcalar += parca;
      if (parcalar.length > maxBoyut) {
        reject(new Error('İstek gövdesi çok büyük.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(parcalar));
    req.on('error', reject);
  });
}

function regexIcinKac(metin) {
  return metin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "npx playwright test --list --reporter=json" çalıştırır, isteğe bağlı EK argümanlarla
// (ör. belirli bir dosyaya ve/veya --grep'e daraltmak için) daraltılmış bir liste
// döner. tumSenaryolariGetir (aşağıda) bunu argümansız çağırır; testiCalistirVeBekle
// ise bir senaryoyu ÇALIŞTIRMADAN ÖNCE dosya+grep ile daraltıp TAM OLARAK 1 sonuç
// döndüğünü doğrulamak için kullanır (bkz. o fonksiyondaki NOT).
// ekOrtamDegiskenleri: Senaryolar > "Dene", geçici "ek veri" dosyasının yolunu
// (TEST_SUNUCU_EK_SENARYO_DOSYASI) listeleme sürecine de vermek için kullanır — aksi halde
// Playwright geçici senaryoyu listede göremez ve whitelist kontrolü onu reddeder.
// genel: { projeId, ortamId } verilirse (elle oluşturulan proje/ortam) liste genel model yapılandırmasından alınır
// (bkz. genelKosuAyarlari).
function senaryolariListele(ortam, ekstraArgumanlar = [], grepDeseni = undefined, ekOrtamDegiskenleri = {}, genel = null) {
  return new Promise((resolve, reject) => {
    if (!playwrightCliVarMi()) {
      reject(new Error(`"${PLAYWRIGHT_CLI_YOLU}" bulunamadı (npm install çalıştırılmamış olabilir).`));
      return;
    }
    const g = genelKosuAyarlari(genel, ortam);
    execFile(
      process.execPath,
      [PLAYWRIGHT_CLI_YOLU, 'test', '--list', '--reporter=json', ...g.argumanlar, ...ekstraArgumanlar],
      {
        cwd: projeKoku,
        // NOT: grep deseni artık "--grep" CLI argümanı DEĞİL, TEST_SUNUCU_GREP_DESENI
        // ortam değişkeni ile aktarılır (bkz. playwright.config.ts'teki "grep" ayarı ve
        // gercektenCalistir'deki açıklama) — Windows'ta argüman-satırı Unicode
        // bozulmasından kaçınmak için.
        // TEST_SUNUCU_TUM_LISTE=1: playwright.config.ts'teki koşu listesi filtresi
        // (grepInvert) bu listelemede UYGULANMAZ — "Senaryolar" tablosu, whitelist ve
        // /kosu-listesi doğrulaması koşudan hariç tutulanlar dahil TÜM senaryoları görmeli.
        env: {
          ...process.env,
          ...g.ortamDegiskenleri,
          TEST_SUNUCU_TUM_LISTE: '1',
          // Kasa açıksa türetilmiş anahtar (yalnızca alt sürecin belleğinde): liste veritabanından
          // kurulur. Kasa kilitliyse liste alınamaz (testler veriyi yalnızca veritabanından okur).
          ...platformTestOrtami(),
          ...(grepDeseni ? { TEST_SUNUCU_GREP_DESENI: grepDeseni } : {}),
          ...ekOrtamDegiskenleri
        },
        maxBuffer: 32 * 1024 * 1024,
        shell: false
      },
      (hata, stdout) => {
        if (hata && !stdout) {
          reject(hata);
          return;
        }
        try {
          const veri = JSON.parse(stdout);
          const liste = [];
          (function suitleriGez(suite, ustDosya) {
            const buDosya = suite.file ?? ustDosya;
            for (const alt of suite.suites ?? []) suitleriGez(alt, buDosya);
            for (const spec of suite.specs ?? []) {
              const specDosya = spec.file ?? buDosya;
              if (spec.title) {
                // Spec'in test tanımında verdiği "beklenenSonuc" annotation'ı (şu an JetSeyahat
                // — bkz. prim-hesaplama.spec.ts) "--list" çıktısında da gelir; dashboard'daki
                // Senaryolar tablosu bunu rozet olarak gösterir. Yoksa alan hiç eklenmez.
                const beklenenSonuc = (spec.tests ?? [])
                  .flatMap((t) => t.annotations ?? [])
                  .find((a) => a?.type === 'beklenenSonuc' && typeof a.description === 'string')?.description;
                liste.push({
                  ad: spec.title,
                  urun: urunAdiBul(specDosya),
                  dosya: specDosya,
                  satir: spec.line,
                  // Etiketler (ör. model koşucusunun "@model-<UUID>" etiketi — model senaryosu etiketle bulunur).
                  etiketler: Array.isArray(spec.tags) ? spec.tags.map((t) => (String(t).startsWith('@') ? String(t) : `@${t}`)) : [],
                  ...(beklenenSonuc ? { beklenenSonuc } : {})
                });
              }
            }
          })(veri, undefined);
          resolve(liste);
        } catch (ayristirmaHatasi) {
          reject(ayristirmaHatasi);
        }
      }
    );
  });
}

// "Seçilenleri çalıştır" ile aynı anda tetiklenen birden fazla /calistir isteği,
// whitelist kontrolü için aynı anda ayrı ayrı "playwright test --list" alt süreçleri
// başlatırsa (aynı proje üzerinde eşzamanlı derleme/transform önbelleği erişimi
// yüzünden) ara sıra eksik/boş sonuç dönebiliyordu. Bunu önlemek için, aynı ortam
// için o an ZATEN devam eden bir liste isteği varsa yeni bir alt süreç başlatmak
// yerine o isteğin sonucunu PAYLAŞIYORUZ — eşzamanlı istekler tek bir gerçek
// "--list" çağrısına birleşiyor.
const devamEdenListelemeler = new Map();

// O an gerçekten var olan TÜM senaryoları (ad + ürün + dosya) Playwright'ın kendisinden
// alır — koşu isteklerindeki whitelist kontrolünün kaynağı budur (istemcinin gönderdiği veriye
// asla güvenilmez). genel: elle oluşturulan proje/ortam (listeleme anahtarı proje + ortam kimliği).
function tumSenaryolariGetir(ortam, genel = null) {
  const anahtar = genel ? `genel:${genel.projeId}:${genel.ortamId}` : ortam;
  const devamEden = devamEdenListelemeler.get(anahtar);
  if (devamEden) return devamEden;

  const istek = senaryolariListele(ortam, [], undefined, {}, genel).finally(() => {
    devamEdenListelemeler.delete(anahtar);
  });
  devamEdenListelemeler.set(anahtar, istek);
  return istek;
}

// GENEL YOL (elle oluşturulan proje/ortam; aktarımla "test"/"canli" anahtarına eşlenmemiş ortamdaki model senaryosu):
// Playwright genel model yapılandırmasıyla (playwright.model.config.ts) ve proje + ortam KİMLİKLERİYLE başlatılır;
// TEST_ENV verilmez. Aksi halde eski yol: asıl yapılandırma + TEST_ENV (ortam anahtarı).
const MODEL_YAPILANDIRMASI = 'playwright.model.config.ts';
function genelKosuAyarlari(genel, ortam) {
  if (!genel) return { argumanlar: [], ortamDegiskenleri: { TEST_ENV: ortam } };
  return {
    argumanlar: ['--config', MODEL_YAPILANDIRMASI],
    ortamDegiskenleri: { NOBETCI_PROJE_ID: genel.projeId, NOBETCI_ORTAM_ID: genel.ortamId }
  };
}

// Şu an çalışmakta olan süreçleri kosuId -> { surec, pid, iptalEdiliyor } şeklinde
// tutar. /durdur isteği buradan ilgili süreci bulup öldürür; testiCalistirVeBekle de
// süreç kapandığında burayı temizler.
//
// NOT (4. kök neden — "satır durdur tuşu takılıyor/durdurmuyor"): Bu Map ÖNCEDEN
// senaryoAdi (başlık) ile anahtarlanıyordu. Ama aynı başlık BİRDEN FAZLA ürün
// dosyasında tekrarlanabildiği için (bkz. testiCalistirVeBekle'deki 3. kök neden
// notu), aynı anda aynı başlıklı 2 senaryo koştuğunda ikincisinin calisanSurecler.set
// çağrısı BİRİNCİNİN kaydını EZİYORDU — böylece o satırın kendi Durdur tuşu, artık map
// içinde bulunmayan/başka bir sürece işaret eden kaydı hedefliyor, gerçek süreç hiç
// ölmüyor ve buton sonsuza dek "Durduruluyor..." durumunda takılı kalıyordu. Çözüm:
// anahtar olarak, dashboard'un HER TEKİL koşu isteği için ürettiği benzersiz bir
// "kosuId" kullanılır (senaryoAdi yalnızca loglamada kullanılır) — böylece aynı
// başlıklı iki koşu asla aynı anahtarı paylaşmaz.
const calisanSurecler = new Map();

// ---- Platform arayüzü (scripts/platform/arayuz/) ----------------------------------------
// GET /            → kabuk (index.html; oturum token'ı <meta> olarak enjekte edilir)
// GET /arayuz/*    → kabuğun statik CSS/JS dosyaları (sır içermez)
// Tüm HTML yanıtları: Cache-Control: no-store (token tarayıcı önbelleğine düşmesin),
// X-Frame-Options: SAMEORIGIN (başka sitelerin çerçevelemesi engellenir).
const ARAYUZ_KLASORU = join(buDosyaninKlasoru, 'platform', 'arayuz');
const ARAYUZ_DOSYALARI = new Map([
  ['/arayuz/stil.css', { dosya: 'stil.css', tur: 'text/css; charset=utf-8' }],
  ['/arayuz/uygulama.js', { dosya: 'uygulama.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ortak.js', { dosya: 'ortak.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ice-aktarma.js', { dosya: 'ice-aktarma.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ayarlar.js', { dosya: 'ayarlar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/giris-tarifi.js', { dosya: 'giris-tarifi.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/aktarim.js', { dosya: 'aktarim.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/sonuclar.js', { dosya: 'sonuclar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryolar.js', { dosya: 'senaryolar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/servisler.js', { dosya: 'servisler.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/servis-sihirbazi.js', { dosya: 'servis-sihirbazi.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/servis-alanlari.js', { dosya: 'servis-alanlari.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/urunler.js', { dosya: 'urunler.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryo-formu.js', { dosya: 'senaryo-formu.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryo-diyagrami.js', { dosya: 'senaryo-diyagrami.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/kosu-paneli.js', { dosya: 'kosu-paneli.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ekranlar.js', { dosya: 'ekranlar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ekran-ortak.js', { dosya: 'ekran-ortak.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ekran-yonetimi.js', { dosya: 'ekran-yonetimi.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/calisma-alani.js', { dosya: 'calisma-alani.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/proje-islemleri.js', { dosya: 'proje-islemleri.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/sayfa-paketi.js', { dosya: 'sayfa-paketi.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/bulgular.js', { dosya: 'bulgular.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/dosya-yukleme.js', { dosya: 'dosya-yukleme.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/tarama.js', { dosya: 'tarama.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/akis-tasarimi.js', { dosya: 'akis-tasarimi.js', tur: 'text/javascript; charset=utf-8' }],
  // Genel, saf modüller arayüzle PAYLAŞILIR (kopya yok): model tabanlı form ve tek senaryo doğrulayıcısı.
  ['/arayuz/servis-govdesi.mjs', { yol: join(buDosyaninKlasoru, 'platform', 'servisler', 'servis-govdesi.mjs'), tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/model-formu.mjs', { yol: join(buDosyaninKlasoru, 'platform', 'senaryolar', 'model-formu.mjs'), tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/akis-diyagrami.mjs', { yol: join(buDosyaninKlasoru, 'platform', 'senaryolar', 'akis-diyagrami.mjs'), tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryo-dogrulayici.mjs', { yol: join(buDosyaninKlasoru, 'dogrulama', 'senaryo-dogrulayici.mjs'), tur: 'text/javascript; charset=utf-8' }]
]);
const KABUK_GUVENLIK_BASLIKLARI = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
    "frame-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'; object-src 'none'"
};

function arayuzIsteginiIsle(req, res) {
  const yol = req.url.split('?')[0];
  if (yol === '/' || yol === '/index.html') {
    const html = readFileSync(join(ARAYUZ_KLASORU, 'index.html'), 'utf-8').replace('__OTURUM_TOKENI__', OTURUM_TOKEN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...KABUK_GUVENLIK_BASLIKLARI });
    res.end(html);
    return true;
  }
  const dosya = ARAYUZ_DOSYALARI.get(yol);
  if (!dosya) return false;
  res.writeHead(200, { 'Content-Type': dosya.tur, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.end(readFileSync(dosya.yol ?? join(ARAYUZ_KLASORU, dosya.dosya)));
  return true;
}

// NOT (önemli, "Tümünü durdur"da bazı senaryoların durmaması kök nedeni): AYNI
// DOSYADAKİ senaryolar dosyaSirasiIleCalistir ile SIRAYA konuyor (bkz. aşağıdaki
// açıklama) — yani "Seçilenleri çalıştır" ile aynı anda tetiklenen 3 senaryodan
// ikisi aynı dosyadaysa, ikincisi/üçüncüsü henüz GERÇEKTEN başlamamış (calisanSurecler
// içinde YOK), sırasının gelmesini bekliyor olabilir. Böyle bir senaryo için /durdur
// çağrılınca calismaDurdur eskiden "çalışan süreç yok" deyip hiçbir şey yapmıyordu —
// süreç kapanan ilk senaryonun ardından kuyruktaki bir sonraki senaryo YİNE DE
// başlıyordu ("Tümünü durdur"a rağmen 2. ve 3. senaryo çalışmaya devam ediyor" hatası
// buydu). Çözüm: henüz başlamamış ama durdurulması istenen koşuların kosuId'leri bu
// kümeye eklenir; gercektenCalistir sırası gelince (dosya kuyruğundan çıkınca) spawn
// ETMEDEN ÖNCE bu kümeyi kontrol eder, kosuId burada ise hiç başlatmadan "iptal edildi"
// sonucu döner.
const baslamadanIptalEdilecekler = new Set();

// NOT (5. kök neden — "2. satırı durdurdum ama görünürde hiçbir şey olmuyor, takılı
// kalmış gibi görünüyor"): Yukarıdaki mekanizma DOĞRU şekilde işaretliyordu, ama kuyrukta
// bekleyen bir koşunun /calistir isteği HTTP yanıtını ancak GERÇEK sırası gelip
// gercektenCalistir onu (hiç başlatmadan) "iptal" ile çözdüğünde dönüyordu — yani
// kullanıcı 2. satırı durdursa bile, 1. satır (aynı dosyada, önde) bitene kadar
// dashboard'da 2. satır hâlâ "çalışıyor/Durduruluyor..." görünmeye devam ediyordu; kullanıcı
// bunu "tıklama işe yaramadı" sanıyordu. Çözüm: kuyrukta bekleyen her koşu için, HTTP
// yanıtını çözecek "resolve" fonksiyonu kosuId ile burada saklanır; calismaDurdur, koşu
// henüz çalışmıyorsa (kuyrukta bekliyorsa) bu resolve'u HEMEN çağırıp "iptal" sonucunu
// döner — kullanıcı satırın durduğunu ANINDA görür. Koşunun kuyruktaki GERÇEK sırası
// geldiğinde gercektenCalistir yine baslamadanIptalEdilecekler'i kontrol eder ve süreci
// hiç başlatmaz (bu Map'teki erken-çözülmüş giriş o noktada zaten silinmiş olduğundan
// ikinci bir yanıt gönderilmez, güvenlidir).
const kuyruktaBekleyenler = new Map();

// kosuId -> "<dosya>::<ad>" (kosuAnahtari biçiminde). testiCalistirVeBekle'ye giren
// her koşu (kuyrukta bekleyen ya da gerçekten çalışan) burada durur; dosya sırasındaki
// görevi bitince silinir. Platform Senaryolar (kaydet/sil), o an koşan bir senaryonun verisini
// (ör. başlığını) altından değiştirmemek için buna bakar (kosuyorMu) — calisanSurecler yalnızca süreci
// BAŞLAMIŞ koşuları, kuyruktaBekleyenler ise yalnızca HTTP yanıtını bekleyenleri tuttuğu
// için ikisi de tek başına yeterli değil.
const aktifKosuAnahtarlari = new Map();

// Nöbetçi'deki "Durdur" düğmesi tarafından çağrılır. Süreç zaten çalışıyorsa
// öldürür; henüz kuyrukta bekliyorsa (bkz. yukarıdaki NOT) sırası geldiğinde hiç
// başlamayacak şekilde işaretler. Her iki durumda da true döner (istek işleme
// alındı); yalnızca koşu GERÇEKTEN ne çalışıyor ne kuyrukta değilse (zaten
// bitmiş/hiç var olmamış) false döner — ama bu durumda bile işaretlemek zararsız
// olduğundan, emin olunamayan her durumda true dönüp isteği kaydediyoruz.
// Bir koşunun TÜM süreç ağacını (Playwright + worker'lar + tarayıcılar) kapatır.
// macOS/Linux'ta önce SIGTERM gönderilir; süreç SURE_SONRA_ZORLA_MS içinde kapanmazsa
// SIGKILL ile zorla kapatılır. Windows'ta taskkill /T /F zaten zorla ve ağaçla kapatır.
const SURE_SONRA_ZORLA_MS = 5000;

function sinyalGonder(kayit, sinyal) {
  try {
    // Negatif PID: tüm süreç grubuna sinyal gönderir (bkz. spawn'daki detached).
    process.kill(-kayit.pid, sinyal);
  } catch {
    try {
      kayit.surec.kill(sinyal);
    } catch {
      // Süreç zaten kapanmış — yok sayılır.
    }
  }
}

function surecAgaciniKapat(kayit) {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(kayit.pid), '/T', '/F'], () => {
      // Süreç zaten kapanmış olabilir (yarış durumu) — hatayı yok sayıyoruz,
      // asıl sonuç zaten alt.on('close') üzerinden gelecek.
    });
    return;
  }
  sinyalGonder(kayit, 'SIGTERM');
  const zorla = setTimeout(() => {
    if (kayit.surec.exitCode === null && kayit.surec.signalCode === null) sinyalGonder(kayit, 'SIGKILL');
  }, SURE_SONRA_ZORLA_MS);
  zorla.unref();
}

function calismaDurdur(kosuId) {
  const kayit = calisanSurecler.get(kosuId);
  if (kayit) {
    kayit.iptalEdiliyor = true;
    surecAgaciniKapat(kayit);
    return true;
  }
  // Şu an çalışmıyor — aynı dosyadaki başka bir senaryonun bitmesini bekleyen
  // kuyrukta olabilir. Sırası geldiğinde hiç başlatılmasın diye işaretliyoruz.
  baslamadanIptalEdilecekler.add(kosuId);
  // Kuyrukta bekleyen bu koşunun HTTP yanıtı hâlâ açıksa (bkz. kuyruktaBekleyenler
  // NOTU), sırasının gelmesini BEKLEMEDEN hemen "iptal" sonucuyla çözüyoruz — kullanıcı
  // durdurma isteğinin etkisini anında görsün diye.
  const erkenCozulecek = kuyruktaBekleyenler.get(kosuId);
  if (erkenCozulecek) {
    kuyruktaBekleyenler.delete(kosuId);
    erkenCozulecek({ calistiMi: true, cikisKodu: null, sonuc: null, iptalEdildiMi: true });
  }
  return true;
}

// Playwright sürecini başlatır, TAMAMEN BİTMESİNİ bekler (Promise, süreç kapanınca
// çözülür) ve yapılandırılmış sonucu döner. Terminaldeki canlı takip için "list"
// raporlayıcı stdout'a yazmaya devam eder; yapılandırılmış sonuç platform raporlayıcısının
// veritabanına yazdığı kayıttan okunur (platformKosuSonucu).
//
// NOT (önemli): "dosya:satır" konumsal argümanı DAHA ÖNCE burada kullanılıyordu, ama
// bir senaryo dosyası döngüyle (for kimlikTipi of kimlikTipleri { for sifat of
// sifatlar { test(baslik, ...) } }) birden çok test ÜRETİYORSA, üretilen TÜM testler
// kaynak kodda AYNI satırda tanımlıdır — Playwright "dosya:satır" ile o satırdaki
// TÜM testleri eşleştirir, tek bir tanesini değil. Bu yüzden "JetSeyahat"teki gibi
// matris/döngü ile üretilen senaryolarda ▷ ikonuna basınca tek bir senaryo yerine o
// dosyadaki TÜM senaryolar sırayla çalışıyordu. Çözüm: satır yerine, senaryonun
// (üretilen) BAŞLIĞINI birebir eşleştiren "--grep" kullanılır — başlıklar döngüden
// gelse bile birbirinden farklıdır, bu yüzden benzersiz bir anahtardır.
//
// GERÇEKTEN tek bir test eşleştiğini doğrulama işi, ÖNCEDEN burada AYRI bir "--list"
// alt süreciyle (dosya+grep ile daraltılmış ikinci bir execFile çağrısı) yapılıyordu.
// Bu, "Seçilenleri çalıştır" ile BİRDEN FAZLA senaryo AYNI ANDA (concurrent) tetiklenince
// sorun çıkardı: birden fazla "playwright test --list" alt süreci aynı anda, aynı proje
// üzerinde (aynı derleme/transform önbelleğine yazarak) çalışınca ara sıra YARIŞ DURUMU
// yüzünden 0 eşleşme dönüyordu (senaryo gerçekte var olduğu halde "dosyada bulunamadı"
// hatası). Çözüm: ayrı bir --list alt süreci hiç başlatılmaz; tekillik kontrolü, /calistir
// içinde ZATEN whitelist için bir kez çekilmiş olan (tumSenaryolar) listeden BELLEK
// İÇİNDE yapılır — hem yarış durumunu ortadan kaldırır hem de senaryo başına bir alt
// süreç daha az başlatır.
//
// İKİNCİ (daha ciddi) yarış durumu: AYNI DOSYADAKİ iki senaryo "Seçilenleri çalıştır"
// ile aynı anda tetiklenirse, iki ayrı Playwright süreci o dosyayı (ve paylaştığı
// TypeScript derleme önbelleğini) AYNI ANDA derlemeye çalışıyor — bu durumda bir süreç
// dosyayı eksik/tutarsız derleyip döngüyle üretilen testlerin bir kısmını (özellikle
// hedeflenen senaryoyu) hiç üretemiyor, sonuçta "--grep" 0 eşleşme buluyor ("Error: No
// tests found") ve test hiç çalışmıyor. Çözüm: aynı "dosya"yı hedefleyen koşuları
// SIRAYA koyuyoruz (bir öncekinin süreci tamamen bitmeden ikincisi başlamıyor) — FARKLI
// dosyalardaki koşular yine tam paralel çalışmaya devam eder, kullanıcının istediği
// "seçilenleri aynı anda çalıştır" davranışı korunur.
const dosyaKuyruklari = new Map();

function dosyaSirasiIleCalistir(dosya, gorev) {
  const kuyrukKuyruk = dosyaKuyruklari.get(dosya) ?? Promise.resolve();
  const buGorev = kuyrukKuyruk.then(gorev, gorev);
  // Kuyrukta bekleyen bir sonraki koşu, bu görev reddedilse bile devam edebilsin diye
  // kuyruğa eklenen değer HER ZAMAN çözülen bir promise olmalı.
  dosyaKuyruklari.set(
    dosya,
    buGorev.catch(() => {})
  );
  return buGorev;
}

// ekOrtamDegiskenleri: koşu kimliği/türü ve (Senaryolar > "Dene"de) geçici
// ek veri dosyasının yolu; tekil koşularda boştur.
// genel: elle oluşturulan proje/ortamın model senaryosu (bkz. genelKosuAyarlari).
async function testiCalistirVeBekle(ortam, senaryoAdi, dosya, tumSenaryolar, kosuId, ekOrtamDegiskenleri = {}, grepDeseni = null, genel = null) {
  if (KOSU_KAPALI) {
    return { calistiMi: false, mesaj: 'Bu sunucu örneğinde test koşuları kapalı (TEST_SUNUCU_KOSU_KAPALI=1).' };
  }
  if (!playwrightCliVarMi()) {
    return {
      calistiMi: false,
      mesaj: `"${PLAYWRIGHT_CLI_YOLU}" bulunamadı (npm install çalıştırılmamış olabilir).`
    };
  }

  // NOT (önemli, 2. kök neden): Playwright'ın "--grep" eşleştirmesi test başlığının
  // KENDİSİNE değil, Playwright'ın kendi ürettiği DAHA UZUN bir "tam başlık" dizisine
  // (titlePath — muhtemelen dosya/proje bilgisiyle önekli) bakıyor. Teşhis loglarıyla
  // doğrulandı: ÇAPASIZ (baştan "^" içermeyen) bir alt-dize deseni doğru tek sonucu
  // buluyordu, ama başa "^" eklenince (tam başlığın TAM OLARAK bizim başlığımızla
  // BAŞLADIĞINI şart koştuğu için) hiçbir zaman eşleşmiyordu — sondaki "$" ise sorun
  // değil. Bu yüzden desen baştan ÇAPALANMAZ, sadece sondan ("$") çapalanır. Yanlışlıkla
  // BAŞKA bir senaryoyla eşleşme riski, senaryoAdi+dosya ikilisinin PROJEDEKİ TÜM
  // senaryolar arasında TEK/BENZERSİZ olduğunu doğrulayan aşağıdaki "eslesenler"
  // kontrolüyle zaten güvenceye alınmış durumda.
  // Model senaryosu: desen senaryonun etiketidir ("@model-<UUID>"; bkz. platform/senaryolar/model-kosusu.mjs).
  const desen = grepDeseni || `${regexIcinKac(senaryoAdi)}$`;

  // NOT (3. kök neden): Bu kontrol ÖNCEDEN yalnızca "ad"a (başlığa) bakıyordu — ama
  // aynı senaryo başlığı ("...Kiracı Testi", "...Mal Sahibi Testi" gibi) BİRDEN FAZLA
  // ürün dosyasında (jet-konut, jet-satis, jet-ilk-ates-konut vb.) KASITLI olarak
  // tekrarlanabiliyor. Bu yüzden sadece "ad" ile filtrelemek, gerçekte TEK bir dosyada
  // benzersiz olan bir senaryoyu "3 kez eşleşti" diyerek yanlışlıkla reddediyordu.
  // Çözüm: hem "ad" HEM "dosya" ile eşleştir — tekillik artık (dosya, başlık) ikilisi
  // için doğrulanıyor, ki zaten çalıştırılmak istenen kayıt da bu ikiliyle geliyor.
  // Test verisi ve sonuçlar YALNIZCA platform veritabanında: proje aktarılmamışsa koşu başlatılmaz.
  // Medya şifrelenmek zorunda: kasa kilitliyken de koşu BAŞLATILMAZ.
  if (!(await platformSonucKaydiEtkinMi(genel?.projeId ?? null))) {
    return { calistiMi: false, mesaj: "Veritabanı hazır değil — Nöbetçi'yi açıp projeyi aktarın/yedek yükleyin." };
  }
  if (!(await platformKasaAcikMi())) {
    return {
      calistiMi: false,
      mesaj: 'Platform kasası kilitli. Sonuçlar ve ekran görüntüleri şifreli kaydedildiği için koşu başlatmadan önce platform arayüzünde kasayı açın.'
    };
  }

  const eslesenler = tumSenaryolar.filter((s) => s.ad === senaryoAdi && s.dosya === dosya);
  if (eslesenler.length === 0) {
    return {
      calistiMi: false,
      mesaj: 'Bu senaryo "' + dosya + '" dosyasında bulunamadı (0 eşleşme) — dosya değişmiş olabilir, sayfayı yenileyip tekrar deneyin.'
    };
  }
  if (eslesenler.length > 1) {
    return {
      calistiMi: false,
      mesaj:
        `Bu senaryo başlığı "${dosya}" dosyasında ${eslesenler.length} kez eşleşti (beklenmiyordu — aynı ` +
        'dosyada iki senaryonun başlığı birbirinin AYNISI olabilir). Güvenlik nedeniyle çalıştırılmadı.'
    };
  }

  // bkz. aktifKosuAnahtarlari NOTU: kuyrukta bekleme dahil, koşu bitene kadar bu senaryo
  // "koşuyor" sayılır (Düzenle > Değişiklikleri Kaydet bu sürede reddedilir).
  aktifKosuAnahtarlari.set(kosuId, kosuAnahtari(dosya, senaryoAdi));

  // bkz. kuyruktaBekleyenler NOTU: kuyruğa girmeden ÖNCE bu koşunun HTTP yanıtını
  // çözecek fonksiyonu kaydediyoruz ki calismaDurdur, koşu daha sırası gelmeden
  // "Durdur" ile iptal edilirse yanıtı hemen dönebilsin.
  return new Promise((resolve) => {
    kuyruktaBekleyenler.set(kosuId, resolve);
    dosyaSirasiIleCalistir(dosya, () => gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId, ekOrtamDegiskenleri, genel)).then((sonuc) => {
      // Eğer calismaDurdur bu koşuyu ZATEN erken çözdüyse (Map'ten silinmiş olur),
      // ikinci kez resolve çağırmıyoruz — Promise'lerde ikinci resolve zaten yok
      // sayılır ama netlik için burada da kontrol ediyoruz.
      aktifKosuAnahtarlari.delete(kosuId);
      if (kuyruktaBekleyenler.delete(kosuId)) {
        resolve(sonuc);
      }
    }, (hata) => {
      // gercektenCalistir normalde hiç reddetmez; ama spawn eşzamanlı bir hata fırlatırsa
      // (ör. EAGAIN) HTTP yanıtı sonsuza dek açık kalmasın ve işlenmemiş bir promise
      // reddi oluşmasın diye burada da yakalanıp kullanıcıya dönülür.
      console.error(`[test-sunucu] Koşu başlatılırken beklenmeyen hata: ${hata?.message ?? hata}`);
      aktifKosuAnahtarlari.delete(kosuId);
      if (kuyruktaBekleyenler.delete(kosuId)) {
        resolve({ calistiMi: false, mesaj: `Test süreci başlatılamadı: ${hata?.message ?? hata}` });
      }
    });
  });
}

// Platform sonuç kaydında aynı KOSU_KIMLIGI'ni paylaşan (ör. "Koşuyu başlat" ile her senaryo
// ayrı süreçte) çalışan süreç sayısı — sonuncusu kapanınca koşu hâlâ "çalışıyor" görünüyorsa kapatılır.
const aktifPlatformKosulari = new Map();

async function gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId, ekOrtamDegiskenleri = {}, genel = null) {
  // Sonuçlar ve (şifreli) medya platform raporlayıcısı (scripts/platform/raporlayici.mjs) tarafından
  // veritabanına yazılır; panelin sonucu veritabanından okunur (JSON sonuç dosyası yazdırılmaz).
  const kosuKimligi = ekOrtamDegiskenleri.KOSU_KIMLIGI || `panel-${Date.now()}-${randomBytes(4).toString('hex')}`;
  return new Promise((resolve) => {
    // Bu senaryo, dosya kuyruğunda beklerken (henüz hiç süreç başlatılmadan)
    // "Durdur" ile iptal edilmiş olabilir (bkz. calismaDurdur > baslamadanIptalEdilecekler
    // NOTU) — bu durumda hiç spawn ETMEDEN doğrudan "iptal edildi" sonucu dönülür.
    if (baslamadanIptalEdilecekler.has(kosuId)) {
      baslamadanIptalEdilecekler.delete(kosuId);
      console.log(`\n■ [${ortam.toUpperCase()}] "${senaryoAdi}" sırada beklerken durduruldu, hiç başlatılmadı.\n`);
      resolve({ calistiMi: true, cikisKodu: null, sonuc: null, iptalEdildiMi: true });
      return;
    }

    // Koşu artık HEADLESS çalışır — masaüstünde ayrı bir Chrome penceresi açılmaz
    // (kullanıcı bunun yerine dashboard'daki "canlı izleme panelini" istedi). Canlı
    // izleme, bu koşuya özel geçici bir PNG dosyasına (canliYolu) saniyede bir yazılan
    // ekran görüntüsü ile sağlanır (bkz. fixtures.ts > canliIzlemeYayini ve aşağıdaki
    // /canli ucu).
    const canliYolu = join(tmpdir(), `test-sunucu-canli-${randomBytes(6).toString('hex')}.png`);
    // Elle doğrulama kodu (SMS "elle" kipi): giriş motoru bu yola istek yazar, panel kullanıcıdan kodu alıp
    // yanıtı yazar (bkz. platform/giris/elle-kod.mjs; /kod-istegi ve /kod-gonder uçları).
    const kodYolu = join(tmpdir(), `test-sunucu-kod-${randomBytes(8).toString('hex')}`);
    // Şifreli senaryo dosyaları (ör. çoklu sorgu Excel'i) bu sürece özel, yalnızca kullanıcının okuyabildiği geçici
    // klasöre çözülür (veri okuyucu; bkz. platform/dosyalar/) — süreç kapanınca klasör ezilip silinir.
    // Açık çalışma alanının veritabanına özgü geçici kök (veri okuyucu aynı yolu PLATFORM_VERITABANI ile doğrular).
    const dosyaKoku = geciciDosyaKoku(platformVeritabaniYolu());
    const dosyaKlasoru = kosuKlasoruOlustur(dosyaKoku, `sunucu-${kosuKimligi}`);
    // NOT (önemli): "desen" BİLEREK "--grep" argümanı olarak DEĞİL, aşağıda
    // TEST_SUNUCU_GREP_DESENI ortam değişkeni ile aktarılıyor. Teşhis loglarıyla
    // doğrulandı: başlığında Türkçe büyük "İ" harfi geçen senaryolarda (ör.
    // "...İndirimli...", "...Yeni İş Testi...") "--grep" komut satırı argümanı Windows'ta
    // spawn edilirken bozuluyor ve Playwright "Error: No tests found" veriyordu — dosya
    // filtresi TEK BAŞINA doğru çalıştığı, ama SADECE grep (dosyasız) bile 0 sonuç
    // verdiği için sorun dosya+grep kombinasyonunda değil, doğrudan "--grep" argümanının
    // kendisindeydi. Çözüm: deseni CreateProcess'in ayrı "environment block"
    // mekanizmasıyla taşımak (bkz. playwright.config.ts > "grep" ayarı) — bu yol aynı
    // argüman-satırı bozulmasına uğramıyor.
    // Her dashboard koşusu KENDİ çıktı klasörüne yazar. Aksi halde paralel koşular aynı
    // test-results/ klasörünü paylaşıyor; Playwright her koşunun başında bu klasörü
    // temizlediği için diğer koşuların trace/video dosyaları siliniyordu (ENOENT hataları,
    // açılmayan videolar). Klasör test-results/ altında kaldığı için /medya ucu değişmeden
    // çalışır.
    const ciktiKlasoru = join(projeKoku, 'test-results', 'dashboard-kosulari', `${Date.now()}-${randomBytes(4).toString('hex')}`);
    // Raporlayıcılar playwright.config.ts'ten gelir (list + json + Allure). "--reporter"
    // VERİLMEZ: CLI'dan verilirse config'teki Allure raporlayıcısı devre dışı kalıyor ve
    // dashboard koşuları rapora hiç yansımıyordu.
    const genelAyarlar = genelKosuAyarlari(genel, ortam);
    const argumanlar = [PLAYWRIGHT_CLI_YOLU, 'test', ...genelAyarlar.argumanlar, dosya, `--output=${ciktiKlasoru}`];

    console.log(`\n▶ [${ortam.toUpperCase()}] "${senaryoAdi}" başlatıldı...\n`);

    const alt = spawn(process.execPath, argumanlar, {
      cwd: projeKoku,
      env: {
        ...process.env,
        ...genelAyarlar.ortamDegiskenleri,
        KOSU_KIMLIGI: kosuKimligi,
        // Raporlayıcı sonuçları bu sunucuya gönderir (veritabanının tek sahibi sunucudur). Token:
        // raporlayıcı token'ı (yalnızca /platform/sonuc/* yazma uçlarında geçerli).
        PLATFORM_SONUC_ADRESI: `http://127.0.0.1:${PORT}`,
        PLATFORM_SONUC_TOKENI: RAPORLAYICI_TOKENI,
        TEST_SUNUCU_GORUNUR: '1',
        TEST_SUNUCU_CANLI_YOLU: canliYolu,
        [KOD_YOLU_DEGISKENI]: kodYolu,
        TEST_SUNUCU_GREP_DESENI: desen,
        // Türetilmiş kasa anahtarı (yalnızca alt sürecin belleğinde): test verisi platform
        // veritabanından okunur (terminalde parola sorulmaz). Koşu yalnızca kasa açıkken başlar.
        ...platformTestOrtami(),
        ...ekOrtamDegiskenleri,
        KOSU_KIMLIGI: kosuKimligi,
        [DOSYA_KLASORU_DEGISKENI]: dosyaKlasoru
      },
      // NOT: 'inherit' yerine 'pipe' kullanılıyor — alt sürecin kendi stdout/stderr'ı
      // (ör. Playwright'ın "Error: No tests found" çıktısı) DOĞRUDAN terminale
      // yazıldığında bizim console.log sarmalayıcımızdan (yukarıdaki logaYaz) GEÇMİYOR,
      // yani test-sunucu.log dosyasına düşmüyordu. Şimdi alt sürecin çıktısını
      // process.stdout/stderr'a AYNEN basıyoruz (terminaldeki canlı görünüm korunur) VE
      // ayrıca log dosyasına da yazıyoruz.
      stdio: ['ignore', 'pipe', 'pipe'],
      // macOS/Linux'ta alt süreç kendi süreç grubunda başlatılır; böylece durdururken
      // grubun tamamı (worker'lar ve tarayıcılar dahil) tek sinyalle kapatılabilir.
      // Windows'ta bu gerekmez (taskkill /T zaten ağacı kapatıyor).
      detached: process.platform !== 'win32',
      shell: false
    });

    // Çıktının son kısmı bellekte tutulur: test hiç başlamadan düşerse (ör. giriş/hazırlık
    // adımında portal açılmazsa) sonuç dosyası oluşmaz; hatanın sebebi yalnızca bu çıktıda
    // olur ve dashboard'a buradan iletilir (bkz. hataOzetiCikar).
    let ciktiKuyrugu = '';
    const ciktiyaEkle = (metin) => {
      ciktiKuyrugu = (ciktiKuyrugu + metin).slice(-CIKTI_KUYRUGU_MAKS);
    };
    alt.stdout?.on('data', (parca) => {
      process.stdout.write(parca);
      ciktiyaEkle(parca.toString('utf-8'));
      logaYaz(parca.toString('utf-8').replace(/\n$/, ''));
    });
    alt.stderr?.on('data', (parca) => {
      process.stderr.write(parca);
      ciktiyaEkle(parca.toString('utf-8'));
      logaYaz('[stderr] ' + parca.toString('utf-8').replace(/\n$/, ''));
    });

    if (alt.pid) sahipYaz(dosyaKlasoru, alt.pid);
    const kayit = { surec: alt, pid: alt.pid, iptalEdiliyor: false, zamanAsimi: false, canliYolu, kodYolu };
    calisanSurecler.set(kosuId, kayit);
    aktifPlatformKosulari.set(kosuKimligi, (aktifPlatformKosulari.get(kosuKimligi) ?? 0) + 1);
    const platformKosusunuBirak = async (durum) => {
      const kalan = (aktifPlatformKosulari.get(kosuKimligi) ?? 1) - 1;
      if (kalan > 0) { aktifPlatformKosulari.set(kosuKimligi, kalan); return; }
      aktifPlatformKosulari.delete(kosuKimligi);
      await platformKosusunuKapat(kosuKimligi, durum).catch(() => {});
    };

    // Süre limiti: takılan bir koşu (ör. hiç kapanmayan bir pop-up, donan tarayıcı)
    // dashboard'u sonsuza kadar "çalışıyor" durumunda bırakmasın diye, süreç
    // KOSU_SURE_LIMITI_MS sonunda hâlâ çalışıyorsa zorla kapatılır. Süre, sıra beklerken
    // değil süreç gerçekten başladığında işlemeye başlar.
    const sureLimitiZamanlayici = setTimeout(() => {
      if (!calisanSurecler.has(kosuId)) return;
      kayit.zamanAsimi = true;
      console.log(`\n⏱ [${ortam.toUpperCase()}] "${senaryoAdi}" ${Math.round(KOSU_SURE_LIMITI_MS / 60000)} dakikalık süre limitini aştı, durduruluyor...\n`);
      surecAgaciniKapat(kayit);
    }, KOSU_SURE_LIMITI_MS);

    let sureciBaslatmaHatasi = null;
    alt.on('error', (hata) => {
      sureciBaslatmaHatasi = hata;
      console.error(`Test süreci başlatılamadı: ${hata.message}`);
    });

    alt.on('close', async (kod) => {
      clearTimeout(sureLimitiZamanlayici);
      const iptalEdildiMi = kayit.iptalEdiliyor && !kayit.zamanAsimi;
      calisanSurecler.delete(kosuId);

      // Koşu bitti, canlı izleme dosyasına artık gerek yok — temizle (yoksa/okunamıyorsa
      // sorun değil, sessizce yok sayılır).
      try {
        if (existsSync(canliYolu)) unlinkSync(canliYolu);
      } catch {
        // yok sayılır
      }
      kodIsteginiTemizle(kodYolu);
      kosuKlasorunuSil(dosyaKlasoru, dosyaKoku);

      await platformKosusunuBirak(kayit.zamanAsimi ? 'zaman_asimi' : iptalEdildiMi ? 'durduruldu' : 'tamamlandi');

      if (sureciBaslatmaHatasi) {
        resolve({ calistiMi: false, mesaj: `Test süreci başlatılamadı: ${sureciBaslatmaHatasi.message}` });
        return;
      }

      if (kayit.zamanAsimi) {
        resolve({
          calistiMi: true,
          cikisKodu: kod,
          sonuc: {
            durum: 'timedOut',
            sureMs: KOSU_SURE_LIMITI_MS,
            hataMesaji: `Koşu ${Math.round(KOSU_SURE_LIMITI_MS / 60000)} dakikalık süre limitini aştığı için durduruldu.`
          },
          iptalEdildiMi: false
        });
        return;
      }

      if (iptalEdildiMi) {
        console.log(`\n■ [${ortam.toUpperCase()}] "${senaryoAdi}" kullanıcı tarafından durduruldu.\n`);
        resolve({ calistiMi: true, cikisKodu: kod, sonuc: null, iptalEdildiMi: true });
        return;
      }

      console.log(`\n■ [${ortam.toUpperCase()}] "${senaryoAdi}" sonlandı (çıkış kodu: ${kod}).\n`);

      let sonuc = null;
      try {
        const p = await platformKosuSonucu(kosuKimligi, kosuAnahtari(dosya, senaryoAdi));
        if (p) {
          sonuc = {
            durum: p.durum, sureMs: p.sureMs, hataMesaji: p.hataMesaji, basarisizAdim: p.basarisizAdim,
            ekranGoruntusuId: p.ekranGoruntusuId, videoId: p.videoId, sonucId: p.sonucId
          };
        }
      } catch (okumaHatasi) {
        console.error(`Sonuç platform veritabanından okunamadı: ${okumaHatasi.message}`);
      }
      resolve({
        calistiMi: true,
        cikisKodu: kod,
        sonuc,
        iptalEdildiMi: false,
        ciktiHataOzeti: sonuc ? null : hataOzetiCikar(ciktiKuyrugu)
      });
    });
  });
}

// Süreç çıktısından okunabilir bir hata özeti çıkarır (sonuç dosyası yokken kullanılır).
// Hata, testler başlamadan (globalSetup: giriş/oturum kontrolü) oluştuysa bunu başa yazar.
const CIKTI_KUYRUGU_MAKS = 20000;
function hataOzetiCikar(cikti) {
  const temiz = String(cikti ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  if (!temiz.trim()) return null;
  if (/No tests found/i.test(temiz)) return 'Bu senaryo çalıştırılacak testler arasında bulunamadı (No tests found).';
  const satirlar = temiz.split(/\r?\n/);
  const baslangic = satirlar.findIndex((s) => /^\s*(?:[A-Za-z]*Error|Error)\b[:\s]/.test(s));
  let ozet;
  if (baslangic === -1) {
    ozet = satirlar.filter((s) => s.trim()).slice(-12).join('\n');
  } else {
    const parca = [];
    for (let i = baslangic; i < satirlar.length && parca.length < 14; i++) {
      // Kaynak kod alıntısı ("  23 |", "> 25 |") ve yığın izi ("at ...") gürültüsü atlanır.
      if (/^\s*(?:>?\s*\d+\s*\||\|\s*\^|at\s)/.test(satirlar[i])) continue;
      if (!satirlar[i].trim() && parca.length && !parca[parca.length - 1].trim()) continue;
      parca.push(satirlar[i]);
    }
    ozet = parca.join('\n').trim();
  }
  const hazirliktaMi = /globalSetup|global-setup\.ts/.test(temiz);
  return (hazirliktaMi ? 'Test başlamadan, giriş/hazırlık adımında (global-setup) hata oluştu:\n\n' : '') + ozet;
}

// ---- Senaryolar > "Dene" -------------------------------------------------------------------
// Taslak senaryo veritabanına YAZILMAZ: geçici bir "ek veri" dosyasına yazılır ve yolu bu ortam
// değişkeniyle hem "--list" hem koşu sürecine verilir (tests/support/test-data.ts >
// EK_SENARYO_DOSYASI_ORTAM_DEGISKENI ile AYNI TUTULMALI). Deneme bitince dosya silinir.
const EK_SENARYO_ORTAM_DEGISKENI = 'TEST_SUNUCU_EK_SENARYO_DOSYASI';
const EK_SENARYO_DOSYA_ON_EKI = 'test-sunucu-ek-senaryo-';

// ---- Tek senaryo çalıştırma çekirdeği ------------------------------------------------------
// Platform "Senaryolar" (/platform/senaryolar/calistir; senaryo UUID'si sunucuda güncel başlık +
// dosyaya çözülür) bu yolu kullanır: --list beyaz listesi (istemcinin gönderdiği ada güvenilmez),
// dosya sırası, süre limiti, durdurma, canlı görüntü, platform raporlayıcısı. Dönen { httpDurum, govde }.
async function senaryoyuCalistirVeYanitla({ ortam, senaryoAdi, dosya, kosuId, kosuTuru, kosuKimligi, kosuKapsami, etiket = null, grepDeseni = null, genel = null }) {
  let tumSenaryolar;
  try {
    tumSenaryolar = await tumSenaryolariGetir(ortam, genel);
  } catch (hata) {
    return { httpDurum: 500, govde: { basarili: false, mesaj: `Senaryo listesi alınamadı (npx playwright test --list başarısız oldu): ${hata.message}` } };
  }

  // Model senaryosu (test kodu yok; model spec'i senaryoyu "@model-<UUID>" etiketiyle üretir): test, listede
  // model dosyası + etiketle TEK olarak bulunmalı; başlığı listedekinden alınır, koşu etiketle daraltılır.
  if (etiket) {
    const modelEslesenler = tumSenaryolar.filter((s) => s.dosya === dosya && Array.isArray(s.etiketler) && s.etiketler.includes(etiket));
    if (modelEslesenler.length !== 1) {
      return {
        httpDurum: modelEslesenler.length ? 409 : 403,
        govde: {
          basarili: false,
          mesaj: modelEslesenler.length
            ? `Model senaryosu listede ${modelEslesenler.length} kez eşleşti; güvenlik nedeniyle çalıştırılmadı.`
            : 'Model senaryosu model koşucusunun test listesinde bulunamadı (senaryo bu ortamda değil ya da modeli geçersiz); çalıştırılmadı.'
        }
      };
    }
    const calistirmaSonucu = await testiCalistirVeBekle(
      ortam, modelEslesenler[0].ad, dosya, tumSenaryolar, kosuId,
      kosuTuru && kosuKimligi
        ? { KOSU_KIMLIGI: kosuKimligi, TEST_SUNUCU_KOSU_TURU: kosuTuru, ...(kosuTuru === 'tam' ? { TEST_SUNUCU_KOSU_KAPSAMI: kosuKapsami || 'Genel' } : {}) }
        : {},
      grepDeseni,
      genel
    );
    return calistirmaYaniti(calistirmaSonucu, 'Test');
  }

  // Aynı başlık birden fazla ürün dosyasında bulunabildiği için senaryo (ad + dosya)
  // ikilisiyle eşleştirilir. Dosyasız isteklerde ad birden fazla dosyada varsa yanlış testi
  // koşmamak için istek reddedilir.
  const adaGoreEslesenler = tumSenaryolar.filter((s) => s.ad === senaryoAdi);
  const eslesenler = dosya ? adaGoreEslesenler.filter((s) => s.dosya === dosya) : adaGoreEslesenler;
  if (eslesenler.length === 0) {
    return { httpDurum: 403, govde: { basarili: false, mesaj: 'Bu ad, projedeki gerçek senaryolarla eşleşmiyor; güvenlik nedeniyle çalıştırılmadı.' } };
  }
  if (new Set(eslesenler.map((s) => s.dosya)).size > 1) {
    return {
      httpDurum: 409,
      govde: {
        basarili: false,
        mesaj: 'Bu başlık birden fazla üründe var (' + [...new Set(eslesenler.map((s) => s.urun))].join(', ') +
          '). Yanlış testi koşmamak için lütfen senaryoyu "Senaryolar" tablosundan çalıştırın.'
      }
    };
  }
  const eslesenSenaryo = eslesenler[0];

  // Bu istek, test TAMAMEN bitene kadar bekletilir — arayüz bu sürede satırı "çalışıyor" gösterir.
  const calistirmaSonucu = await testiCalistirVeBekle(
    ortam, senaryoAdi, eslesenSenaryo.dosya, tumSenaryolar, kosuId,
    kosuTuru && kosuKimligi
      ? { KOSU_KIMLIGI: kosuKimligi, TEST_SUNUCU_KOSU_TURU: kosuTuru, ...(kosuTuru === 'tam' ? { TEST_SUNUCU_KOSU_KAPSAMI: kosuKapsami || 'Genel' } : {}) }
      : {}
  );
  return calistirmaYaniti(calistirmaSonucu, 'Test');
}

// testiCalistirVeBekle sonucunu HTTP yanıtına çevirir (platform çalıştır/dene uçları).
function calistirmaYaniti(calistirmaSonucu, ad) {
  if (!calistirmaSonucu.calistiMi) return { httpDurum: 500, govde: { basarili: false, mesaj: calistirmaSonucu.mesaj } };
  if (calistirmaSonucu.iptalEdildiMi) {
    return { httpDurum: 200, govde: { basarili: true, durum: 'iptal', mesaj: `${ad}, kullanıcı tarafından durduruldu.` } };
  }
  if (!calistirmaSonucu.sonuc) {
    return {
      httpDurum: 200,
      govde: {
        basarili: true,
        durum: calistirmaSonucu.cikisKodu === 0 ? 'passed' : 'failed',
        mesaj: `${ad} tamamlandı ama detaylı sonuç okunamadı (çıkış kodu: ${calistirmaSonucu.cikisKodu}). Terminaldeki çıktıya bakın.`,
        hataMesaji: calistirmaSonucu.ciktiHataOzeti || null
      }
    };
  }
  return {
    httpDurum: 200,
    govde: {
      basarili: true,
      durum: calistirmaSonucu.sonuc.durum,
      sureMs: calistirmaSonucu.sonuc.sureMs,
      hataMesaji: calistirmaSonucu.sonuc.hataMesaji,
      basarisizAdim: calistirmaSonucu.sonuc.basarisizAdim ?? null,
      sonucId: calistirmaSonucu.sonuc.sonucId ?? null,
      // Platform arayüzü medyayı kendi (aynı köken) /platform/medya/<id> adresinden gösterir.
      ekranGoruntusuId: calistirmaSonucu.sonuc.ekranGoruntusuId ?? null,
      videoId: calistirmaSonucu.sonuc.videoId ?? null
    }
  };
}

// Platform "Senaryolar" ekranının koşucusu (bkz. scripts/platform/senaryolar/calistirma.mjs): senaryo
// UUID'si platformda güncel dosya + başlığa çözülmüş olarak gelir; burada yukarıdaki AYNI yol kullanılır.
// "Dene": taslak senaryo geçici bir ek veri dosyasıyla (TEST_SUNUCU_EK_SENARYO_DOSYASI; kalıcı veriye
// yazılmaz) spec dosyasına daraltılmış ayrı bir listelemeyle bulunur ve çalıştırılır; dosya sonra silinir.
platformKosucusunuAyarla({
  // Senaryolar ekranı "kodu kaldırılmış" denetimi: Playwright'ın güncel test listesi (dosya + başlık).
  testListesi: async (ortam) => (await tumSenaryolariGetir(ortam)).map((t) => ({ dosya: t.dosya, ad: t.ad })),
  calistir: (istek) => senaryoyuCalistirVeYanitla({
    ortam: istek.ortam, senaryoAdi: istek.ad, dosya: istek.dosya, kosuId: istek.kosuId, kosuTuru: istek.kosuTuru ?? null,
    kosuKimligi: istek.kosuKimligi ?? null, kosuKapsami: istek.kosuKapsami ?? 'Genel',
    etiket: istek.etiket ?? null, grepDeseni: istek.grepDeseni ?? null, genel: istek.genel ?? null
  }),
  dene: async (istek) => {
    const ekDosyaYolu = join(tmpdir(), `${EK_SENARYO_DOSYA_ON_EKI}${Date.now()}-${randomBytes(6).toString('hex')}.json`);
    try {
      writeFileSync(ekDosyaYolu, JSON.stringify(istek.ekVeri), { encoding: 'utf-8', mode: 0o600 });
      const ekOrtamDegiskenleri = { [EK_SENARYO_ORTAM_DEGISKENI]: ekDosyaYolu };
      const tumSenaryolar = await senaryolariListele(istek.ortam, [istek.dosya], undefined, ekOrtamDegiskenleri);
      if (!tumSenaryolar.some((s) => s.ad === istek.ad && s.dosya === istek.dosya)) {
        return { httpDurum: 500, govde: { basarili: false, mesaj: 'Deneme senaryosu test listesinde bulunamadı (ek veri dosyası Playwright tarafından görülemedi).' } };
      }
      const sonuc = await testiCalistirVeBekle(istek.ortam, istek.ad, istek.dosya, tumSenaryolar, istek.kosuId, ekOrtamDegiskenleri);
      return calistirmaYaniti(sonuc, 'Deneme');
    } finally {
      try {
        if (existsSync(ekDosyaYolu)) unlinkSync(ekDosyaYolu);
      } catch (temizlemeHatasi) {
        console.error('[platform/dene] Geçici ek veri dosyası silinemedi:', temizlemeHatasi.message);
      }
    }
  },
  // Model senaryosu "Dene": deneme senaryosu geçici dosyayla (TEST_SUNUCU_MODEL_DENEME_DOSYASI) veri okuyucuya verilir; model
  // spec'i onu etiketle tek test olarak üretir; listeleme ve koşu aynı dosyayla yapılır, dosya sonra silinir.
  modelDene: async (istek) => {
    const denemeYolu = join(tmpdir(), `${EK_SENARYO_DOSYA_ON_EKI}model-${Date.now()}-${randomBytes(6).toString('hex')}.json`);
    try {
      writeFileSync(denemeYolu, JSON.stringify(istek.denemeSenaryosu), { encoding: 'utf-8', mode: 0o600 });
      const ekOrtamDegiskenleri = { TEST_SUNUCU_MODEL_DENEME_DOSYASI: denemeYolu };
      const liste = await senaryolariListele(istek.ortam, [], undefined, ekOrtamDegiskenleri, istek.genel);
      const eslesen = liste.filter((s) => s.dosya === istek.dosya && Array.isArray(s.etiketler) && s.etiketler.includes(istek.etiket));
      if (eslesen.length !== 1) {
        return { httpDurum: 500, govde: { basarili: false, mesaj: 'Deneme senaryosu model koşucusunun test listesinde bulunamadı (deneme dosyası okunamadı).' } };
      }
      const sonuc = await testiCalistirVeBekle(istek.ortam, eslesen[0].ad, istek.dosya, liste, istek.kosuId, ekOrtamDegiskenleri, istek.grepDeseni, istek.genel);
      return calistirmaYaniti(sonuc, 'Deneme');
    } finally {
      try {
        if (existsSync(denemeYolu)) unlinkSync(denemeYolu);
      } catch (temizlemeHatasi) {
        console.error('[platform/dene] Geçici deneme dosyası silinemedi:', temizlemeHatasi.message);
      }
    }
  },
  kosuyorMu: (dosya, ad) => senaryoKosuyorMu(dosya, ad),
  // Çalışma alanı kapatma/değiştirme ve proje silme, koşu sürerken (kuyrukta bekleyen dahil) reddedilir.
  mesgulMu: () => calisanSurecler.size > 0 || kuyruktaBekleyenler.size > 0 || aktifKosuAnahtarlari.size > 0
});

// Senaryo o an (kuyrukta bekleyerek ya da gerçekten) koşuyor mu? (bkz. aktifKosuAnahtarlari)
function senaryoKosuyorMu(dosya, ad) {
  const anahtar = kosuAnahtari(dosya, ad);
  for (const aktif of aktifKosuAnahtarlari.values()) {
    if (aktif === anahtar) return true;
  }
  return false;
}

async function istegiIsle(req, res) {
  if (!yerelIstekMi(req)) {
    jsonGonder(res, 403, { basarili: false, mesaj: 'Yalnızca bu bilgisayardan (127.0.0.1) gelen isteklere izin verilir.' });
    return;
  }

  // Yalnızca aynı köken (CORS başlığı hiç verilmez; çapraz köken ön kontrolleri reddedilir).
  if (req.method === 'OPTIONS' || !originIzinliMi(req)) {
    jsonGonder(res, 403, { basarili: false, mesaj: 'İzin verilmeyen origin.' });
    return;
  }

  // Platform arayüzü (kabuk): oturum token'ı sayfaya enjekte edilir.
  if (req.method === 'GET' && req.url && arayuzIsteginiIsle(req, res)) return;

  if (req.method === 'GET' && req.url === '/saglik') {
    jsonGonder(res, 200, { basarili: true, mesaj: 'Test sunucusu çalışıyor.' });
    return;
  }

  // Platform (yerel veritabanı, kasa, yedek) uç noktaları: /platform/* — ayrıntı ve token
  // kuralları scripts/platform/sunucu-platform.mjs içinde.
  if (req.url && req.url.startsWith('/platform/')) {
    await platformIsteginiIsle(req, res, { token: OTURUM_TOKEN, raporlayiciTokeni: RAPORLAYICI_TOKENI, jsonGonder });
    return;
  }

  if (req.method === 'POST' && req.url === '/durdur') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }

    const { kosuId, token } = istek ?? {};

    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (typeof kosuId !== 'string' || !kosuId.trim()) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'kosuId zorunludur.' });
      return;
    }

    const durduruldu = calismaDurdur(kosuId.trim());
    jsonGonder(res, 200, {
      basarili: durduruldu,
      mesaj: durduruldu
        ? 'Durdurma isteği gönderildi.'
        : 'Bu senaryo için şu anda çalışan bir süreç bulunamadı (zaten bitmiş olabilir).'
    });
    return;
  }

  // Nöbetçi'nin "canlı koşu paneli", bir satıra tıklandığında bu ucu saniyede bir
  // (~1000-1500ms) sorgular — o an çalışan senaryonun fixtures.ts > canliIzlemeYayini
  // tarafından yazılan en güncel ekran görüntüsünü döner. Henüz dosya yazılmamışsa
  // (koşu daha yeni başladıysa) veya senaryo hiç çalışmıyorsa 404 döner; istemci bunu
  // "henüz görüntü yok" olarak yorumlayıp bir sonraki tikte tekrar dener.
  if (req.method === 'GET' && req.url && req.url.startsWith('/canli')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const token = url.searchParams.get('token');
    const kosuId = url.searchParams.get('kosuId');

    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (!kosuId) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'kosuId zorunludur.' });
      return;
    }

    const kayit = calisanSurecler.get(kosuId);
    if (!kayit?.canliYolu || !existsSync(kayit.canliYolu)) {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Henüz canlı görüntü yok.' });
      return;
    }

    try {
      const veri = readFileSync(kayit.canliYolu);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(veri);
    } catch {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Canlı görüntü okunamadı.' });
    }
    return;
  }

  // Elle doğrulama kodu (SMS "elle" kipi): canlı koşu paneli çalışan satırlar için bekleyen kod isteğini
  // sorar (/kod-istegi) ve kullanıcının girdiği kodu iletir (/kod-gonder). Kod loglanmaz, yanıtta dönmez.
  if (req.method === 'GET' && req.url && req.url.startsWith('/kod-istegi')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!tokenGecerli(url.searchParams.get('token'))) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    const kayit = calisanSurecler.get(url.searchParams.get('kosuId') ?? '');
    const istek = kayit?.kodYolu ? kodIstegiOku(kayit.kodYolu) : null;
    res.setHeader('Cache-Control', 'no-store');
    jsonGonder(res, 200, { basarili: true, bekliyor: Boolean(istek), ...(istek ?? {}) });
    return;
  }
  if (req.method === 'POST' && req.url === '/kod-gonder') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }
    const { kosuId, token, kod } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    const kayit = typeof kosuId === 'string' ? calisanSurecler.get(kosuId) : undefined;
    if (!kayit?.kodYolu) {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bu koşu artık çalışmıyor.' });
      return;
    }
    try {
      const iletildi = koduYanitla(kayit.kodYolu, typeof kod === 'string' ? kod.trim() : '');
      jsonGonder(res, iletildi ? 200 : 409, iletildi
        ? { basarili: true, mesaj: 'Kod iletildi.' }
        : { basarili: false, mesaj: 'Bekleyen bir kod isteği yok (süresi dolmuş olabilir).' });
    } catch (hata) {
      jsonGonder(res, 400, { basarili: false, mesaj: hata.message });
    }
    return;
  }

  jsonGonder(res, 404, { basarili: false, mesaj: 'Bulunamadı.' });
}

// Tüm istek işleme bu sarmalayıcıdan geçer: istegiIsle içinde BEKLENMEYEN bir hata
// fırlarsa (ör. bozuk bir JSON veri dosyası, dosya sistemi hatası) bu artık işlenmemiş bir
// promise reddine dönüşüp sunucu sürecini ÇÖKERTMEZ — loglanır ve istemciye 500 dönülür.
const sunucu = createServer(async (req, res) => {
  try {
    await istegiIsle(req, res);
  } catch (hata) {
    console.error(`[test-sunucu] ${req.method} ${req.url} işlenirken beklenmeyen hata: ${hata?.stack ?? hata}`);
    try {
      if (!res.headersSent) jsonGonder(res, 500, { basarili: false, mesaj: `Sunucu hatası: ${hata?.message ?? hata}` });
      else res.destroy();
    } catch {
      // yanıt zaten kapanmış olabilir — yok sayılır
    }
  }
});

// Bir senaryo çalıştırması birkaç dakika sürebilir — Node'un varsayılan istek/soket
// zaman aşımlarının (bazı sürümlerde 5 dk) isteği erken kesmesini engeller.
sunucu.requestTimeout = 0;
sunucu.headersTimeout = 0;
sunucu.timeout = 0;

export { PORT };

// Sunucu YALNIZCA doğrudan "node scripts/test-sunucu.mjs" ile çalıştırıldığında ayağa kalkar
// (başka bir modül bu dosyayı import ederse istenmeden ikinci bir sunucu başlatılmasın).
const dogrudanCalistirildi = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

// Geçici klasörde kalmış eski "Dene" ek veri dosyaları (başka bir sunucu örneğinin o an kullanıyor
// olabileceği yenileri hariç) açılışta silinir.
function artikGeciciSenaryolariTemizle() {
  try {
    const esik = Date.now() - KOSU_SURE_LIMITI_MS - 60 * 60 * 1000;
    for (const ad of readdirSync(tmpdir())) {
      if (!ad.startsWith(EK_SENARYO_DOSYA_ON_EKI)) continue;
      const tamYol = join(tmpdir(), ad);
      try {
        if (statSync(tamYol).mtimeMs < esik) unlinkSync(tamYol);
      } catch {
        // yok sayılır
      }
    }
  } catch {
    // geçici klasör okunamazsa önemli değil
  }
}

if (dogrudanCalistirildi) {
  // Son savunma hattı: gözden kaçan bir hata (ör. dinleyicisiz bir akış hatası) sunucuyu
  // sessizce öldürmesin — loglanır, süreç ÇIKMAZ. (Yalnızca doğrudan çalıştırıldığında.)
  process.on('unhandledRejection', (neden) => {
    console.error(`[test-sunucu] İşlenmemiş promise reddi (sunucu çalışmaya devam ediyor): ${neden?.stack ?? neden}`);
  });
  process.on('uncaughtException', (hata) => {
    console.error(`[test-sunucu] Yakalanmamış hata (sunucu çalışmaya devam ediyor): ${hata?.stack ?? hata}`);
  });

  artikGeciciSenaryolariTemizle();

  // Çalışma alanı kayıt defteri (yoksa oluşturulur; mevcut veri/platform.db YERİNDE ilk çalışma alanı olur — taşınmaz).
  try {
    platformCalismaAlanlariniHazirla();
  } catch (hata) {
    console.error(`[test-sunucu] Çalışma alanı kayıt defteri hazırlanamadı: ${hata.message}`);
  }

  // Önceki (çöken/kapatılan) oturumlardan kalan, sahibi artık çalışmayan geçici senaryo dosyası klasörleri
  // (şifreli dosyaların koşu anında çözüldüğü yer) açılışta ezilip silinir — tüm çalışma alanları için.
  try {
    let silinen = 0;
    for (const yol of platformTumVeritabaniYollari()) silinen += artikKlasorleriTemizle(geciciDosyaKoku(yol));
    if (silinen) console.log(`[test-sunucu] Önceki koşulardan kalan ${silinen} geçici dosya klasörü silindi.`);
  } catch (hata) {
    console.error(`[test-sunucu] Geçici dosya klasörleri temizlenemedi: ${hata.message}`);
  }

  // Şifreli medya deposu (veri/medya/): VIDEO_SAKLAMA_GUN'den eski videolar + sahipsiz dosyalar.
  platformMedyaTemizligiZamanla();

  // Platform veritabanı: kasa açıkken günde bir yerel otomatik yedek (veri/yedekler/, son 30).
  platformOtomatikYedekZamanla();

  // Dinleme hatası (ör. port zaten kullanımda) yukarıdaki uncaughtException dinleyicisine
  // düşüp sunucu "ayakta ama dinlemiyor" halde kalmasın diye açıkça ele alınır.
  sunucu.on('error', (hata) => {
    console.error(`[test-sunucu] Sunucu ${PORT} portunda başlatılamadı: ${hata.message}`);
    process.exit(1);
  });

  sunucu.listen(PORT, '127.0.0.1', () => {
    // Terminal koşularının raporlayıcısı sunucuyu bu dosyadan bulur (açık çalışma alanının yanına yazılır; çalışma
    // alanı değişince taşınır).
    platformSunucuBaglantisiniAyarla({ adres: `http://127.0.0.1:${PORT}`, token: RAPORLAYICI_TOKENI });
    console.log(`Nöbetçi hazır: http://127.0.0.1:${PORT}/ (yalnızca bu bilgisayardan erişilebilir)`);
    console.log('Koşular bu pencere açık kaldığı sürece çalışır. Kapatmak için Ctrl+C.');
  });

  // Koşular macOS/Linux'ta ayrı süreç grubunda çalıştığı için (bkz. spawn'daki
  // detached), terminalde Ctrl+C artık onlara ulaşmaz. Sunucu kapanırken çalışan tüm
  // koşuları biz kapatıyoruz; aksi halde arka planda sahipsiz tarayıcılar kalırdı.
  let kapaniyor = false;
  const kapat = (sinyal) => {
    if (kapaniyor) return;
    kapaniyor = true;
    const calisanlar = [...calisanSurecler.values()];
    if (calisanlar.length) console.log(`\n${calisanlar.length} çalışan koşu kapatılıyor...`);
    for (const kayit of calisanlar) {
      kayit.iptalEdiliyor = true;
      if (process.platform === 'win32') surecAgaciniKapat(kayit);
      else sinyalGonder(kayit, 'SIGKILL');
    }
    // Otomatik ekran taraması ayrı süreç grubunda çalışır (Ctrl+C ona ulaşmaz): burada kapatılır.
    try { taramalariKapat(); } catch { /* yok sayılır */ }
    try { platformKapanirken(); } catch { /* yok sayılır */ }
    sunucu.close();
    setTimeout(() => process.exit(sinyal === 'SIGINT' ? 130 : 0), 300).unref();
  };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
  process.on('SIGHUP', () => kapat('SIGHUP'));
}
