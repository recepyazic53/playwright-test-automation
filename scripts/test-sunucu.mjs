#!/usr/bin/env node
// Dashboard'daki (dashboard-test.html / dashboard-canli.html) "▷ Çalıştır" ikonlarının
// tetiklediği KÜÇÜK, SADECE YEREL bir HTTP sunucusu. Tarayıcıdan gelen isteği alıp
// gerçek "npx playwright test --grep ..." sürecini bu makinede başlatır, SONUCUNU
// BEKLER (dashboard satırı "çalışıyor" durumunda kalır) ve bitince başarılı/başarısız
// bilgisini geri döner (dashboard bunu bir popup'ta gösterir).
//
// GÜVENLİK NOTLARI (bkz. proje sohbetindeki açıklama):
// 1) Sunucu YALNIZCA 127.0.0.1'e bağlanır — ağdaki başka hiçbir cihaz erişemez.
// 2) CORS yalnızca dosya (file://) olarak açılan dashboard'un gönderdiği
//    "Origin: null" değerine ve sunucunun kendi sunduğu platform arayüzünün aynı-köken
//    isteklerine (http://127.0.0.1:<PORT>) izin verir; başka hiçbir origin'e izin verilmez.
// 3) Her istek bir token taşımak zorundadır: platform arayüzü (GET /) için her sunucu
//    başlangıcında üretilen ve YALNIZCA bellekte duran oturum token'ı (sayfaya yanıt
//    içinde enjekte edilir, diske yazılmaz); geçici olarak file:// dashboard için
//    scripts/.test-sunucu-token dosyasındaki eski token. Token'ı bilmeyen bir sayfa (ör.
//    başka bir sekmede açık kötü niyetli bir site) isteği kabul ettiremez.
// 4) Çalıştırılacak senaryo adı serbest metin olarak KABUL EDİLMEZ — gelen ad,
//    "npx playwright test --list" ile o an gerçekten var olan senaryo başlıklarıyla
//    birebir eşleşmek zorundadır (whitelist). Eşleşmeyen istekler reddedilir.
// 5) Süreç başlatma her zaman execFile/spawn ARGÜMAN DİZİSİ ile yapılır, shell HİÇ
//    kullanılmaz — "npx" yerine doğrudan node_modules/@playwright/test/cli.js,
//    bu makinedeki Node ile (process.execPath) çalıştırılır. Böylece Windows'taki
//    "npx.cmd" .cmd-dosyası sorunları (ve onun getirdiği shell:true gereksinimi) hiç
//    devreye girmez; komut enjeksiyonu da mümkün değildir.
//
// Kullanım: bir terminalde "npm run test-sunucu" ile başlatıp açık bırakın (ikinci
// bir terminal sekmesinde/penceresinde — bu terminali başka işler için kullanmayın).
// Dashboard'daki Çalıştır ikonları bu sunucu çalışırken aktif olur; koştuğunuz
// testin canlı çıktısını bu terminalden takip edebilirsiniz.

import 'dotenv/config';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import {
  existsSync, readFileSync, writeFileSync, unlinkSync, statSync, createReadStream, appendFileSync, mkdirSync,
  renameSync, realpathSync, readdirSync
} from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath, extname, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { eskiVideolariTemizle } from './medya-temizligi.mjs';
import { haricTutulanlariOku, haricTutulanlariYaz, kosuListesiAnahtari, kosuListesiniGuncelle } from './kosu-listesi.mjs';
import { JET_SEYAHAT_FORM_ALANLARI } from './jet-seyahat-alanlari.mjs';
import {
  ESKI_BEKLENEN_SONUC_ALANLARI,
  MESAJLAR,
  beklenenSonucuNormallestir,
  hatalariMetneCevir,
  kartiNormallestir,
  krediKartlariAyniMi,
  ortakBaglaminiOlustur,
  senaryoyuDogrula
} from './dogrulama/senaryo-dogrulayici.mjs';
import { ekranModeliniOku } from './dogrulama/model-oku.mjs';
import { GORUNUM_SURUMU } from './rapor/dashboard-html.mjs';
import {
  platformEtkinligiBildir, platformIsteginiIsle, platformKasaAcikMi, platformKosuSonucu, platformKosusunuKapat,
  platformKosucusunuAyarla, platformMedyaTemizligiZamanla, platformOtomatikYedekZamanla, platformSonucKaydiEtkinMi, platformTestOrtami,
  projeDosyalariniEsitle
} from './platform/sunucu-platform.mjs';

const buDosyaninKlasoru = dirname(fileURLToPath(import.meta.url));
const projeKoku = join(buDosyaninKlasoru, '..');
const tokenDosyasi = join(buDosyaninKlasoru, '.test-sunucu-token');
const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
// Dashboard'dan başlatılan tek bir koşunun (süreç başladıktan sonra) en fazla ne kadar
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
const logDosyasi = join(buDosyaninKlasoru, 'test-sunucu.log');
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

export function tokenGetirYaOlustur() {
  if (existsSync(tokenDosyasi)) {
    const mevcut = readFileSync(tokenDosyasi, 'utf-8').trim();
    if (mevcut) return mevcut;
  }
  const yeni = randomBytes(24).toString('hex');
  writeFileSync(tokenDosyasi, yeni, 'utf-8');
  return yeni;
}

const TOKEN = tokenGetirYaOlustur();

// OTURUM TOKEN'I — platform arayüzü (GET / ile sunulan kabuk ve "Mevcut görünüm") için.
// Her sunucu başlangıcında rastgele üretilir, YALNIZCA bellekte durur ve HİÇBİR dosyaya
// yazılmaz: sunucu her yanıtta sayfaya (HTML içine) enjekte eder; yanıt "no-store" ile
// önbelleğe alınmaz. /platform/* uç noktaları (kasa, yedek, profiller) YALNIZCA bu token'ı
// kabul eder. Diskteki eski token (TOKEN, .test-sunucu-token) GEÇİCİ olarak yalnızca dosya
// (file://) olarak açılan eski dashboard'un /calistir vb. istekleri için geçerlidir.
const OTURUM_TOKEN = randomBytes(32).toString('hex');

/** Zamanlamadan bağımsız karşılaştırma. @param {unknown} a @param {string} b */
function tokenEsit(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Eski dashboard token'ı veya bu sürecin oturum token'ı. @param {unknown} token */
function tokenGecerli(token) {
  const gecerli = tokenEsit(token, OTURUM_TOKEN) || tokenEsit(token, TOKEN);
  // Kimliği doğrulanmış dashboard etkinliği platform kasasının otomatik kilit sayacını sıfırlar.
  if (gecerli) platformEtkinligiBildir();
  return gecerli;
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
// raporundaki ve dashboard'daki diğer tablolardakiyle tutarlı olsun diye.
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

// Kalıcı veri dosyalarını (jet-seyahat.json, ortak.json) ATOMİK yazar: içerik önce aynı
// klasörde geçici bir dosyaya yazılır, sonra rename ile hedefin üzerine taşınır. Böylece
// yazma yarıda kesilse (sunucu çökse, disk dolsa) bile hedef dosya ya ESKİ ya YENİ haliyle
// kalır — yarım/bozuk bir JSON asla oluşmaz (rename aynı dosya sisteminde atomiktir).
function atomikYaz(hedefYol, icerik) {
  const geciciYol = `${hedefYol}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(geciciYol, icerik, 'utf-8');
    renameSync(geciciYol, hedefYol);
  } catch (hata) {
    try {
      if (existsSync(geciciYol)) unlinkSync(geciciYol);
    } catch {
      // yok sayılır — asıl hata aşağıda fırlatılıyor
    }
    throw hata;
  }
}

// /medya için HTTP "Range: bytes=..." başlığını çözer.
//  - undefined döner: başlık yok ya da desteklenmeyen/bozuk biçim (ör. çoklu aralık) →
//    RFC 9110'a göre başlık yok sayılır, dosyanın tamamı 200 ile gönderilir.
//  - null döner: biçim geçerli ama karşılanamıyor (başlangıç >= boyut, boş dosya,
//    "bytes=-0", başlangıç > bitiş) → çağıran 416 döner.
//  - { baslangic, bitis } döner: bitis her zaman boyut-1'e kırpılmıştır.
// "bytes=-500" (SON 500 bayt, "suffix range") ÖNCEDEN yanlışlıkla 0-500 olarak
// yorumlanıyordu; artık doğru şekilde dosyanın son 500 baytı olarak çözülür.
function byteAraligiCoz(baslik, boyut) {
  if (typeof baslik !== 'string') return undefined;
  const eslesme = /^bytes=(\d*)-(\d*)$/.exec(baslik.trim());
  if (!eslesme || (eslesme[1] === '' && eslesme[2] === '')) return undefined;
  const sayiMi = (metin) => metin === '' || Number.isSafeInteger(Number(metin));
  if (!sayiMi(eslesme[1]) || !sayiMi(eslesme[2])) return null;

  if (eslesme[1] === '') {
    const sonBaytSayisi = Number(eslesme[2]);
    if (sonBaytSayisi === 0 || boyut === 0) return null;
    return { baslangic: Math.max(0, boyut - sonBaytSayisi), bitis: boyut - 1 };
  }

  const baslangic = Number(eslesme[1]);
  if (baslangic >= boyut) return null;
  if (eslesme[2] === '') return { baslangic, bitis: boyut - 1 };
  const istenenBitis = Number(eslesme[2]);
  if (istenenBitis < baslangic) return null;
  return { baslangic, bitis: Math.min(istenenBitis, boyut - 1) };
}

function jsonGonder(res, durumKodu, govde) {
  const metin = JSON.stringify(govde);
  res.writeHead(durumKodu, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(metin);
}

// Bir koşu videosunun disk yolunu, dashboard'un doğrudan <video src="..."> olarak
// kullanabileceği bir /medya URL'sine çevirir (bkz. aşağıdaki /medya route'u). YALNIZCA
// platform sonuç kaydı kapalıyken (eski davranış: düz dosyalar test-results/ altında) kullanılır.
function medyaUrlOlustur(dosyaYolu) {
  if (!dosyaYolu) return null;
  return `http://127.0.0.1:${PORT}/medya?token=${encodeURIComponent(TOKEN)}&yol=${encodeURIComponent(dosyaYolu)}`;
}

// Platform sonuç kaydı açıkken koşunun son ekran görüntüsü ve videosu ŞİFRELİ medya deposundadır;
// panel bunları /platform/medya/<id> ile (kasa açık + oturum token'ı) gösterir. Oturum token'ı
// yalnızca isteği zaten oturum token'ıyla yapan sayfaya (sunulan "Mevcut görünüm") verilir;
// dosya (file://) olarak açılan eski dashboard'a verilmez (o zaman görsel/video bağlantısı yok).
function platformMedyaUrl(medyaId, istekToken) {
  if (!medyaId || !tokenEsit(istekToken, OTURUM_TOKEN)) return null;
  return `http://127.0.0.1:${PORT}/platform/medya/${encodeURIComponent(medyaId)}?token=${encodeURIComponent(OTURUM_TOKEN)}`;
}

// Çalıştırma sonucunu panel yanıtının medya alanlarına çevirir (platform ya da eski JSON yolu).
function panelMedyasi(sonuc, istekToken) {
  if (sonuc.platform) {
    return {
      ekranGoruntusu: null,
      ekranGoruntusuUrl: platformMedyaUrl(sonuc.ekranGoruntusuId, istekToken),
      videoUrl: platformMedyaUrl(sonuc.videoId, istekToken)
    };
  }
  return { ekranGoruntusu: sonuc.ekranGoruntusu, ekranGoruntusuUrl: null, videoUrl: medyaUrlOlustur(sonuc.videoYolu) };
}

// file:// olarak açılan eski dashboard'un gönderdiği "Origin: null" (CORS başlıklarıyla) ve
// sunucunun kendi sunduğu platform arayüzünün aynı-köken istekleri (http://127.0.0.1:<PORT>,
// http://localhost:<PORT>; CORS başlığı gerekmez) kabul edilir. Başka bir origin
// (http://başka-bir-site vb.) her zaman reddedilir.
const AYNI_KOKENLER = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
function corsBasliklariniUygula(req, res) {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && AYNI_KOKENLER.has(origin.toLowerCase())) return true;
  if (origin === 'null' || origin === undefined) {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    // X-Test-Sunucu-Token / X-Kasa-Parola: /platform/yedek/ice-aktar ham dosya yüklemesi
    // (JSON gövdesi olmadığı için token ve parola başlıkta gelir).
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Test-Sunucu-Token, X-Kasa-Parola');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Yedek-Sayimlari');
    return true;
  }
  return false;
}

// Sunucu zaten yalnızca 127.0.0.1'e bağlanıyor; bu kontrol ek bir savunma katmanı:
// (1) İsteğin KAYNAĞI gerçekten bu makine mi (loopback adresi)?
// (2) Host başlığı bizim adresimiz mi? — "DNS rebinding" saldırısında kötü niyetli bir
//     site kendi alan adını 127.0.0.1'e çözdürüp tarayıcıyı bu sunucuya yönlendirebilir;
//     o durumda Host başlığı saldırganın alan adını (ör. evil.com) taşır ve burada reddedilir.
// Dashboard her zaman "http://127.0.0.1:<PORT>" tabanını kullanır (bkz. urun-hata-raporu.mjs
// > TEST_SUNUCU.taban), bu yüzden meşru istekler etkilenmez.
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
// ekOrtamDegiskenleri: /jetseyahat-senaryo/dene, geçici "ek senaryo" dosyasının yolunu
// (TEST_SUNUCU_EK_SENARYO_DOSYASI) listeleme sürecine de vermek için kullanır — aksi halde
// Playwright geçici senaryoyu listede göremez ve whitelist kontrolü onu reddeder.
function senaryolariListele(ortam, ekstraArgumanlar = [], grepDeseni = undefined, ekOrtamDegiskenleri = {}) {
  return new Promise((resolve, reject) => {
    if (!playwrightCliVarMi()) {
      reject(new Error(`"${PLAYWRIGHT_CLI_YOLU}" bulunamadı (npm install çalıştırılmamış olabilir).`));
      return;
    }
    execFile(
      process.execPath,
      [PLAYWRIGHT_CLI_YOLU, 'test', '--list', '--reporter=json', ...ekstraArgumanlar],
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
          TEST_ENV: ortam,
          TEST_SUNUCU_TUM_LISTE: '1',
          // Kasa açıksa türetilmiş anahtar (yalnızca alt sürecin belleğinde): liste veritabanından
          // kurulur; kilitliyse dosyalardan (bkz. tests/support/platform-veri.ts).
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
// alır — hem "Senaryolar" tablosunun veri kaynağı (urun-hata-raporu.mjs, rapor üretilirken
// bir kez çağırır) hem de /calistir'deki whitelist kontrolünün kaynağı budur (istemcinin
// gönderdiği veriye asla güvenilmez).
export function tumSenaryolariGetir(ortam) {
  const devamEden = devamEdenListelemeler.get(ortam);
  if (devamEden) return devamEden;

  const istek = senaryolariListele(ortam).finally(() => {
    devamEdenListelemeler.delete(ortam);
  });
  devamEdenListelemeler.set(ortam, istek);
  return istek;
}

// Çalıştırma sonrası "--reporter=json" çıktısından (PLAYWRIGHT_JSON_OUTPUT_NAME ile
// dosyaya yazdırılır) bizim tetiklediğimiz senaryonun sonucunu bulur.
function sonucuOku(jsonYolu, senaryoAdi) {
  const veri = JSON.parse(readFileSync(jsonYolu, 'utf-8'));
  let bulunan = null;
  (function gez(suite) {
    for (const alt of suite.suites ?? []) gez(alt);
    for (const spec of suite.specs ?? []) {
      if (spec.title !== senaryoAdi) continue;
      for (const test of spec.tests ?? []) {
        const sonDeneme = (test.results ?? [])[test.results.length - 1];
        if (!sonDeneme) continue;
        // Playwright'ın JSON raporlayıcısı sürüme göre hatayı ya tekil "error" alanında
        // ya da "errors" dizisinde taşıyabiliyor; ikisini de dener, hangisi doluysa onu
        // kullanır (ilk denemede sadece "error"a bakıyordum, o yüzden boş görünüyordu).
        const hataNesnesi =
          sonDeneme.error ??
          (Array.isArray(sonDeneme.errors) ? sonDeneme.errors.find((e) => e?.message) : null);
        const hataMesajiHam = hataNesnesi?.message ?? hataNesnesi?.value ?? null;

        // fixtures.ts'teki hataYakalayici, başarılı/başarısız her koşuda (dashboard'dan
        // tetiklenmişse — bkz. TEST_SUNUCU_GORUNUR) bir ekran görüntüsü attach eder.
        // Bu dosyayı diskten okuyup base64'e çevirip yanıta koyuyoruz ki dashboard'daki
        // sonuç popup'ı görseli doğrudan gösterebilsin.
        const ekranGoruntusuEki = (sonDeneme.attachments ?? []).find(
          (ek) => ek?.name === '✅ BAŞARILI - Son Ekran Görüntüsü' || ek?.name === '❌ HATA ANI - Ekran Görüntüsü'
        );
        // NOT: fixtures.ts görüntüyü testInfo.attach({ body }) ile BELLEKTEN eklediği için
        // JSON raporunda bu ekin "path"i yok, görüntü "body" alanında base64 olarak gelir.
        // Yalnızca path'e bakıldığında görüntü hiç bulunamıyor ve panelde gösterilmiyordu.
        // Sıra: bizim ekimizin body'si → bizim ekimizin dosyası → Playwright'ın hata anında
        // kendi çektiği "screenshot" eki (test-failed-*.png).
        const pngDosyasiniOku = (yol) => {
          if (!yol || !existsSync(yol)) return null;
          try {
            return readFileSync(yol).toString('base64');
          } catch (okumaHatasi) {
            console.error(`Ekran görüntüsü okunamadı: ${okumaHatasi.message}`);
            return null;
          }
        };
        const playwrightEkranGoruntusu = (sonDeneme.attachments ?? [])
          .filter((ek) => ek?.name === 'screenshot' && ek?.contentType === 'image/png')
          .pop();
        const ekranGoruntusuBase64 =
          (typeof ekranGoruntusuEki?.body === 'string' && ekranGoruntusuEki.body) ||
          pngDosyasiniOku(ekranGoruntusuEki?.path) ||
          pngDosyasiniOku(playwrightEkranGoruntusu?.path) ||
          null;

        // Video, playwright.config.ts'teki "video: TEST_SUNUCU_GORUNUR ? 'on' : ..."
        // ayarı sayesinde her dashboard koşusunda otomatik kaydedilir ve Playwright
        // TARAFINDAN "video" adıyla otomatik attach edilir (bizim testInfo.attach()
        // çağırmamıza gerek yok). Videolar onlarca MB olabileceğinden base64/JSON'a
        // gömmüyoruz — sadece dosya yolunu tutuyoruz, /medya endpoint'i (aşağıda)
        // bunu doğrudan bir <video src="..."> olarak akıtıyor.
        const videoEki = (sonDeneme.attachments ?? []).find((ek) => ek?.name === 'video');
        const videoYolu = videoEki?.path && existsSync(videoEki.path) ? videoEki.path : null;

        // Hatanın düştüğü EN ÜST seviye test.step başlığı (ör. "Poliçeleştirme açılır ve
        // kart bilgileri girilir") — dashboard > "Senaryo Oluştur", "Bu mesajı beklenen hata
        // olarak kullan" derken hatanın hangi adımda çıktığını buradan çıkarır.
        const basarisizAdim = (sonDeneme.steps ?? []).find((adim) => adim?.error)?.title ?? null;

        bulunan = {
          durum: sonDeneme.status,
          sureMs: sonDeneme.duration,
          basarisizAdim,
          hataMesaji: hataMesajiHam ? String(hataMesajiHam).replace(/\x1b\[[0-9;]*m/g, '') : null,
          ekranGoruntusu: ekranGoruntusuBase64,
          videoYolu
        };
        // Başarısız ama yine de hata mesajı çıkaramadıysak (raporlayıcı formatı yine
        // değişmiş olabilir), en azından ham veriyi terminale basar — dashboard'daki
        // popup boş kalsa bile kök neden burada görünür.
        if (sonDeneme.status !== 'passed' && !hataMesajiHam) {
          console.log('[test-sunucu] Hata mesajı çıkarılamadı, ham "result" verisi:', JSON.stringify(sonDeneme));
        }
      }
    }
  })(veri);
  return bulunan;
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

// ortam -> devam eden rapor üretimi (bkz. /rapor-uret).
const raporUretimleri = new Map();

// Dashboard'u (dashboard-<ortam>.html) mevcut üreticiyle (urun-hata-raporu.mjs) yeniden
// üretir. Aynı ortam için aynı anda tek üretim yapılır.
function raporuUret(ortam) {
  if (!raporUretimleri.has(ortam)) {
    raporUretimleri.set(
      ortam,
      new Promise((coz) => {
        execFile(
          process.execPath,
          [join(projeKoku, 'scripts', 'urun-hata-raporu.mjs'), ortam],
          { cwd: projeKoku, env: { ...process.env, PLATFORM_GORUNUM_KLASORU: GORUNUM_KLASORU }, maxBuffer: 32 * 1024 * 1024, timeout: 5 * 60 * 1000, shell: false },
          (hata, stdout, stderr) => coz(hata ? { basarili: false, mesaj: `Rapor üretilemedi: ${String(stderr || hata.message).slice(-500)}` } : { basarili: true })
        );
      }).finally(() => raporUretimleri.delete(ortam))
    );
  }
  return raporUretimleri.get(ortam);
}

// ---- Platform arayüzü (scripts/platform/arayuz/) ----------------------------------------
// GET /            → kabuk (index.html; oturum token'ı <meta> olarak enjekte edilir)
// GET /arayuz/*    → kabuğun statik CSS/JS dosyaları (sır içermez)
// GET /gorunum/<ortam>[?yenile=1] → mevcut dashboard (dashboard-<ortam>.html); yoksa veya
//   yenile=1 ise mevcut üreticiyle üretilir. Diskteki dosyadaki eski token ve taban adres
//   yanıtta oturum token'ı ve aynı-köken ('' taban) ile değiştirilir; dosyaya YAZILMAZ.
// Tüm HTML yanıtları: Cache-Control: no-store (token tarayıcı önbelleğine düşmesin),
// X-Frame-Options: SAMEORIGIN (başka sitelerin çerçevelemesi engellenir).
const ARAYUZ_KLASORU = join(buDosyaninKlasoru, 'platform', 'arayuz');
// "Mevcut görünüm" dosyalarının (dashboard-<ortam>.html) klasörü: varsayılan proje kökü.
// PLATFORM_GORUNUM_KLASORU yalnızca ikinci bir sunucu örneğinin (ör. doğrulama) proje kökündeki
// görünüm dosyalarının üzerine yazmaması içindir.
const GORUNUM_KLASORU = process.env.PLATFORM_GORUNUM_KLASORU ? resolvePath(process.env.PLATFORM_GORUNUM_KLASORU) : projeKoku;
const ARAYUZ_DOSYALARI = new Map([
  ['/arayuz/stil.css', { dosya: 'stil.css', tur: 'text/css; charset=utf-8' }],
  ['/arayuz/uygulama.js', { dosya: 'uygulama.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ortak.js', { dosya: 'ortak.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ice-aktarma.js', { dosya: 'ice-aktarma.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/ayarlar.js', { dosya: 'ayarlar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/aktarim.js', { dosya: 'aktarim.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/sonuclar.js', { dosya: 'sonuclar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryolar.js', { dosya: 'senaryolar.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/senaryo-formu.js', { dosya: 'senaryo-formu.js', tur: 'text/javascript; charset=utf-8' }],
  ['/arayuz/kosu-paneli.js', { dosya: 'kosu-paneli.js', tur: 'text/javascript; charset=utf-8' }],
  // Genel, saf modüller arayüzle PAYLAŞILIR (kopya yok): model tabanlı form ve tek senaryo doğrulayıcısı.
  ['/arayuz/model-formu.mjs', { yol: join(buDosyaninKlasoru, 'platform', 'senaryolar', 'model-formu.mjs'), tur: 'text/javascript; charset=utf-8' }],
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

async function gorunumuSun(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const eslesme = /^\/gorunum\/(test|canli)$/.exec(url.pathname);
  if (!eslesme) {
    jsonGonder(res, 404, { basarili: false, mesaj: 'Görünüm bulunamadı (ortam: test veya canli).' });
    return;
  }
  const ortam = eslesme[1];
  const dosyaYolu = join(GORUNUM_KLASORU, `dashboard-${ortam}.html`);
  // Eski (Allure dönemi) üretim — sürüm işareti yok — sunulmaz, yeniden üretilir.
  const eskiUretimMi = existsSync(dosyaYolu) && !readFileSync(dosyaYolu, 'utf-8').includes(`content="${GORUNUM_SURUMU}"`);
  if (url.searchParams.get('yenile') === '1' || !existsSync(dosyaYolu) || eskiUretimMi) {
    const sonuc = await raporuUret(ortam);
    if (!sonuc.basarili) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(sonuc.mesaj);
      return;
    }
  }
  let html = readFileSync(dosyaYolu, 'utf-8');
  // Dosyadaki eski token (varsa) ve mutlak taban adres yalnızca YANITTA değiştirilir.
  html = html.split(TOKEN).join(OTURUM_TOKEN).replace(
    /var TEST_SUNUCU = \{[^\n]*\};/,
    `var TEST_SUNUCU = { taban: "", token: ${JSON.stringify(OTURUM_TOKEN)} };`
  );
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin'
  });
  res.end(html);
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

// kosuId -> "<dosya>::<ad>" (kosuListesiAnahtari biçiminde). testiCalistirVeBekle'ye giren
// her koşu (kuyrukta bekleyen ya da gerçekten çalışan) burada durur; dosya sırasındaki
// görevi bitince silinir. /senaryo-guncelle, o an koşan bir senaryonun verisini (ör.
// başlığını) altından değiştirmemek için buna bakar — calisanSurecler yalnızca süreci
// BAŞLAMIŞ koşuları, kuyruktaBekleyenler ise yalnızca HTTP yanıtını bekleyenleri tuttuğu
// için ikisi de tek başına yeterli değil.
const aktifKosuAnahtarlari = new Map();

// Dashboard'daki "Durdur" ikonu tarafından çağrılır. Süreç zaten çalışıyorsa
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
// raporlayıcı stdout'a yazmaya devam eder; yapılandırılmış sonuç için AYRICA "json"
// raporlayıcı, PLAYWRIGHT_JSON_OUTPUT_NAME ile geçici bir dosyaya yazdırılır (stdout'ta
// ikisi karışmasın diye).
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

// ekOrtamDegiskenleri: yalnızca /jetseyahat-senaryo/dene tarafından doldurulur (geçici
// ek senaryo dosyasının yolu); normal /calistir koşularında boştur.
async function testiCalistirVeBekle(ortam, senaryoAdi, dosya, tumSenaryolar, kosuId, ekOrtamDegiskenleri = {}) {
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
  const desen = `${regexIcinKac(senaryoAdi)}$`;

  // NOT (3. kök neden): Bu kontrol ÖNCEDEN yalnızca "ad"a (başlığa) bakıyordu — ama
  // aynı senaryo başlığı ("...Kiracı Testi", "...Mal Sahibi Testi" gibi) BİRDEN FAZLA
  // ürün dosyasında (jet-konut, jet-satis, jet-ilk-ates-konut vb.) KASITLI olarak
  // tekrarlanabiliyor. Bu yüzden sadece "ad" ile filtrelemek, gerçekte TEK bir dosyada
  // benzersiz olan bir senaryoyu "3 kez eşleşti" diyerek yanlışlıkla reddediyordu.
  // Çözüm: hem "ad" HEM "dosya" ile eşleştir — tekillik artık (dosya, başlık) ikilisi
  // için doğrulanıyor, ki zaten çalıştırılmak istenen kayıt da bu ikiliyle geliyor.
  // Sonuçlar platform veritabanına yazılıyorsa (proje aktarılmış) medya şifrelenmek zorunda:
  // kasa kilitliyken koşu BAŞLATILMAZ (anahtar olmadan ekran görüntüsü/video düz metin kalırdı).
  if ((await platformSonucKaydiEtkinMi()) && !(await platformKasaAcikMi())) {
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
  aktifKosuAnahtarlari.set(kosuId, kosuListesiAnahtari(dosya, senaryoAdi));

  // bkz. kuyruktaBekleyenler NOTU: kuyruğa girmeden ÖNCE bu koşunun HTTP yanıtını
  // çözecek fonksiyonu kaydediyoruz ki calismaDurdur, koşu daha sırası gelmeden
  // "Durdur" ile iptal edilirse yanıtı hemen dönebilsin.
  return new Promise((resolve) => {
    kuyruktaBekleyenler.set(kosuId, resolve);
    dosyaSirasiIleCalistir(dosya, () => gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId, ekOrtamDegiskenleri)).then((sonuc) => {
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

async function gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId, ekOrtamDegiskenleri = {}) {
  // Proje platform veritabanına aktarılmışsa sonuçlar ve (şifreli) medya platform raporlayıcısı
  // (scripts/platform/raporlayici.mjs) tarafından veritabanına yazılır; bu durumda JSON sonuç
  // dosyası HİÇ yazdırılmaz (eklerin base64 kopyası geçici klasörde bile düz metin kalmasın) ve
  // panelin sonucu veritabanından okunur. Aksi halde eski davranış (JSON + test-results).
  const platformEtkin = await platformSonucKaydiEtkinMi().catch(() => false);
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

    const jsonCiktiYolu = platformEtkin ? null : join(tmpdir(), `test-sunucu-sonuc-${randomBytes(6).toString('hex')}.json`);
    // Koşu artık HEADLESS çalışır — masaüstünde ayrı bir Chrome penceresi açılmaz
    // (kullanıcı bunun yerine dashboard'daki "canlı izleme panelini" istedi). Canlı
    // izleme, bu koşuya özel geçici bir PNG dosyasına (canliYolu) saniyede bir yazılan
    // ekran görüntüsü ile sağlanır (bkz. fixtures.ts > canliIzlemeYayini ve aşağıdaki
    // /canli ucu).
    const canliYolu = join(tmpdir(), `test-sunucu-canli-${randomBytes(6).toString('hex')}.png`);
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
    const argumanlar = [PLAYWRIGHT_CLI_YOLU, 'test', dosya, `--output=${ciktiKlasoru}`];

    console.log(`\n▶ [${ortam.toUpperCase()}] "${senaryoAdi}" başlatıldı...\n`);

    const alt = spawn(process.execPath, argumanlar, {
      cwd: projeKoku,
      env: {
        ...process.env,
        TEST_ENV: ortam,
        ...(jsonCiktiYolu ? { PLAYWRIGHT_JSON_OUTPUT_NAME: jsonCiktiYolu } : {}),
        KOSU_KIMLIGI: kosuKimligi,
        // Raporlayıcı sonuçları bu sunucuya gönderir (veritabanının tek sahibi sunucudur). Token:
        // raporlayıcı token'ı (yalnızca /platform/sonuc/* yazma uçlarında geçerli).
        PLATFORM_SONUC_ADRESI: `http://127.0.0.1:${PORT}`,
        PLATFORM_SONUC_TOKENI: TOKEN,
        TEST_SUNUCU_GORUNUR: '1',
        TEST_SUNUCU_CANLI_YOLU: canliYolu,
        TEST_SUNUCU_GREP_DESENI: desen,
        // Kasa açıksa türetilmiş anahtar: test verisi platform veritabanından okunur (terminalde
        // parola sorulmaz). Kasa kilitliyse boş — alt süreç dosyalara düşer.
        ...platformTestOrtami(),
        ...ekOrtamDegiskenleri,
        KOSU_KIMLIGI: kosuKimligi
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

    const kayit = { surec: alt, pid: alt.pid, iptalEdiliyor: false, zamanAsimi: false, canliYolu };
    calisanSurecler.set(kosuId, kayit);
    aktifPlatformKosulari.set(kosuKimligi, (aktifPlatformKosulari.get(kosuKimligi) ?? 0) + 1);
    const platformKosusunuBirak = async (durum) => {
      const kalan = (aktifPlatformKosulari.get(kosuKimligi) ?? 1) - 1;
      if (kalan > 0) { aktifPlatformKosulari.set(kosuKimligi, kalan); return; }
      aktifPlatformKosulari.delete(kosuKimligi);
      if (platformEtkin) await platformKosusunuKapat(kosuKimligi, durum).catch(() => {});
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
            hataMesaji: `Koşu ${Math.round(KOSU_SURE_LIMITI_MS / 60000)} dakikalık süre limitini aştığı için durduruldu.`,
            ekranGoruntusu: null,
            videoYolu: null
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
      if (platformEtkin) {
        try {
          const p = await platformKosuSonucu(kosuKimligi, kosuListesiAnahtari(dosya, senaryoAdi));
          if (p) {
            sonuc = {
              platform: true, durum: p.durum, sureMs: p.sureMs, hataMesaji: p.hataMesaji, basarisizAdim: p.basarisizAdim,
              ekranGoruntusuId: p.ekranGoruntusuId, videoId: p.videoId, sonucId: p.sonucId
            };
          }
        } catch (okumaHatasi) {
          console.error(`Sonuç platform veritabanından okunamadı: ${okumaHatasi.message}`);
        }
      }
      try {
        if (jsonCiktiYolu && existsSync(jsonCiktiYolu)) {
          sonuc = sonucuOku(jsonCiktiYolu, senaryoAdi);
          unlinkSync(jsonCiktiYolu);
        }
      } catch (okumaHatasi) {
        console.error(`Sonuç dosyası okunamadı/ayrıştırılamadı: ${okumaHatasi.message}`);
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

// ---- JetSeyahat "Senaryo Oluştur" özelliği (dashboard'daki "+ Senaryo Oluştur"
// popup'ından tetiklenir) ----
// Bu özellik yeni bir çalıştırma altyapısı KURMAZ; MEVCUT senaryolariListele +
// testiCalistirVeBekle akışını kullanır.
//
// "dene" isteği KALICI HİÇBİR DOSYAYA YAZMAZ: kullanıcının doldurduğu alanlar GEÇİCİ ve
// belirgin bir başlıkla (SENARYO_OLUSTUR_GECICI_ON_EK ile başlayan) işletim sisteminin
// geçici klasöründeki ayrı bir "ek senaryo" JSON dosyasına yazılır (yeni girilen bir
// acente profili de aynı dosyaya). Bu dosyanın yolu TEST_SUNUCU_EK_SENARYO_DOSYASI ortam
// değişkeniyle hem "--list" hem de koşu sürecine verilir; tests/support/test-data.ts
// yükleyicileri bu değişken tanımlıysa ek kayıtları kalıcı verinin üzerine birleştirir.
// Deneme bitince geçici dosya silinir — silinemese bile (sunucu çökerse) kalıcı
// jet-seyahat.json / ortak.json'da iz kalmaz.
// ÖNCEDEN geçici senaryo doğrudan jet-seyahat.json'a eklenip finally'de siliniyordu;
// sunucu arada kapanınca kayıt dosyada kalmıştı. Ayrıca yeni acente profili "dene"de
// bile ortak.json'a kalıcı yazılıyordu. İkisi de artık yalnızca "kaydet"te yapılır.
//
// "kaydet" isteğinde aynı senaryo nesnesi, kullanıcının verdiği KALICI başlıkla
// jet-seyahat.json'a (gerekirse yeni acente profili ortak.json'a) ATOMİK olarak yazılır;
// "Senaryolar" listesinde görünmesi için dashboard'ın yeniden üretilmesi (npm run
// rapor:test) gerekir — mevcut "Koşu geçmişi" statik anlık görüntü sınırlamasıyla aynı
// mimari kısıt.
const SENARYO_OLUSTUR_GECICI_ON_EK = '__senaryo_olustur_deneme__ ';
// tests/support/test-data.ts > EK_SENARYO_DOSYASI_ORTAM_DEGISKENI ile AYNI TUTULMALI.
const EK_SENARYO_ORTAM_DEGISKENI = 'TEST_SUNUCU_EK_SENARYO_DOSYASI';
const EK_SENARYO_DOSYA_ON_EKI = 'test-sunucu-ek-senaryo-';
// "dene" listelemesini yalnızca JetSeyahat senaryo dosyasına daraltan konumsal filtre
// (Playwright bunu dosya yoluna karşı regex olarak eşleştirir) — hem hızlı hem de geçici
// senaryonun yalnızca bu dosyada aranmasını garanti eder.
const JET_SEYAHAT_SENARYO_FILTRESI = 'scenarios/jet-seyahat/';
// "Kaydet" ile eklenen JetSeyahat senaryolarının üretildiği spec dosyası (testDir'e göre
// göreli, "--list" çıktısındaki biçim). prim-hesaplama.spec.ts, jet-seyahat.json >
// senaryolar dizisindeki her kayıt için test(senaryo.baslik, ...) açar — yani yeni
// senaryonun koşu listesi anahtarı "<bu dosya>::<başlık>" olur.
const JET_SEYAHAT_SPEC_DOSYASI = 'scenarios/jet-seyahat/prim-hesaplama.spec.ts';

function jetSeyahatDosyaYolu(ortam) {
  return join(projeKoku, 'tests', 'data', ortam, 'jet-seyahat.json');
}

function jetSeyahatVerisiniOku(ortam) {
  const yol = jetSeyahatDosyaYolu(ortam);
  if (!existsSync(yol)) {
    throw new Error(`jet-seyahat.json bulunamadı: ${yol}`);
  }
  return JSON.parse(readFileSync(yol, 'utf-8'));
}

function jetSeyahatVerisiniYaz(ortam, veri) {
  atomikYaz(jetSeyahatDosyaYolu(ortam), JSON.stringify(veri, null, 2) + '\n');
}

// Dashboard popup'ından gelen gövdeyi TEK doğrulayıcıyla (scripts/dogrulama/
// senaryo-dogrulayici.mjs — dashboard formu ve Playwright spec'i de aynısını kullanır)
// doğrular. Kurala uymuyorsa 400 durum kodlu, alan bazında hatalar taşıyan bir Error
// fırlatılır (çağıranlar { basarili: false, mesaj, hatalar: [{ alan, mesaj }] } döner);
// hiçbir dosyaya yazılmadan ÖNCE çağrılır.
function dogrulamaHatasi(hatalar, uyarilar = []) {
  const hata = new Error(hatalariMetneCevir(hatalar));
  hata.durumKodu = 400;
  hata.hatalar = hatalar;
  hata.uyarilar = uyarilar;
  return hata;
}

// Hata yanıtının gövdesi: alan bazında hatalar varsa (doğrulama hatası) onlar da eklenir.
function hataGovdesi(hata) {
  return {
    basarili: false,
    mesaj: hata.message,
    ...(Array.isArray(hata.hatalar) ? { hatalar: hata.hatalar, uyarilar: hata.uyarilar || [] } : {})
  };
}

function jetSeyahatGirdisiniDogrula(baslik, girdi, ortam, ortakVeri) {
  if (!girdi || typeof girdi !== 'object' || Array.isArray(girdi)) {
    throw dogrulamaHatasi([{ alan: '', mesaj: MESAJLAR.senaryoNesneDegil() }]);
  }
  const sonuc = senaryoyuDogrula({ ...girdi, baslik }, {
    ...ekranModeliniOku(projeKoku),
    ortak: ortakBaglaminiOlustur(ortakVeri),
    ortam,
    kaynak: 'girdi'
  });
  if (!sonuc.gecerli) throw dogrulamaHatasi(sonuc.hatalar, sonuc.uyarilar);
  return sonuc.uyarilar;
}

// Dashboard popup'ından gelen ham gövdeyi DOĞRULAR (jetSeyahatGirdisiniDogrula) ve
// jet-seyahat.json > senaryolar dizisindeki bir öğe şekline (bkz. tests/support/test-data.ts >
// JetSeyahatTestData) dönüştürür; yalnızca dolu/tanımlı alanlar kopyalanır.
// HİÇBİR DOSYAYA YAZMAZ: { senaryo, yeniAcenteProfilleri, uyarilar } döner —
// yeniAcenteProfilleri, ortak.json > kullaniciDegistir'de henüz OLMAYAN ve bu senaryo için
// oluşturulan acente profilleridir (anahtar -> profil). Bunları "kaydet" ortak.json'a, "dene"
// ise yalnızca geçici ek senaryo dosyasına yazar.
function jetSeyahatSenaryoNesnesiOlustur(baslik, girdi, ortam) {
  const ortakVeri = ortakVerisiniOku(ortam);
  const uyarilar = jetSeyahatGirdisiniDogrula(baslik, girdi, ortam, ortakVeri);
  const doluMu = (deger) => deger !== undefined && deger !== null && !(typeof deger === 'string' && !deger.trim());

  const senaryo = { baslik, kapsam: girdi.kapsam, alternatif: girdi.alternatif };
  // COVID teminatı acentenin ekranında görünmüyorsa (ör. 30856) zorunlu değildir; verilmediyse yazılmaz.
  if (doluMu(girdi.covidTeminati)) senaryo.covidTeminati = girdi.covidTeminati;
  senaryo.sorguTipi = girdi.sorguTipi;
  senaryo.ettiren = girdi.ettiren;

  // Çoklu sorguda, popup'ta yüklenen Excel dosyası (bkz. /jetseyahat-coklu-sorgu-yukle)
  // bu SENARYOYA ÖZEL olarak kullanılır — verilmezse ürün genelindeki sabit dosya
  // (urunData.cokluSorguDosyasi) kullanılmaya devam eder (bkz. jet-seyahat.page.ts >
  // sorguTipiniHazirla). Kişi sayısı dosyayla birlikte zorunludur (doğrulayıcı).
  if (girdi.sorguTipi === 'coklu' && doluMu(girdi.cokluSorguDosyasi)) {
    senaryo.cokluSorguDosyasi = girdi.cokluSorguDosyasi;
    senaryo.cokluSorguKisiSayisi = Number(girdi.cokluSorguKisiSayisi);
  }

  // Farklı ettiren: hazır profil YA DA serbest kimlik (doğrulayıcı ikisinin birden
  // verilmesini ve hiçbirinin verilmemesini reddeder).
  if (girdi.ettiren !== 'ayni') {
    if (doluMu(girdi.ettirenProfili)) senaryo.ettirenProfili = girdi.ettirenProfili;
    else if (girdi.ettiren === 'farkliOzel') senaryo.ettirenOzelKimligi = girdi.ettirenOzelKimligi;
    else senaryo.ettirenTuzelKimligi = girdi.ettirenTuzelKimligi;
  }

  // Sigortalı: hazır bir profil anahtarı (ör. "tc2", ortakData.kimlikBilgileri.ozel içinden
  // test ANINDA çözülür, bkz. prim-hesaplama.spec.ts) ya da serbest girilmiş kimlik nesnesi.
  if (doluMu(girdi.sigortaliProfili)) senaryo.sigortaliProfili = girdi.sigortaliProfili;
  else if (girdi.sigortaliKimligi) senaryo.sigortaliKimligi = girdi.sigortaliKimligi;
  if (girdi.kayakTeminati === true) senaryo.kayakTeminati = true;
  // Beklenen sonuç: yeni senaryolar her zaman odemeAdimiDahil + beklenenSonuc ile yazılır.
  Object.assign(senaryo, beklenenSonucuNormallestir(girdi));
  // Ödeme kartı (dashboard > "Ödeme bilgileri"): yalnızca ortak test kartından FARKLIYSA
  // senaryoya yazılır. Aynıysa hiç yazılmaz — senaryo ortak kartı kullanır ve ortak kart
  // ileride değişirse onu izler.
  if (girdi.krediKarti !== undefined && girdi.krediKarti !== null) {
    const varsayilan = varsayilanKrediKartiGetir(ortam);
    const kart = kartiNormallestir(girdi.krediKarti, varsayilan);
    if (!krediKartlariAyniMi(kart, varsayilan)) senaryo.krediKarti = kart;
  }

  // Acente: kullanıcı popup'ta acente KODUNU ve o acentedeki kullanıcı KODUNU elle
  // yazar (canlı bir sorgu YAPILMAZ — kullanıcı doğru değerleri zaten biliyor). Bu ikili,
  // ortak.json > kullaniciDegistir'de HENÜZ bir anahtara karşılık gelmeyebilir
  // (testBaslangiciniHazirla sadece bir ANAHTAR kabul eder, ham acente kodu değil);
  // böyle bir anahtar yoksa burada oluşturulup ortak.json'a eklenir, varsa (aynı
  // acente+kullanıcı) olan anahtar tekrar kullanılır. "acentePartajiSecenegi" (kullanıcı
  // değiştir ekranındaki select2 sonucunu filtrelemek için kullanılan tam etiket) burada
  // bilinmiyor; kodun kendisiyle aynı verilir — arama kutusuna zaten aynı kod yazıldığından
  // (bkz. kullanici-degistir.page.ts) sonuç listesi o kodu içeren TEK satıra iner.
  const yeniAcenteProfilleri = {};
  if (doluMu(girdi.acenteKodu)) {
    const acenteKodu = String(girdi.acenteKodu).trim();
    const acenteKullanicisi = String(girdi.acenteKullanicisi).trim();
    const oncekiAnahtarlar = new Set(Object.keys(ortakVeri.kullaniciDegistir));
    const anahtar = ortakAcenteProfiliBulYaEkle(ortakVeri, {
      acentePartaji: acenteKodu,
      acentePartajiSecenegi: acenteKodu,
      acenteKullanicisi: acenteKullanicisi
    });
    // Profil zaten varsa ortak.json'a dokunmaya gerek yok; yeni oluşturulduysa çağırana
    // bildirilir (bkz. yukarıdaki açıklama) — burada diske YAZILMAZ.
    if (!oncekiAnahtarlar.has(anahtar)) {
      yeniAcenteProfilleri[anahtar] = ortakVeri.kullaniciDegistir[anahtar];
    }
    senaryo.acenteProfili = anahtar;
  } else if (doluMu(girdi.acenteProfili)) {
    senaryo.acenteProfili = girdi.acenteProfili;
  }

  return { senaryo, yeniAcenteProfilleri, uyarilar };
}

// ---- Senaryoya özel ödeme kartı (JetSeyahat > "Ödeme bilgileri") ----
// Kart kuralları ve mesajları tek doğrulayıcıdadır (senaryo-dogrulayici.mjs); mesajlar kart
// numarasını/CVV'yi ASLA içermez.

// ortak.json > odeme.krediKarti — popup'taki "Ödeme bilgileri" alanlarının ön değeri ve
// "kullanıcı kartı değiştirdi mi?" karşılaştırmasının referansı. beklenenHataMesaji
// (bazı ürünlerin ödeme sonucu kontrolü) kart girişine ait olmadığından döndürülmez.
// Kart tanımlı değilse null.
function varsayilanKrediKartiGetir(ortam) {
  const kart = ortakVerisiniOku(ortam).odeme?.krediKarti;
  if (!kart || typeof kart !== 'object') return null;
  return {
    isim: String(kart.isim ?? ''),
    soyisim: String(kart.soyisim ?? ''),
    kartNo: String(kart.kartNo ?? '').replace(/\s+/g, ''),
    guvenlikKodu: String(kart.guvenlikKodu ?? ''),
    sonKullanmaAyi: { deger: String(kart.sonKullanmaAyi?.deger ?? ''), metin: String(kart.sonKullanmaAyi?.metin ?? '') },
    sonKullanmaYili: { deger: String(kart.sonKullanmaYili?.deger ?? ''), metin: String(kart.sonKullanmaYili?.metin ?? '') },
    taksit: { deger: String(kart.taksit?.deger ?? ''), metin: String(kart.taksit?.metin ?? '') }
  };
}

// Popup'ın "hazır profil" dropdown'larını (ettiren/sigortalı) ve "Çoklu" sorgu tipi
// seçildiğinde kullanılacak sabit Excel dosyası bilgisini döner — ikisi de sadece
// yerel JSON dosyalarını okur, canlı tarayıcı gerekmez.
function jetSeyahatYardimciVeriGetir(ortam) {
  const ortakVeri = ortakVerisiniOku(ortam);
  const jetSeyahatVeri = jetSeyahatVerisiniOku(ortam);
  return {
    kimlikProfilleri: {
      ozel: ortakVeri.kimlikBilgileri?.ozel || {},
      tuzel: ortakVeri.kimlikBilgileri?.tuzel || {}
    },
    cokluSorgu: {
      dosya: jetSeyahatVeri.jetSeyahat?.cokluSorguDosyasi,
      kisiSayisi: jetSeyahatVeri.jetSeyahat?.cokluSorguKisiSayisi
    },
    // "Beklenen Sonuç > Başarılı akış" açıklamasında gösterilen, ödeme sonrası başarı
    // sayılan mesajlar (rapor üretilirken VERI'ye de gömülür; bu değer daha günceldir).
    kabulEdilenOdemeSonuclari: jetSeyahatVeri.jetSeyahat?.kabulEdilenOdemeSonuclari || [],
    // "Ödeme bilgileri" alanlarının ön değeri (ortak test kartı). Dashboard HTML'ine
    // GÖMÜLMEZ; yalnızca popup açılınca bu uçtan canlı alınır.
    varsayilanKrediKarti: varsayilanKrediKartiGetir(ortam),
    // Formdaki doğrulayıcı, acenteye bağlı görünürlüğü (ör. 30856'da COVID yok) acente
    // koduyla bulur; yalnızca profil anahtarı → acente kodu gönderilir.
    acenteProfilleri: Object.fromEntries(
      Object.entries(ortakVeri.kullaniciDegistir || {}).map(([anahtar, profil]) => [anahtar, { acentePartaji: String(profil?.acentePartaji ?? '') }])
    )
  };
}

function ortakDosyaYolu(ortam) {
  return join(projeKoku, 'tests', 'data', ortam, 'ortak.json');
}

function ortakVerisiniOku(ortam) {
  const yol = ortakDosyaYolu(ortam);
  if (!existsSync(yol)) {
    throw new Error(`ortak.json bulunamadı: ${yol}`);
  }
  return JSON.parse(readFileSync(yol, 'utf-8'));
}

function ortakVerisiniYaz(ortam, veri) {
  atomikYaz(ortakDosyaYolu(ortam), JSON.stringify(veri, null, 2) + '\n');
}

// Manuel girilen acente kodu + kullanıcısıyla eşleşen bir profil ortak.json >
// kullaniciDegistir altında zaten varsa onun anahtarını döner; yoksa yeni, benzersiz
// bir anahtar altında ekleyip o anahtarı döner. "veri" mutasyona uğrar — çağıran
// bunun ardından ortakVerisiniYaz ile diske yazmalıdır.
function ortakAcenteProfiliBulYaEkle(veri, acente) {
  const mevcutAnahtar = Object.keys(veri.kullaniciDegistir).find((anahtar) => {
    const kayit = veri.kullaniciDegistir[anahtar];
    return kayit.acentePartaji === acente.acentePartaji && kayit.acenteKullanicisi === acente.acenteKullanicisi;
  });
  if (mevcutAnahtar) return mevcutAnahtar;

  let yeniAnahtar = `Acente${acente.acentePartaji}`;
  let sayac = 2;
  while (veri.kullaniciDegistir[yeniAnahtar]) {
    yeniAnahtar = `Acente${acente.acentePartaji}_${sayac}`;
    sayac += 1;
  }
  veri.kullaniciDegistir[yeniAnahtar] = {
    acentePartaji: acente.acentePartaji,
    acentePartajiSecenegi: acente.acentePartajiSecenegi,
    acenteKullanicisi: acente.acenteKullanicisi
  };
  return yeniAnahtar;
}

// ---- "✎ Düzenle" (JetSeyahat) yardımcıları ----

// "Senaryo Oluştur" formunun yönettiği alanlar (JET_SEYAHAT_FORM_ALANLARI) yan etkisiz
// ./jet-seyahat-alanlari.mjs modülündedir — koruma testleri (npm run test:birim) listeyi
// ekran modeliyle (tests/ekran-modelleri/jet-seyahat.model.json) oradan karşılaştırır.

// Kayıttaki beklenen sonuç alanlarını formun kullandığı biçime getirir. Kural (TS >
// beklenenSonucuCoz ile AYNI): odemeAdimiDahil HER senaryoda açıkça yazılmış olmalı
// (varsayılan yok); beklenenSonuc yoksa { tip: 'basarili' }. Eski beklenenHataMesaji/
// beklenenHataAdimi alanları artık desteklenmez (veri yeni modele çevrildi). Kayıt bu
// kurallara uymuyorsa forma SESSİZCE yanlış bir değerle açılmasın diye 422 hatası fırlatılır
// (kayıt jet-seyahat.json'da elle düzeltilmeli). Mesaj/adım içeriği burada doğrulanmaz
// (kaydederken tek doğrulayıcı — senaryo-dogrulayici.mjs — zaten kontrol eder).
function kayitliSenaryoHatasi(mesaj) {
  const hata = new Error(mesaj);
  hata.durumKodu = 422;
  return hata;
}
function eskiBeklenenSonucAlanlariniReddet(senaryo) {
  const eskiler = ESKI_BEKLENEN_SONUC_ALANLARI.filter((alan) => senaryo[alan] !== undefined);
  if (eskiler.length) {
    throw kayitliSenaryoHatasi(`"${senaryo.baslik}" senaryosu (jet-seyahat.json'da elle düzeltin): ${MESAJLAR.eskiBeklenenSonucAlanlari(eskiler)}`);
  }
}
function beklenenSonucuFormaCevir(senaryo) {
  eskiBeklenenSonucAlanlariniReddet(senaryo);
  if (typeof senaryo.odemeAdimiDahil !== 'boolean') {
    throw kayitliSenaryoHatasi(
      `"${senaryo.baslik}" senaryosu (jet-seyahat.json'da elle düzeltin): odemeAdimiDahil: ${MESAJLAR.booleanOlmali('Ödeme adımını dahil et')}`
    );
  }
  const beklenenSonuc = senaryo.beklenenSonuc && typeof senaryo.beklenenSonuc === 'object' && senaryo.beklenenSonuc.tip === 'isKuraliHatasi'
    ? { tip: 'isKuraliHatasi', adim: senaryo.beklenenSonuc.adim, mesaj: senaryo.beklenenSonuc.mesaj ?? '' }
    : { tip: 'basarili' };
  return { odemeAdimiDahil: senaryo.odemeAdimiDahil, beklenenSonuc };
}

// Kayıttaki senaryoyu "Senaryo Oluştur" formunun doldurulabileceği biçime getirir: beklenen
// sonuç alanları beklenenSonucuFormaCevir ile denetlenir (odemeAdimiDahil eksikse ya da eski
// alanlar varsa 422), acenteProfili anahtarı ortak.json'dan
// acente kodu + kullanıcı koduna çözülür (form bu ikisini metin olarak gösterir; kullanıcı
// değiştirmezse istemci yine acenteProfili anahtarını gönderir — bkz. dashboard).
function jetSeyahatSenaryosunuFormaCevir(senaryo, ortam) {
  const form = {};
  for (const alan of JET_SEYAHAT_FORM_ALANLARI) {
    if (senaryo[alan] !== undefined) form[alan] = senaryo[alan];
  }
  Object.assign(form, beklenenSonucuFormaCevir(senaryo));
  // Kayıtta acente yoksa test "varsayilan" profiliyle koşar (testBaslangiciniHazirla);
  // form da boş göstermek yerine GERÇEKTE kullanılan bu acenteyi gösterir.
  // acenteVarsayilanMi: istemci, alanlara dokunulmadıysa kayda acente yazmaz (senaryo
  // varsayılan profile bağlı kalır, varsayılan değişirse onu izler).
  const profilAnahtari = senaryo.acenteProfili || 'varsayilan';
  let profil;
  try {
    profil = ortakVerisiniOku(ortam).kullaniciDegistir?.[profilAnahtari];
  } catch {
    profil = undefined;
  }
  if (profil) {
    form.acenteKodu = profil.acentePartaji ?? '';
    form.acenteKullanicisi = profil.acenteKullanicisi ?? '';
    form.acenteAciklamasi = profil.acentePartajiSecenegi ?? profil.acentePartaji ?? '';
  }
  form.acenteVarsayilanMi = !senaryo.acenteProfili;
  return form;
}

// Başlığa göre JetSeyahat senaryosunu bulur; yoksa ya da aynı başlıkta birden fazla kayıt
// varsa (elle düzenlenmiş dosya) açıklayıcı bir hata fırlatır.
function jetSeyahatSenaryoIndexiBul(veri, baslik) {
  const senaryolar = veri?.jetSeyahat?.senaryolar;
  if (!Array.isArray(senaryolar)) throw new Error('jet-seyahat.json > jetSeyahat.senaryolar bulunamadı.');
  const indexler = [];
  senaryolar.forEach((s, i) => { if (s?.baslik === baslik) indexler.push(i); });
  if (indexler.length === 0) {
    const hata = new Error('Bu başlıkta bir JetSeyahat senaryosu bulunamadı — dosya değişmiş olabilir, dashboard\'u yenileyin.');
    hata.durumKodu = 404;
    throw hata;
  }
  if (indexler.length > 1) {
    const hata = new Error(`jet-seyahat.json'da bu başlıkta ${indexler.length} senaryo var; düzenlemeden önce dosyayı elle düzeltin.`);
    hata.durumKodu = 409;
    throw hata;
  }
  return indexler[0];
}

// ---- Tek senaryo çalıştırma çekirdeği ------------------------------------------------------
// /calistir (eski görünüm; başlık + dosya ile) ve platform "Senaryolar" (/platform/senaryolar/calistir;
// senaryo UUID'si sunucuda güncel başlık + dosyaya çözülür) AYNI yolu kullanır: --list beyaz listesi
// (istemcinin gönderdiği ada güvenilmez), dosya sırası, süre limiti, durdurma, canlı görüntü, platform
// raporlayıcısı. Dönen { httpDurum, govde }, /calistir yanıtının aynısıdır.
async function senaryoyuCalistirVeYanitla({ ortam, senaryoAdi, dosya, kosuId, kosuTuru, kosuKimligi, kosuKapsami, token, kapsamiDenetle }) {
  let tumSenaryolar;
  try {
    tumSenaryolar = await tumSenaryolariGetir(ortam);
  } catch (hata) {
    return { httpDurum: 500, govde: { basarili: false, mesaj: `Senaryo listesi alınamadı (npx playwright test --list başarısız oldu): ${hata.message}` } };
  }

  // Aynı başlık birden fazla ürün dosyasında bulunabildiği için senaryo (ad + dosya)
  // ikilisiyle eşleştirilir. Dosyasız eski isteklerde ad birden fazla dosyada varsa yanlış testi
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
  if (kapsamiDenetle && kosuKapsami !== 'Genel' && !tumSenaryolar.some((s) => s.urun === kosuKapsami)) {
    return { httpDurum: 400, govde: { basarili: false, mesaj: 'kosuKapsami "Genel" ya da projedeki bir ürün adı olmalıdır.' } };
  }

  // Bu istek, test TAMAMEN bitene kadar bekletilir — arayüz bu sürede satırı "çalışıyor" gösterir.
  const calistirmaSonucu = await testiCalistirVeBekle(
    ortam, senaryoAdi, eslesenSenaryo.dosya, tumSenaryolar, kosuId,
    kosuTuru && kosuKimligi
      ? { KOSU_KIMLIGI: kosuKimligi, TEST_SUNUCU_KOSU_TURU: kosuTuru, ...(kosuTuru === 'tam' ? { TEST_SUNUCU_KOSU_KAPSAMI: kosuKapsami || 'Genel' } : {}) }
      : {}
  );
  return calistirmaYaniti(calistirmaSonucu, token, 'Test');
}

// testiCalistirVeBekle sonucunu HTTP yanıtına çevirir (/calistir, /jetseyahat-senaryo/dene ve platform uçları).
function calistirmaYaniti(calistirmaSonucu, token, ad) {
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
      ...(calistirmaSonucu.sonuc.platform ? { ekranGoruntusuId: calistirmaSonucu.sonuc.ekranGoruntusuId ?? null, videoId: calistirmaSonucu.sonuc.videoId ?? null } : {}),
      ...panelMedyasi(calistirmaSonucu.sonuc, token)
    }
  };
}

// Platform "Senaryolar" ekranının koşucusu (bkz. scripts/platform/senaryolar/calistirma.mjs): senaryo
// UUID'si platformda güncel dosya + başlığa çözülmüş olarak gelir; burada yukarıdaki AYNI yol kullanılır.
// "Dene": taslak senaryo geçici bir ek veri dosyasıyla (TEST_SUNUCU_EK_SENARYO_DOSYASI; kalıcı veriye
// yazılmaz) spec dosyasına daraltılmış ayrı bir listelemeyle bulunur ve çalıştırılır; dosya sonra silinir.
platformKosucusunuAyarla({
  calistir: (istek) => senaryoyuCalistirVeYanitla({
    ortam: istek.ortam, senaryoAdi: istek.ad, dosya: istek.dosya, kosuId: istek.kosuId, kosuTuru: istek.kosuTuru ?? null,
    kosuKimligi: istek.kosuKimligi ?? null, kosuKapsami: istek.kosuKapsami ?? 'Genel', token: OTURUM_TOKEN, kapsamiDenetle: false
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
      return calistirmaYaniti(sonuc, OTURUM_TOKEN, 'Deneme');
    } finally {
      try {
        if (existsSync(ekDosyaYolu)) unlinkSync(ekDosyaYolu);
      } catch (temizlemeHatasi) {
        console.error('[platform/dene] Geçici ek veri dosyası silinemedi:', temizlemeHatasi.message);
      }
    }
  },
  kosuyorMu: (dosya, ad) => senaryoKosuyorMu(dosya, ad)
});

// Senaryo o an (kuyrukta bekleyerek ya da gerçekten) koşuyor mu? (bkz. aktifKosuAnahtarlari)
function senaryoKosuyorMu(dosya, ad) {
  const anahtar = kosuListesiAnahtari(dosya, ad);
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

  const izinliOrigin = corsBasliklariniUygula(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(izinliOrigin ? 204 : 403);
    res.end();
    return;
  }

  if (!izinliOrigin) {
    jsonGonder(res, 403, { basarili: false, mesaj: 'İzin verilmeyen origin.' });
    return;
  }

  // Platform arayüzü (kabuk + "Mevcut görünüm"): oturum token'ı sayfaya enjekte edilir.
  if (req.method === 'GET' && req.url && arayuzIsteginiIsle(req, res)) return;
  if (req.method === 'GET' && req.url && req.url.split('?')[0].startsWith('/gorunum/')) {
    await gorunumuSun(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/saglik') {
    jsonGonder(res, 200, { basarili: true, mesaj: 'Test sunucusu çalışıyor.' });
    return;
  }

  // Platform (yerel veritabanı, kasa, yedek) uç noktaları: /platform/* — ayrıntı ve token
  // kuralları scripts/platform/sunucu-platform.mjs içinde.
  if (req.url && req.url.startsWith('/platform/')) {
    await platformIsteginiIsle(req, res, { token: OTURUM_TOKEN, raporlayiciTokeni: TOKEN, jsonGonder });
    return;
  }

  if (req.method === 'POST' && req.url === '/calistir') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }

    const { ortam, senaryoAdi, dosya, token } = istek ?? {};
    // Dashboard'daki "Koşuyu başlat": tüm senaryolar aynı kosuKimligi ile ve 'tam'
    // koşu olarak etiketlenir ki rapor bunları tek bir tam koşu olarak gruplasın ve üst
    // kartları güncellesin. Kimlik yalnızca güvenli karakterlerden oluşabilir.
    // "Seçilenleri çalıştır" gibi birlikte başlatılan kısmi koşular da ortak bir kimlik
    // taşır (kosuTuru 'tekil'); rapor bunları koşu geçmişinde TEK bir tekil koşu olarak
    // gösterir, kartları etkilemez.
    const kosuTuru = istek?.kosuTuru === 'tam' || istek?.kosuTuru === 'tekil' ? istek.kosuTuru : null;
    const ortakKosuKimligi =
      kosuTuru && typeof istek?.kosuKimligi === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(istek.kosuKimligi)
        ? istek.kosuKimligi
        : null;
    // Koşu kapsamı (yalnızca 'tam' koşularda anlamlı): dashboard'da bir ürün seçiliyken
    // başlatılan "Koşuyu başlat" o ürünün adını, Genel görünümde 'Genel' gönderir.
    // fixtures.ts bunu "kosuKapsami" Allure etiketi olarak yazar; rapor ürün kartlarını ve
    // Genel trendini buna göre hesaplar. Değer aşağıda senaryo listesindeki ürün adlarıyla
    // doğrulanır.
    const kosuKapsami = kosuTuru === 'tam' && typeof istek?.kosuKapsami === 'string' ? istek.kosuKapsami : 'Genel';
    // kosuId: dashboard'un HER TEKİL koşu isteği için ürettiği benzersiz kimlik (bkz.
    // calisanSurecler üstündeki NOT). Eski/uyumsuz bir istemciden gelirse (kosuId yoksa)
    // sunucu kendi üretir — koşu yine çalışır, sadece o istek için "Durdur" başka bir
    // isteği yanlışlıkla hedefleyemesin diye biz de garanti bir kimlik atarız.
    const kosuId = typeof istek?.kosuId === 'string' && istek.kosuId.trim()
      ? istek.kosuId.trim()
      : randomBytes(8).toString('hex');

    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    if (typeof senaryoAdi !== 'string' || !senaryoAdi.trim()) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'senaryoAdi zorunludur.' });
      return;
    }

    const yanit = await senaryoyuCalistirVeYanitla({
      ortam, senaryoAdi, dosya: typeof dosya === 'string' && dosya ? dosya : null, kosuId, kosuTuru, kosuKimligi: ortakKosuKimligi,
      kosuKapsami, token, kapsamiDenetle: true
    });
    jsonGonder(res, yanit.httpDurum, yanit.govde);
    return;
  }

  // Dashboard'daki "Koşuyu başlat" bitince raporu (dashboard-<ortam>.html) yeniden
  // üretir; böylece üst kartlar yeni tam koşuyla güncellenir. Aynı anda tek üretim yapılır.
  if (req.method === 'POST' && req.url === '/rapor-uret') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }
    const { ortam, token } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    const sonuc = await raporuUret(ortam);
    console.log(sonuc.basarili ? `Dashboard yeniden üretildi (${ortam}).` : sonuc.mesaj);
    jsonGonder(res, sonuc.basarili ? 200 : 500, sonuc);
    return;
  }

  // Dashboard'daki "Koşuda" anahtarları ve "Koşuya ekle / Koşudan çıkar" düğmeleri:
  // tests/data/kosu-listesi.json'daki hariç listesini günceller (bkz. kosu-listesi.mjs).
  // Gövde: { token, anahtarlar: ["<dosya>::<ad>", ...], dahil: true|false }. Her anahtar
  // projede GERÇEKTEN var olan bir senaryoya karşılık gelmek zorundadır (whitelist —
  // hariç tutulanlar dahil tüm liste); tek bir geçersiz anahtar bile varsa dosyaya hiç
  // dokunulmaz. Yanıt: { basarili, haricTutulanlar } (yeni hariç listesi).
  if (req.method === 'POST' && req.url === '/kosu-listesi') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }
    const { token, anahtarlar, dahil } = istek ?? {};
    // Liste ortamdan bağımsızdır; whitelist için hangi ortamın senaryo listesinin
    // kullanılacağı isteğe bağlıdır (varsayılan: test — canlıya özel dosyalar yalnızca
    // canli listesinde görünür).
    const ortam = istek?.ortam === 'canli' ? 'canli' : 'test';
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (typeof dahil !== 'boolean') {
      jsonGonder(res, 400, { basarili: false, mesaj: '"dahil" true ya da false olmalıdır.' });
      return;
    }
    if (!Array.isArray(anahtarlar) || anahtarlar.length === 0 || anahtarlar.length > 5000 || anahtarlar.some((a) => typeof a !== 'string')) {
      jsonGonder(res, 400, { basarili: false, mesaj: '"anahtarlar" boş olmayan bir metin dizisi olmalıdır.' });
      return;
    }

    let tumSenaryolar;
    try {
      tumSenaryolar = await tumSenaryolariGetir(ortam);
    } catch (hata) {
      jsonGonder(res, 500, { basarili: false, mesaj: `Senaryo listesi alınamadı: ${hata.message}` });
      return;
    }
    const gecerliAnahtarlar = new Set(tumSenaryolar.map((s) => kosuListesiAnahtari(s.dosya, s.ad)));
    const normalAnahtarlar = anahtarlar.map((a) => {
      const i = a.indexOf('::');
      return i > 0 ? kosuListesiAnahtari(a.slice(0, i), a.slice(i + 2)) : null;
    });
    const gecersizler = anahtarlar.filter((a, i) => !normalAnahtarlar[i] || !gecerliAnahtarlar.has(normalAnahtarlar[i]));
    if (gecersizler.length) {
      jsonGonder(res, 400, {
        basarili: false,
        mesaj: `Projede bulunmayan senaryo anahtarı: ${gecersizler.slice(0, 3).map((a) => `"${a}"`).join(', ')}${gecersizler.length > 3 ? ` (+${gecersizler.length - 3})` : ''}`
      });
      return;
    }

    try {
      const haricTutulanlar = kosuListesiniGuncelle(normalAnahtarlar, dahil);
      console.log(`[test-sunucu] Koşu listesi güncellendi: ${normalAnahtarlar.length} senaryo ${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'} (hariç: ${haricTutulanlar.length}).`);
      projeDosyalariniEsitle('Koşu listesi değişti');
      jsonGonder(res, 200, { basarili: true, haricTutulanlar });
    } catch (hata) {
      jsonGonder(res, 500, { basarili: false, mesaj: `Koşu listesi yazılamadı: ${hata.message}` });
    }
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

  // Dashboard'daki <video> etiketinin doğrudan işaret ettiği uç nokta — koşu videosunu
  // (onlarca MB olabileceğinden JSON/base64'e gömmek yerine) diskten akıtır. Token
  // query string'de taşınır (<video src="...">'nın özel header eklemesi mümkün değil) —
  // bu sunucu zaten sadece 127.0.0.1'e bağlı ve Origin:null dışında her isteği
  // reddediyor, bu yüzden kabul edilebilir bir gevşetme. "yol" MUTLAKA test-results/
  // klasörünün İÇİNDE çözümlenmek zorunda (path traversal koruması) — aksi halde
  // sunucu, bu makinedeki HERHANGİ bir dosyayı okuyabilecek bir "dosya sun" ucu olurdu.
  if (req.method === 'GET' && req.url && req.url.startsWith('/medya')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const token = url.searchParams.get('token');
    const yol = url.searchParams.get('yol');

    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (!yol) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'yol zorunludur.' });
      return;
    }

    // NOT: Önceki kontrol "startsWith(test-results)" idi — ayraç kontrolü olmadığından
    // "test-results-baska/..." gibi KARDEŞ klasörleri de geçiriyordu ve sembolik bağlar
    // (symlink) ile klasör dışına çıkılabiliyordu. Artık hem kök hem hedef realpath ile
    // gerçek yollarına çözülür ve path.relative ile hedefin kökün GERÇEKTEN İÇİNDE olduğu
    // doğrulanır. Ayrıca yalnızca normal DOSYALAR sunulur (klasör → EISDIR çökmesi).
    let cozulmusYol;
    let dosyaBilgisi;
    try {
      const testSonuclariKoku = realpathSync(resolvePath(projeKoku, 'test-results'));
      cozulmusYol = realpathSync(resolvePath(yol));
      const goreli = relative(testSonuclariKoku, cozulmusYol);
      const kokunIcindeMi = goreli !== '' && goreli !== '..' && !goreli.startsWith('..' + sep) && !isAbsolute(goreli);
      // statSync de try içinde: dosya kontrolle okuma arasında silinirse (ENOENT) çökmesin.
      dosyaBilgisi = kokunIcindeMi ? statSync(cozulmusYol) : null;
    } catch {
      dosyaBilgisi = null;
    }
    if (!dosyaBilgisi || !dosyaBilgisi.isFile()) {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Dosya bulunamadı.' });
      return;
    }

    const uzanti = extname(cozulmusYol).toLowerCase();
    const icerikTuru =
      uzanti === '.webm' ? 'video/webm' :
      uzanti === '.mp4' ? 'video/mp4' :
      uzanti === '.png' ? 'image/png' :
      'application/octet-stream';

    const boyut = dosyaBilgisi.size;
    const aralik = byteAraligiCoz(req.headers.range, boyut);
    if (aralik === null) {
      // Karşılanamayan aralık (ör. dosya boyutunun ötesi, boş dosya) — RFC 9110'a göre 416.
      res.writeHead(416, { 'Content-Range': `bytes */${boyut}`, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ basarili: false, mesaj: 'İstenen bayt aralığı karşılanamıyor.' }));
      return;
    }

    const basliklar = aralik
      ? {
          'Content-Type': icerikTuru,
          'Content-Length': aralik.bitis - aralik.baslangic + 1,
          'Content-Range': `bytes ${aralik.baslangic}-${aralik.bitis}/${boyut}`,
          'Accept-Ranges': 'bytes'
        }
      : { 'Content-Type': icerikTuru, 'Content-Length': boyut, 'Accept-Ranges': 'bytes' };
    const akis = createReadStream(cozulmusYol, aralik ? { start: aralik.baslangic, end: aralik.bitis } : {});
    // Başlıklar ancak dosya GERÇEKTEN açılınca gönderilir; açılamazsa (arada silindi vb.)
    // hâlâ düzgün bir JSON hata yanıtı dönülebilir. Akış hatası HER ZAMAN dinlenir —
    // dinleyicisiz bir 'error' olayı tüm sunucu sürecini çökertir.
    akis.on('open', () => {
      res.writeHead(aralik ? 206 : 200, basliklar);
      akis.pipe(res);
    });
    akis.on('error', (hata) => {
      console.error(`[test-sunucu] /medya okunamadı (${cozulmusYol}): ${hata.message}`);
      if (!res.headersSent) jsonGonder(res, 500, { basarili: false, mesaj: 'Dosya okunamadı.' });
      else res.destroy(hata);
    });
    // İstemci (video oynatıcı) bağlantıyı erken kapatırsa dosya tanıtıcısı açık kalmasın.
    res.on('close', () => akis.destroy());
    return;
  }

  // Dashboard'daki "canlı koşu paneli", bir satıra tıklandığında bu ucu saniyede bir
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

  if (req.method === 'POST' && req.url === '/jetseyahat-senaryo/dene') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }

    const { ortam, senaryo, token } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }

    const geciciBaslik = SENARYO_OLUSTUR_GECICI_ON_EK + randomBytes(4).toString('hex');
    // Geçici ek senaryo dosyası (bkz. "Senaryo Oluştur" bölümündeki açıklama) — kalıcı
    // jet-seyahat.json / ortak.json'a HİÇ yazılmaz.
    const ekDosyaYolu = join(tmpdir(), `${EK_SENARYO_DOSYA_ON_EKI}${Date.now()}-${randomBytes(6).toString('hex')}.json`);
    try {
      const { senaryo: yeniSenaryo, yeniAcenteProfilleri } = jetSeyahatSenaryoNesnesiOlustur(geciciBaslik, senaryo, ortam);
      writeFileSync(
        ekDosyaYolu,
        JSON.stringify({ ortam, jetSeyahatSenaryolari: [yeniSenaryo], kullaniciDegistir: yeniAcenteProfilleri }, null, 2),
        'utf-8'
      );
      const ekOrtamDegiskenleri = { [EK_SENARYO_ORTAM_DEGISKENI]: ekDosyaYolu };

      // NOT: Paylaşılan tumSenaryolariGetir önbelleği BİLEREK kullanılmaz — o liste ek
      // senaryo dosyasını görmeyen (ve bu istekten ÖNCE başlamış olabilecek) bir "--list"
      // sürecinin sonucudur; ayrıca geçici senaryo o önbelleğe sızarsa normal /calistir
      // whitelist'ini kirletirdi. Bu yüzden aynı ortam değişkeniyle, JetSeyahat dosyasına
      // daraltılmış AYRI bir listeleme yapılır.
      const tumSenaryolar = await senaryolariListele(ortam, [JET_SEYAHAT_SENARYO_FILTRESI], undefined, ekOrtamDegiskenleri);
      const eslesenSenaryo = tumSenaryolar.find((s) => s.ad === geciciBaslik);
      if (!eslesenSenaryo) {
        throw new Error('Geçici senaryo, senaryo listesinde bulunamadı (ek senaryo dosyası Playwright tarafından görülemedi).');
      }

      const kosuId = randomBytes(8).toString('hex');
      const calistirmaSonucu = await testiCalistirVeBekle(
        ortam,
        geciciBaslik,
        eslesenSenaryo.dosya,
        tumSenaryolar,
        kosuId,
        ekOrtamDegiskenleri
      );

      if (!calistirmaSonucu.calistiMi) {
        jsonGonder(res, 500, { basarili: false, mesaj: calistirmaSonucu.mesaj });
        return;
      }
      if (calistirmaSonucu.iptalEdildiMi) {
        jsonGonder(res, 200, { basarili: true, durum: 'iptal', mesaj: 'Deneme, kullanıcı tarafından durduruldu.' });
        return;
      }
      if (!calistirmaSonucu.sonuc) {
        jsonGonder(res, 200, {
          basarili: true,
          durum: calistirmaSonucu.cikisKodu === 0 ? 'passed' : 'failed',
          mesaj: `Deneme tamamlandı ama detaylı sonuç okunamadı (çıkış kodu: ${calistirmaSonucu.cikisKodu}).`,
          hataMesaji: calistirmaSonucu.ciktiHataOzeti || null
        });
        return;
      }
      jsonGonder(res, 200, {
        basarili: true,
        durum: calistirmaSonucu.sonuc.durum,
        sureMs: calistirmaSonucu.sonuc.sureMs,
        hataMesaji: calistirmaSonucu.sonuc.hataMesaji,
        basarisizAdim: calistirmaSonucu.sonuc.basarisizAdim,
        ...panelMedyasi(calistirmaSonucu.sonuc, token)
      });
    } catch (hata) {
      jsonGonder(res, 400, hataGovdesi(hata));
    } finally {
      // Deneme sonucu ne olursa olsun geçici ek senaryo dosyası silinir. Kalıcı veri
      // dosyalarına zaten hiç dokunulmadığı için temizlenecek başka bir şey yok.
      try {
        if (existsSync(ekDosyaYolu)) unlinkSync(ekDosyaYolu);
      } catch (temizlemeHatasi) {
        console.error('[jetseyahat-senaryo/dene] Geçici ek senaryo dosyası silinemedi:', temizlemeHatasi.message);
      }
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/jetseyahat-senaryo/kaydet') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }

    const { ortam, senaryo, baslik, token, kosuyaDahil } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    if (typeof baslik !== 'string' || !baslik.trim()) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Senaryo başlığı zorunludur.' });
      return;
    }
    // Kullanıcıya her kayıtta AÇIKÇA sorulur ("Bu senaryo koşuya dahil edilsin mi?") —
    // varsayılan yok; cevapsız (eski/uyumsuz istemci) istek reddedilir.
    if (typeof kosuyaDahil !== 'boolean') {
      jsonGonder(res, 400, { basarili: false, mesaj: '"kosuyaDahil" true ya da false olmalıdır (senaryonun koşuya dahil edilip edilmeyeceği).' });
      return;
    }

    try {
      const veri = jetSeyahatVerisiniOku(ortam);
      const temizBaslik = baslik.trim();
      if (veri.jetSeyahat.senaryolar.some((s) => s.baslik === temizBaslik)) {
        jsonGonder(res, 409, { basarili: false, mesaj: 'Bu başlıkta bir senaryo zaten var, başka bir başlık seçin.' });
        return;
      }
      if (temizBaslik.startsWith(SENARYO_OLUSTUR_GECICI_ON_EK.trim())) {
        jsonGonder(res, 400, { basarili: false, mesaj: 'Bu başlık önekine izin verilmiyor (geçici deneme senaryolarına ayrılmıştır).' });
        return;
      }
      const { senaryo: yeniSenaryo, yeniAcenteProfilleri, uyarilar } = jetSeyahatSenaryoNesnesiOlustur(temizBaslik, senaryo, ortam);
      // Yalnızca "kaydet" kalıcı dosyalara yazar (ikisi de atomik). Önce acente profili
      // yazılır ki senaryo, ortak.json'da olmayan bir profile hiçbir an işaret etmesin.
      if (Object.keys(yeniAcenteProfilleri).length) {
        const ortakVeri = ortakVerisiniOku(ortam);
        for (const [anahtar, profil] of Object.entries(yeniAcenteProfilleri)) {
          if (!ortakVeri.kullaniciDegistir[anahtar]) ortakVeri.kullaniciDegistir[anahtar] = profil;
        }
        ortakVerisiniYaz(ortam, ortakVeri);
      }
      // Koşuya dahil EDİLMEYECEKSE anahtar, senaryo yazılmadan ÖNCE hariç listesine eklenir:
      // arada bir sorun olursa en kötü ihtimalle var olmayan bir senaryonun anahtarı listede
      // kalır (zararsız), kullanıcının "dahil etme" dediği senaryo hiçbir an koşuya girmez.
      // Senaryo yazımı başarısız olursa eklenen anahtar geri alınır.
      const kosuAnahtari = kosuListesiAnahtari(JET_SEYAHAT_SPEC_DOSYASI, temizBaslik);
      // (Aynı başlıkta eski bir hariç kaydı kalmışsa ve kullanıcı "dahil et" dediyse o kayıt silinir.)
      const oncedenHaricMi = haricTutulanlariOku().includes(kosuAnahtari);
      const listeDegisecekMi = oncedenHaricMi === kosuyaDahil;
      if (listeDegisecekMi) kosuListesiniGuncelle([kosuAnahtari], kosuyaDahil);
      veri.jetSeyahat.senaryolar.push(yeniSenaryo);
      try {
        jetSeyahatVerisiniYaz(ortam, veri);
      } catch (yazmaHatasi) {
        try {
          if (listeDegisecekMi) kosuListesiniGuncelle([kosuAnahtari], !kosuyaDahil);
        } catch {
          // geri alma başarısız — asıl hata aşağıda kullanıcıya dönülüyor
        }
        throw yazmaHatasi;
      }
      projeDosyalariniEsitle('JetSeyahat senaryosu kaydedildi');
      jsonGonder(res, 200, {
        basarili: true,
        mesaj: kosuyaDahil ? 'Senaryo kaydedildi ve koşuya dahil edildi.' : 'Senaryo kaydedildi; koşuya dahil edilmedi.',
        kosuAnahtari,
        kosuyaDahil,
        uyarilar
      });
    } catch (hata) {
      jsonGonder(res, 400, hataGovdesi(hata));
    }
    return;
  }

  // "✎ Düzenle" (JetSeyahat): senaryonun jet-seyahat.json'daki GÜNCEL kaydını döner (dashboard
  // statik bir anlık görüntü olduğundan form her açılışta sunucudan beslenir).
  // Gövde: { token, ortam, baslik }. Yanıt: { basarili, senaryo (ham kayıt), formVerisi
  // (beklenen sonuç alanları denetlenmiş, acente kodu çözülmüş), kosuyaDahil, kosuyor }.
  // Kayıtta odemeAdimiDahil eksikse ya da eski beklenenHata* alanları varsa 422 döner.
  if (req.method === 'POST' && req.url === '/senaryo-getir') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }
    const { token, ortam, baslik } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    if (typeof baslik !== 'string' || !baslik) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Senaryo başlığı zorunludur.' });
      return;
    }
    try {
      const veri = jetSeyahatVerisiniOku(ortam);
      const senaryo = veri.jetSeyahat.senaryolar[jetSeyahatSenaryoIndexiBul(veri, baslik)];
      const kosuAnahtari = kosuListesiAnahtari(JET_SEYAHAT_SPEC_DOSYASI, baslik);
      jsonGonder(res, 200, {
        basarili: true,
        senaryo,
        formVerisi: jetSeyahatSenaryosunuFormaCevir(senaryo, ortam),
        kosuyaDahil: !haricTutulanlariOku().includes(kosuAnahtari),
        kosuyor: senaryoKosuyorMu(JET_SEYAHAT_SPEC_DOSYASI, baslik)
      });
    } catch (hata) {
      jsonGonder(res, hata.durumKodu || 500, { basarili: false, mesaj: hata.message });
    }
    return;
  }

  // "✎ Düzenle" > "Değişiklikleri Kaydet" (JetSeyahat). Gövde: { token, ortam, eskiBaslik,
  // senaryo (form alanları + YENİ başlık senaryo.baslik'ta), kosuyaDahil }.
  //  - Doğrulama /kaydet ile aynı (jetSeyahatSenaryoNesnesiOlustur > senaryo-dogrulayici.mjs); geçersizse 400 + hatalar.
  //  - Yeni başlık dosyada (bu kayıt hariç) benzersiz olmalı.
  //  - Kayıt dizideki YERİNDE güncellenir; diğer kayıtlara ve sıraya dokunulmaz. Formun
  //    yönetmediği ek alanlar korunur. Kayıtta eski beklenenHataMesaji/beklenenHataAdimi
  //    varsa (elle eklenmiş) 422 döner — /senaryo-getir de aynı kaydı forma açmaz.
  //  - Yeni bir acente profili gerekiyorsa /kaydet gibi önce ortak.json'a yazılır.
  //  - kosu-listesi.json: başlık değiştiyse eski anahtar düşürülür, ardından yeni anahtar
  //    kosuyaDahil'e göre dahil/hariç yapılır (değişiklik yoksa dosyaya dokunulmaz).
  //  - Senaryo o an koşuyorsa (kuyrukta dahil) reddedilir.
  if (req.method === 'POST' && req.url === '/senaryo-guncelle') {
    let istek;
    try {
      istek = JSON.parse(await govdeOku(req));
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
      return;
    }
    const { token, ortam, eskiBaslik, senaryo, kosuyaDahil } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    if (typeof eskiBaslik !== 'string' || !eskiBaslik) {
      jsonGonder(res, 400, { basarili: false, mesaj: '"eskiBaslik" (düzenlenen senaryonun mevcut başlığı) zorunludur.' });
      return;
    }
    if (!senaryo || typeof senaryo !== 'object' || typeof senaryo.baslik !== 'string' || !senaryo.baslik.trim()) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Senaryo başlığı zorunludur.' });
      return;
    }
    if (typeof kosuyaDahil !== 'boolean') {
      jsonGonder(res, 400, { basarili: false, mesaj: '"kosuyaDahil" true ya da false olmalıdır (senaryonun koşuya dahil edilip edilmeyeceği).' });
      return;
    }
    if (senaryoKosuyorMu(JET_SEYAHAT_SPEC_DOSYASI, eskiBaslik)) {
      jsonGonder(res, 409, { basarili: false, mesaj: 'Bu senaryo şu an koşuyor (ya da koşu sırasında bekliyor). Koşu bitince ya da durdurulunca tekrar kaydedin.' });
      return;
    }

    try {
      const veri = jetSeyahatVerisiniOku(ortam);
      const index = jetSeyahatSenaryoIndexiBul(veri, eskiBaslik);
      const yeniBaslik = senaryo.baslik.trim();
      if (yeniBaslik.startsWith(SENARYO_OLUSTUR_GECICI_ON_EK.trim())) {
        jsonGonder(res, 400, { basarili: false, mesaj: 'Bu başlık önekine izin verilmiyor (geçici deneme senaryolarına ayrılmıştır).' });
        return;
      }
      if (veri.jetSeyahat.senaryolar.some((s, i) => i !== index && s?.baslik === yeniBaslik)) {
        jsonGonder(res, 400, { basarili: false, mesaj: 'Bu başlıkta başka bir senaryo zaten var, başka bir başlık seçin.' });
        return;
      }
      // Doğrulama + temiz nesne (hiçbir dosyaya yazmaz); hata varsa aşağıdaki catch 400 döner.
      const { senaryo: yeniAlanlar, yeniAcenteProfilleri, uyarilar } = jetSeyahatSenaryoNesnesiOlustur(yeniBaslik, senaryo, ortam);

      const eskiKayit = veri.jetSeyahat.senaryolar[index];
      eskiBeklenenSonucAlanlariniReddet(eskiKayit);
      const korunanEkAlanlar = Object.fromEntries(
        Object.entries(eskiKayit).filter(([alan]) => !JET_SEYAHAT_FORM_ALANLARI.includes(alan))
      );
      const guncelKayit = { ...yeniAlanlar, ...korunanEkAlanlar };
      veri.jetSeyahat.senaryolar[index] = guncelKayit;

      // 1) Yeni acente profili (varsa) — /kaydet ile aynı sıra: senaryo, ortak.json'da
      //    olmayan bir profile hiçbir an işaret etmesin.
      if (Object.keys(yeniAcenteProfilleri).length) {
        const ortakVeri = ortakVerisiniOku(ortam);
        for (const [anahtar, profil] of Object.entries(yeniAcenteProfilleri)) {
          if (!ortakVeri.kullaniciDegistir[anahtar]) ortakVeri.kullaniciDegistir[anahtar] = profil;
        }
        ortakVerisiniYaz(ortam, ortakVeri);
      }

      // 2) Koşu listesi — senaryo yazımı başarısız olursa önceki listeye geri dönülür.
      const eskiAnahtar = kosuListesiAnahtari(JET_SEYAHAT_SPEC_DOSYASI, eskiBaslik);
      const yeniAnahtar = kosuListesiAnahtari(JET_SEYAHAT_SPEC_DOSYASI, yeniBaslik);
      const oncekiHaricler = haricTutulanlariOku();
      const yeniHaricler = new Set(oncekiHaricler);
      if (eskiAnahtar !== yeniAnahtar) yeniHaricler.delete(eskiAnahtar);
      if (kosuyaDahil) yeniHaricler.delete(yeniAnahtar);
      else yeniHaricler.add(yeniAnahtar);
      const listeDegisecekMi =
        yeniHaricler.size !== oncekiHaricler.length || oncekiHaricler.some((a) => !yeniHaricler.has(a));
      if (listeDegisecekMi) haricTutulanlariYaz([...yeniHaricler]);

      // 3) Senaryo (atomik).
      try {
        jetSeyahatVerisiniYaz(ortam, veri);
      } catch (yazmaHatasi) {
        try {
          if (listeDegisecekMi) haricTutulanlariYaz(oncekiHaricler);
        } catch {
          // geri alma başarısız — asıl hata aşağıda kullanıcıya dönülüyor
        }
        throw yazmaHatasi;
      }

      const baslikDegistiMi = eskiBaslik !== yeniBaslik;
      console.log(
        `[test-sunucu] JetSeyahat senaryosu güncellendi (${ortam}): "${eskiBaslik}"` +
          (baslikDegistiMi ? ` → "${yeniBaslik}"` : '') + ` (koşuya ${kosuyaDahil ? 'dahil' : 'dahil değil'}).`
      );
      projeDosyalariniEsitle('JetSeyahat senaryosu güncellendi');
      jsonGonder(res, 200, {
        basarili: true,
        mesaj: 'Değişiklikler kaydedildi.',
        senaryo: guncelKayit,
        kosuAnahtari: yeniAnahtar,
        kosuyaDahil,
        baslikDegistiMi,
        uyarilar
      });
    } catch (hata) {
      jsonGonder(res, hata.durumKodu || 400, hataGovdesi(hata));
    }
    return;
  }

  // "Senaryo Oluştur" popup'ında "Çoklu" sorgu tipi seçilip bir Excel dosyası
  // yüklendiğinde çağrılır. Dosya base64 olarak gelir (multipart yok — tek dosya,
  // küçük boyut), tests/fixtures/jet-seyahat/yuklenen/ altına BENZERSİZ bir adla
  // yazılır ve o an henüz kaydedilmemiş bir senaryo için proje köküne göre GÖRECELİ
  // yolu döner; bu yol popup'ta "Senaryoyu Koş"/"Kaydet" ile birlikte
  // jetSeyahatSenaryoNesnesiOlustur'a geçirilir (senaryo.cokluSorguDosyasi).
  if (req.method === 'POST' && req.url === '/jetseyahat-coklu-sorgu-yukle') {
    let istek;
    try {
      // Base64 içeriği ~%33 şişirdiğinden ve xlsx dosyaları büyüyebildiğinden 1MB'lık
      // genel gövde sınırı yerine daha geniş bir sınır kullanılır.
      istek = JSON.parse(await govdeOku(req, 15_000_000));
    } catch (hata) {
      jsonGonder(res, 400, { basarili: false, mesaj: hata.message || 'Geçersiz istek gövdesi.' });
      return;
    }

    const { ortam, token, dosyaAdi, veriBase64 } = istek ?? {};
    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }
    if (typeof dosyaAdi !== 'string' || !dosyaAdi.trim()) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Dosya adı zorunludur.' });
      return;
    }
    if (!/\.xlsx$/i.test(dosyaAdi.trim())) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Yalnızca .xlsx dosyaları yüklenebilir.' });
      return;
    }
    if (typeof veriBase64 !== 'string' || !veriBase64) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Dosya içeriği boş olamaz.' });
      return;
    }

    try {
      const arabellek = Buffer.from(veriBase64, 'base64');
      if (arabellek.length === 0) {
        throw new Error('Dosya içeriği okunamadı.');
      }
      // Orijinal ad sadece bilgi amaçlı görünür kısımda kullanılır; diske yazarken
      // yol/karakter enjeksiyonuna karşı isim tamamen sanitize edilip önüne
      // zaman damgalı benzersiz bir önek eklenir.
      const guvenliAd = dosyaAdi.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const benzersizAd = `${Date.now()}-${randomBytes(4).toString('hex')}-${guvenliAd}`;
      const klasor = join(projeKoku, 'tests', 'fixtures', 'jet-seyahat', 'yuklenen');
      mkdirSync(klasor, { recursive: true });
      writeFileSync(join(klasor, benzersizAd), arabellek);

      const goreliYol = ['tests', 'fixtures', 'jet-seyahat', 'yuklenen', benzersizAd].join('/');
      jsonGonder(res, 200, { basarili: true, dosyaYolu: goreliYol, dosyaAdi: benzersizAd });
    } catch (hata) {
      jsonGonder(res, 400, { basarili: false, mesaj: hata.message });
    }
    return;
  }

  // "Senaryo Oluştur" popup'ının hazır profil dropdown'larını (ettiren/sigortalı) ve
  // "Çoklu" sorgu tipinde kullanılacak sabit Excel bilgisini döner (bkz.
  // jetSeyahatYardimciVeriGetir) — sadece yerel JSON dosyaları okunur, canlı tarayıcı
  // gerekmez.
  if (req.method === 'GET' && req.url && req.url.startsWith('/jetseyahat-yardimci-veri')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const token = url.searchParams.get('token');
    const ortam = url.searchParams.get('ortam');

    if (!tokenGecerli(token)) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }

    try {
      const veri = jetSeyahatYardimciVeriGetir(ortam);
      jsonGonder(res, 200, { basarili: true, ...veri });
    } catch (hata) {
      jsonGonder(res, 500, { basarili: false, mesaj: hata.message });
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

// Bu dosya urun-hata-raporu.mjs tarafından sadece TOKEN/PORT/tumSenaryolariGetir
// değerlerini almak için de import edilebiliyor (dashboard üretilirken). Sunucuyu
// SADECE doğrudan "node scripts/test-sunucu.mjs" ile çalıştırıldığında ayağa
// kaldırıyoruz; aksi halde rapor üretimi sırasında istenmeden ikinci bir sunucu
// başlatılmış olur.
const dogrudanCalistirildi = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

// Önceki bir sürümde "dene" geçici senaryoyu doğrudan jet-seyahat.json'a yazıyordu ve
// sunucu arada kapanınca kayıt dosyada kalmıştı. Açılışta tests/data/*/jet-seyahat.json
// içinde böyle artık kayıt varsa (atomik yazmayla) temizlenir ve loglanır. Ayrıca geçici
// klasörde kalmış eski ek senaryo dosyaları da (başka bir sunucu örneğinin o an kullanıyor
// olabileceği yenileri hariç) silinir.
function artikGeciciSenaryolariTemizle() {
  const veriKoku = join(projeKoku, 'tests', 'data');
  let ortamlar = [];
  try {
    ortamlar = readdirSync(veriKoku, { withFileTypes: true }).filter((g) => g.isDirectory()).map((g) => g.name);
  } catch (hata) {
    console.error(`[test-sunucu] ${veriKoku} okunamadı: ${hata.message}`);
  }
  for (const ortam of ortamlar) {
    const yol = join(veriKoku, ortam, 'jet-seyahat.json');
    try {
      if (!existsSync(yol)) continue;
      const veri = JSON.parse(readFileSync(yol, 'utf-8'));
      const senaryolar = veri?.jetSeyahat?.senaryolar;
      if (!Array.isArray(senaryolar)) continue;
      const artiklar = senaryolar.filter((s) => typeof s?.baslik === 'string' && s.baslik.startsWith(SENARYO_OLUSTUR_GECICI_ON_EK));
      if (!artiklar.length) continue;
      veri.jetSeyahat.senaryolar = senaryolar.filter((s) => !artiklar.includes(s));
      atomikYaz(yol, JSON.stringify(veri, null, 2) + '\n');
      console.log(
        `[test-sunucu] ${ortam}/jet-seyahat.json içinden ${artiklar.length} artık geçici senaryo silindi: ` +
          artiklar.map((s) => `"${s.baslik}"`).join(', ')
      );
    } catch (hata) {
      console.error(`[test-sunucu] ${yol} artık geçici senaryo temizliği başarısız: ${hata.message}`);
    }
  }

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
  // sessizce öldürmesin — loglanır, süreç ÇIKMAZ. (Yalnızca doğrudan çalıştırıldığında;
  // rapor betiği bu dosyayı import ettiğinde onun hata davranışına karışmıyoruz.)
  process.on('unhandledRejection', (neden) => {
    console.error(`[test-sunucu] İşlenmemiş promise reddi (sunucu çalışmaya devam ediyor): ${neden?.stack ?? neden}`);
  });
  process.on('uncaughtException', (hata) => {
    console.error(`[test-sunucu] Yakalanmamış hata (sunucu çalışmaya devam ediyor): ${hata?.stack ?? hata}`);
  });

  artikGeciciSenaryolariTemizle();

  // Video saklama kuralı (VIDEO_SAKLAMA_GUN, varsayılan 30 gün): açılışta ve sunucu uzun
  // süre açık kalabildiği için günde bir kez, eski test-results/dashboard-kosulari/<koşu>
  // klasörleri (platform öncesi düz metin koşu çıktıları) silinir (bkz. medya-temizligi.mjs).
  // Eski allure-results-<ortam>/ klasörlerine ARTIK DOKUNULMAZ (kullanıcı kararı bekleniyor).
  const videoTemizliginiCalistir = () => {
    try {
      eskiVideolariTemizle(projeKoku, '[test-sunucu]');
    } catch (hata) {
      console.error(`[test-sunucu] Video temizliği başarısız: ${hata.message}`);
    }
  };
  videoTemizliginiCalistir();
  setInterval(videoTemizliginiCalistir, 24 * 60 * 60 * 1000).unref();
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
    console.log(`Test tetikleme sunucusu hazır: http://127.0.0.1:${PORT} (yalnızca bu bilgisayardan erişilebilir)`);
    console.log(`Platform arayüzü: http://127.0.0.1:${PORT}/`);
    console.log('Dashboard\'daki ▷ Çalıştır ikonları bu pencere açık kaldığı sürece çalışır. Kapatmak için Ctrl+C.');
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
    sunucu.close();
    setTimeout(() => process.exit(sinyal === 'SIGINT' ? 130 : 0), 300).unref();
  };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
  process.on('SIGHUP', () => kapat('SIGHUP'));
}
