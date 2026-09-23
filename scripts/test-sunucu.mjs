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
//    "Origin: null" değerine izin verir; başka hiçbir origin'e izin verilmez.
// 3) Her istek, dashboard üretilirken oluşturulan ve yalnızca bu makinede
//    (scripts/.test-sunucu-token dosyasında) duran bir token taşımak zorundadır.
//    Token'ı bilmeyen bir sayfa (ör. başka bir sekmede açık kötü niyetli bir site)
//    isteği kabul ettiremez.
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
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, createReadStream, appendFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath, extname } from 'node:path';
import { tmpdir } from 'node:os';

const buDosyaninKlasoru = dirname(fileURLToPath(import.meta.url));
const projeKoku = join(buDosyaninKlasoru, '..');
const tokenDosyasi = join(buDosyaninKlasoru, '.test-sunucu-token');
const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;

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
  login: 'Giriş',
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

// Bir koşu videosunun disk yolunu, dashboard'un doğrudan <video src="..."> olarak
// kullanabileceği bir /medya URL'sine çevirir (bkz. aşağıdaki /medya route'u).
function medyaUrlOlustur(dosyaYolu) {
  if (!dosyaYolu) return null;
  return `http://127.0.0.1:${PORT}/medya?token=${encodeURIComponent(TOKEN)}&yol=${encodeURIComponent(dosyaYolu)}`;
}

// Sadece file:// olarak açılan dashboard'un gönderdiği "Origin: null" kabul edilir.
// Başka bir origin (http://başka-bir-site vb.) her zaman reddedilir.
function corsBasliklariniUygula(req, res) {
  const origin = req.headers.origin;
  if (origin === 'null' || origin === undefined) {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
  }
  return false;
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
function senaryolariListele(ortam, ekstraArgumanlar = [], grepDeseni = undefined) {
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
        env: { ...process.env, TEST_ENV: ortam, ...(grepDeseni ? { TEST_SUNUCU_GREP_DESENI: grepDeseni } : {}) },
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
                liste.push({ ad: spec.title, urun: urunAdiBul(specDosya), dosya: specDosya, satir: spec.line });
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
        let ekranGoruntusuBase64 = null;
        if (ekranGoruntusuEki?.path && existsSync(ekranGoruntusuEki.path)) {
          try {
            ekranGoruntusuBase64 = readFileSync(ekranGoruntusuEki.path).toString('base64');
          } catch (okumaHatasi) {
            console.error(`Ekran görüntüsü okunamadı: ${okumaHatasi.message}`);
          }
        }

        // Video, playwright.config.ts'teki "video: TEST_SUNUCU_GORUNUR ? 'on' : ..."
        // ayarı sayesinde her dashboard koşusunda otomatik kaydedilir ve Playwright
        // TARAFINDAN "video" adıyla otomatik attach edilir (bizim testInfo.attach()
        // çağırmamıza gerek yok). Videolar onlarca MB olabileceğinden base64/JSON'a
        // gömmüyoruz — sadece dosya yolunu tutuyoruz, /medya endpoint'i (aşağıda)
        // bunu doğrudan bir <video src="..."> olarak akıtıyor.
        const videoEki = (sonDeneme.attachments ?? []).find((ek) => ek?.name === 'video');
        const videoYolu = videoEki?.path && existsSync(videoEki.path) ? videoEki.path : null;

        bulunan = {
          durum: sonDeneme.status,
          sureMs: sonDeneme.duration,
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

// Dashboard'daki "Durdur" ikonu tarafından çağrılır. Süreç zaten çalışıyorsa
// öldürür; henüz kuyrukta bekliyorsa (bkz. yukarıdaki NOT) sırası geldiğinde hiç
// başlamayacak şekilde işaretler. Her iki durumda da true döner (istek işleme
// alındı); yalnızca koşu GERÇEKTEN ne çalışıyor ne kuyrukta değilse (zaten
// bitmiş/hiç var olmamış) false döner — ama bu durumda bile işaretlemek zararsız
// olduğundan, emin olunamayan her durumda true dönüp isteği kaydediyoruz.
function calismaDurdur(kosuId) {
  const kayit = calisanSurecler.get(kosuId);
  if (kayit) {
    kayit.iptalEdiliyor = true;
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(kayit.pid), '/T', '/F'], () => {
        // Süreç zaten kapanmış olabilir (yarış durumu) — hatayı yok sayıyoruz,
        // asıl sonuç zaten alt.on('close') üzerinden gelecek.
      });
    } else {
      try {
        kayit.surec.kill('SIGTERM');
      } catch {
        // yok sayılır
      }
    }
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

async function testiCalistirVeBekle(ortam, senaryoAdi, dosya, tumSenaryolar, kosuId) {
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

  // bkz. kuyruktaBekleyenler NOTU: kuyruğa girmeden ÖNCE bu koşunun HTTP yanıtını
  // çözecek fonksiyonu kaydediyoruz ki calismaDurdur, koşu daha sırası gelmeden
  // "Durdur" ile iptal edilirse yanıtı hemen dönebilsin.
  return new Promise((resolve) => {
    kuyruktaBekleyenler.set(kosuId, resolve);
    dosyaSirasiIleCalistir(dosya, () => gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId)).then((sonuc) => {
      // Eğer calismaDurdur bu koşuyu ZATEN erken çözdüyse (Map'ten silinmiş olur),
      // ikinci kez resolve çağırmıyoruz — Promise'lerde ikinci resolve zaten yok
      // sayılır ama netlik için burada da kontrol ediyoruz.
      if (kuyruktaBekleyenler.delete(kosuId)) {
        resolve(sonuc);
      }
    });
  });
}

function gercektenCalistir(ortam, senaryoAdi, dosya, desen, kosuId) {
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

    const jsonCiktiYolu = join(tmpdir(), `test-sunucu-sonuc-${randomBytes(6).toString('hex')}.json`);
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
    const argumanlar = [PLAYWRIGHT_CLI_YOLU, 'test', dosya, '--reporter=list,json'];

    console.log(`\n▶ [${ortam.toUpperCase()}] "${senaryoAdi}" başlatıldı...\n`);

    const alt = spawn(process.execPath, argumanlar, {
      cwd: projeKoku,
      env: {
        ...process.env,
        TEST_ENV: ortam,
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonCiktiYolu,
        TEST_SUNUCU_GORUNUR: '1',
        TEST_SUNUCU_CANLI_YOLU: canliYolu,
        TEST_SUNUCU_GREP_DESENI: desen
      },
      // NOT: 'inherit' yerine 'pipe' kullanılıyor — alt sürecin kendi stdout/stderr'ı
      // (ör. Playwright'ın "Error: No tests found" çıktısı) DOĞRUDAN terminale
      // yazıldığında bizim console.log sarmalayıcımızdan (yukarıdaki logaYaz) GEÇMİYOR,
      // yani test-sunucu.log dosyasına düşmüyordu. Şimdi alt sürecin çıktısını
      // process.stdout/stderr'a AYNEN basıyoruz (terminaldeki canlı görünüm korunur) VE
      // ayrıca log dosyasına da yazıyoruz.
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    alt.stdout?.on('data', (parca) => {
      process.stdout.write(parca);
      logaYaz(parca.toString('utf-8').replace(/\n$/, ''));
    });
    alt.stderr?.on('data', (parca) => {
      process.stderr.write(parca);
      logaYaz('[stderr] ' + parca.toString('utf-8').replace(/\n$/, ''));
    });

    calisanSurecler.set(kosuId, { surec: alt, pid: alt.pid, iptalEdiliyor: false, canliYolu });

    let sureciBaslatmaHatasi = null;
    alt.on('error', (hata) => {
      sureciBaslatmaHatasi = hata;
      console.error(`Test süreci başlatılamadı: ${hata.message}`);
    });

    alt.on('close', (kod) => {
      const kayit = calisanSurecler.get(kosuId);
      const iptalEdildiMi = kayit?.iptalEdiliyor ?? false;
      calisanSurecler.delete(kosuId);

      // Koşu bitti, canlı izleme dosyasına artık gerek yok — temizle (yoksa/okunamıyorsa
      // sorun değil, sessizce yok sayılır).
      try {
        if (existsSync(canliYolu)) unlinkSync(canliYolu);
      } catch {
        // yok sayılır
      }

      if (sureciBaslatmaHatasi) {
        resolve({ calistiMi: false, mesaj: `Test süreci başlatılamadı: ${sureciBaslatmaHatasi.message}` });
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
        if (existsSync(jsonCiktiYolu)) {
          sonuc = sonucuOku(jsonCiktiYolu, senaryoAdi);
          unlinkSync(jsonCiktiYolu);
        }
      } catch (okumaHatasi) {
        console.error(`Sonuç dosyası okunamadı/ayrıştırılamadı: ${okumaHatasi.message}`);
      }
      resolve({ calistiMi: true, cikisKodu: kod, sonuc, iptalEdildiMi: false });
    });
  });
}

// ---- JetSeyahat "Senaryo Oluştur" özelliği (dashboard'daki "+ Senaryo Oluştur"
// popup'ından tetiklenir) ----
// Bu özellik yeni bir çalıştırma altyapısı KURMAZ; MEVCUT tumSenaryolariGetir +
// testiCalistirVeBekle akışını OLDUĞU GİBİ kullanır: "dene" isteğinde, kullanıcının
// doldurduğu alanlar GEÇİCİ ve belirgin bir başlıkla (SENARYO_OLUSTUR_GECICI_ON_EK
// ile başlayan) jet-seyahat.json > senaryolar dizisine eklenir, normal akışla
// çalıştırılır, sonuç ne olursa olsun (başarılı/başarısız/hata) geçici kayıt hemen
// ardından dosyadan SİLİNİR — kullanıcı denemeyi hiç "kaydet" demeden kapatsa bile
// dosyada iz kalmaz. "kaydet" isteğinde ise aynı senaryo nesnesi, kullanıcının
// verdiği KALICI başlıkla eklenir ve silinmez; "Senaryolar" listesinde görünmesi
// için dashboard'ın yeniden üretilmesi (npm run rapor:test) gerekir — mevcut "Koşu
// geçmişi" statik anlık görüntü sınırlamasıyla aynı mimari kısıt.
const SENARYO_OLUSTUR_GECICI_ON_EK = '__senaryo_olustur_deneme__ ';

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
  writeFileSync(jetSeyahatDosyaYolu(ortam), JSON.stringify(veri, null, 2) + '\n', 'utf-8');
}

// Dashboard popup'ından gelen ham gövdeyi, jet-seyahat.json > senaryolar dizisindeki
// bir öğe şekline (bkz. tests/support/test-data.ts > JetSeyahatTestData) dönüştürür;
// yalnızca dolu/tanımlı alanlar kopyalanır. Geçersiz/eksik veri varsa fırlatılan
// Error mesajı doğrudan kullanıcıya (dashboard popup'ında) gösterilir.
function jetSeyahatSenaryoNesnesiOlustur(baslik, girdi, ortam) {
  if (!girdi || typeof girdi !== 'object') {
    throw new Error('Senaryo alanları eksik.');
  }
  const { kapsam, alternatif, covidTeminati, sorguTipi, ettiren } = girdi;
  if (typeof kapsam !== 'string' || !kapsam.trim()) throw new Error('Kapsam zorunludur.');
  if (typeof alternatif !== 'string' || !alternatif.trim()) throw new Error('Alternatif zorunludur.');
  if (covidTeminati !== 'E' && covidTeminati !== 'H') throw new Error('covidTeminati "E" veya "H" olmalıdır.');
  if (sorguTipi !== 'tekli' && sorguTipi !== 'coklu') throw new Error('sorguTipi "tekli" veya "coklu" olmalıdır.');
  if (ettiren !== 'ayni' && ettiren !== 'farkliOzel' && ettiren !== 'farkliTuzel') {
    throw new Error('ettiren "ayni", "farkliOzel" veya "farkliTuzel" olmalıdır.');
  }

  const senaryo = {
    baslik,
    kapsam: kapsam.trim(),
    alternatif: alternatif.trim(),
    covidTeminati,
    sorguTipi,
    ettiren
  };

  // Çoklu sorguda, popup'ta yüklenen Excel dosyası (bkz. /jetseyahat-coklu-sorgu-yukle)
  // bu SENARYOYA ÖZEL olarak kullanılır — verilmezse ürün genelindeki sabit dosya
  // (urunData.cokluSorguDosyasi) kullanılmaya devam eder (bkz. jet-seyahat.page.ts >
  // sorguTipiniHazirla). Kişi sayısı, satır sayısını doğrulamak için zorunludur.
  if (sorguTipi === 'coklu' && girdi.cokluSorguDosyasi) {
    const kisiSayisi = Number(girdi.cokluSorguKisiSayisi);
    if (!Number.isInteger(kisiSayisi) || kisiSayisi <= 0) {
      throw new Error('Yüklenen Excel dosyasındaki kişi sayısı geçerli bir tam sayı olmalıdır.');
    }
    senaryo.cokluSorguDosyasi = girdi.cokluSorguDosyasi;
    senaryo.cokluSorguKisiSayisi = kisiSayisi;
  }

  if (ettiren !== 'ayni') {
    if (girdi.ettirenProfili) {
      senaryo.ettirenProfili = girdi.ettirenProfili;
    } else if (ettiren === 'farkliOzel' && girdi.ettirenOzelKimligi) {
      senaryo.ettirenOzelKimligi = girdi.ettirenOzelKimligi;
    } else if (ettiren === 'farkliTuzel' && girdi.ettirenTuzelKimligi) {
      senaryo.ettirenTuzelKimligi = girdi.ettirenTuzelKimligi;
    } else {
      throw new Error('Farklı sigorta ettiren seçildiyse bir profil ya da kimlik bilgisi girilmelidir.');
    }
  }

  // Sigortalı: hazır bir profil anahtarı (ör. "tc2" — ettirenProfili ile AYNI mantık,
  // ortakData.kimlikBilgileri.ozel içinden test ANINDA çözülür, bkz. prim-hesaplama.spec.ts)
  // ya da doğrudan serbest girilmiş kimlik nesnesi olabilir; ikisi de gelirse profil önceliklidir.
  if (girdi.sigortaliProfili) {
    senaryo.sigortaliProfili = girdi.sigortaliProfili;
  } else if (girdi.sigortaliKimligi) {
    senaryo.sigortaliKimligi = girdi.sigortaliKimligi;
  }
  if (girdi.kayakTeminati) senaryo.kayakTeminati = true;
  if (girdi.beklenenHataMesaji) {
    senaryo.beklenenHataMesaji = girdi.beklenenHataMesaji;
    senaryo.beklenenHataAdimi = girdi.beklenenHataAdimi === 'policelestirme' ? 'policelestirme' : 'primHesaplama';
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
  if (girdi.acenteKodu) {
    const acenteKodu = String(girdi.acenteKodu).trim();
    const acenteKullanicisi = girdi.acenteKullanicisi ? String(girdi.acenteKullanicisi).trim() : '';
    if (!acenteKodu || !acenteKullanicisi) {
      throw new Error('Acente kodu girildiyse acente kullanıcı kodu da girilmelidir.');
    }
    const ortakVeri = ortakVerisiniOku(ortam);
    const anahtar = ortakAcenteProfiliBulYaEkle(ortakVeri, {
      acentePartaji: acenteKodu,
      acentePartajiSecenegi: acenteKodu,
      acenteKullanicisi: acenteKullanicisi
    });
    ortakVerisiniYaz(ortam, ortakVeri);
    senaryo.acenteProfili = anahtar;
  } else if (girdi.acenteProfili) {
    senaryo.acenteProfili = girdi.acenteProfili;
  }

  return senaryo;
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
    }
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
  writeFileSync(ortakDosyaYolu(ortam), JSON.stringify(veri, null, 2) + '\n', 'utf-8');
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

const sunucu = createServer(async (req, res) => {
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

  if (req.method === 'GET' && req.url === '/saglik') {
    jsonGonder(res, 200, { basarili: true, mesaj: 'Test sunucusu çalışıyor.' });
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

    const { ortam, senaryoAdi, token } = istek ?? {};
    // kosuId: dashboard'un HER TEKİL koşu isteği için ürettiği benzersiz kimlik (bkz.
    // calisanSurecler üstündeki NOT). Eski/uyumsuz bir istemciden gelirse (kosuId yoksa)
    // sunucu kendi üretir — koşu yine çalışır, sadece o istek için "Durdur" başka bir
    // isteği yanlışlıkla hedefleyemesin diye biz de garanti bir kimlik atarız.
    const kosuId = typeof istek?.kosuId === 'string' && istek.kosuId.trim()
      ? istek.kosuId.trim()
      : randomBytes(8).toString('hex');

    if (token !== TOKEN) {
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

    let tumSenaryolar;
    try {
      tumSenaryolar = await tumSenaryolariGetir(ortam);
    } catch (hata) {
      jsonGonder(res, 500, {
        basarili: false,
        mesaj: `Senaryo listesi alınamadı (npx playwright test --list başarısız oldu): ${hata.message}`
      });
      return;
    }

    const eslesenSenaryo = tumSenaryolar.find((s) => s.ad === senaryoAdi);
    if (!eslesenSenaryo) {
      jsonGonder(res, 403, {
        basarili: false,
        mesaj: 'Bu ad, projedeki gerçek senaryolarla eşleşmiyor; güvenlik nedeniyle çalıştırılmadı.'
      });
      return;
    }

    // Bu istek, test TAMAMEN bitene kadar (birkaç saniyeden birkaç dakikaya kadar
    // sürebilir) yanıt vermeden bekletilir — dashboard tarafı bu sürede satırı
    // "çalışıyor" gösterir, sonuç gelince popup açar.
    const calistirmaSonucu = await testiCalistirVeBekle(ortam, senaryoAdi, eslesenSenaryo.dosya, tumSenaryolar, kosuId);

    if (!calistirmaSonucu.calistiMi) {
      jsonGonder(res, 500, { basarili: false, mesaj: calistirmaSonucu.mesaj });
      return;
    }

    if (calistirmaSonucu.iptalEdildiMi) {
      jsonGonder(res, 200, {
        basarili: true,
        durum: 'iptal',
        mesaj: 'Test, kullanıcı tarafından durduruldu.'
      });
      return;
    }

    if (!calistirmaSonucu.sonuc) {
      jsonGonder(res, 200, {
        basarili: true,
        durum: calistirmaSonucu.cikisKodu === 0 ? 'passed' : 'failed',
        mesaj: `Test tamamlandı ama detaylı sonuç okunamadı (çıkış kodu: ${calistirmaSonucu.cikisKodu}). Terminaldeki çıktıya bakın.`
      });
      return;
    }

    jsonGonder(res, 200, {
      basarili: true,
      durum: calistirmaSonucu.sonuc.durum,
      sureMs: calistirmaSonucu.sonuc.sureMs,
      hataMesaji: calistirmaSonucu.sonuc.hataMesaji,
      ekranGoruntusu: calistirmaSonucu.sonuc.ekranGoruntusu,
      videoUrl: medyaUrlOlustur(calistirmaSonucu.sonuc.videoYolu)
    });
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

    if (token !== TOKEN) {
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

    if (token !== TOKEN) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (!yol) {
      jsonGonder(res, 400, { basarili: false, mesaj: 'yol zorunludur.' });
      return;
    }

    const testSonuclariKoku = resolvePath(projeKoku, 'test-results');
    const cozulmusYol = resolvePath(yol);
    if (!cozulmusYol.startsWith(testSonuclariKoku) || !existsSync(cozulmusYol)) {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Dosya bulunamadı.' });
      return;
    }

    const uzanti = extname(cozulmusYol).toLowerCase();
    const icerikTuru =
      uzanti === '.webm' ? 'video/webm' :
      uzanti === '.mp4' ? 'video/mp4' :
      uzanti === '.png' ? 'image/png' :
      'application/octet-stream';

    const boyut = statSync(cozulmusYol).size;
    const araligi = req.headers.range;
    if (araligi) {
      const eslesme = /^bytes=(\d*)-(\d*)$/.exec(araligi);
      const baslangic = eslesme && eslesme[1] ? Number(eslesme[1]) : 0;
      const bitis = eslesme && eslesme[2] ? Number(eslesme[2]) : boyut - 1;
      res.writeHead(206, {
        'Content-Type': icerikTuru,
        'Content-Length': bitis - baslangic + 1,
        'Content-Range': `bytes ${baslangic}-${bitis}/${boyut}`,
        'Accept-Ranges': 'bytes'
      });
      createReadStream(cozulmusYol, { start: baslangic, end: bitis }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': icerikTuru, 'Content-Length': boyut, 'Accept-Ranges': 'bytes' });
      createReadStream(cozulmusYol).pipe(res);
    }
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

    if (token !== TOKEN) {
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
    if (token !== TOKEN) {
      jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
      return;
    }
    if (ortam !== 'test' && ortam !== 'canli') {
      jsonGonder(res, 400, { basarili: false, mesaj: 'ortam yalnızca "test" veya "canli" olabilir.' });
      return;
    }

    const geciciBaslik = SENARYO_OLUSTUR_GECICI_ON_EK + randomBytes(4).toString('hex');
    let eklendiMi = false;
    try {
      const veri = jetSeyahatVerisiniOku(ortam);
      const yeniSenaryo = jetSeyahatSenaryoNesnesiOlustur(geciciBaslik, senaryo, ortam);
      veri.jetSeyahat.senaryolar.push(yeniSenaryo);
      jetSeyahatVerisiniYaz(ortam, veri);
      eklendiMi = true;

      const tumSenaryolar = await tumSenaryolariGetir(ortam);
      const eslesenSenaryo = tumSenaryolar.find((s) => s.ad === geciciBaslik);
      if (!eslesenSenaryo) {
        throw new Error('Geçici senaryo, senaryo listesinde bulunamadı (dosya değişikliği Playwright tarafından görülemedi).');
      }

      const kosuId = randomBytes(8).toString('hex');
      const calistirmaSonucu = await testiCalistirVeBekle(ortam, geciciBaslik, eslesenSenaryo.dosya, tumSenaryolar, kosuId);

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
          mesaj: `Deneme tamamlandı ama detaylı sonuç okunamadı (çıkış kodu: ${calistirmaSonucu.cikisKodu}).`
        });
        return;
      }
      jsonGonder(res, 200, {
        basarili: true,
        durum: calistirmaSonucu.sonuc.durum,
        sureMs: calistirmaSonucu.sonuc.sureMs,
        hataMesaji: calistirmaSonucu.sonuc.hataMesaji,
        ekranGoruntusu: calistirmaSonucu.sonuc.ekranGoruntusu,
        videoUrl: medyaUrlOlustur(calistirmaSonucu.sonuc.videoYolu)
      });
    } catch (hata) {
      jsonGonder(res, 400, { basarili: false, mesaj: hata.message });
    } finally {
      // Deneme sonucu ne olursa olsun (başarı/hata/erken hata), geçici kayıt kalıcı
      // dosyada KALMAMALI. Yukarıda push ettiğimiz nesneyi değil, dosyanın O ANKİ
      // halini tekrar okuyup içinden geçici başlığı filtreleyerek yazıyoruz — araya
      // başka bir istek (ör. eşzamanlı bir "kaydet") girmiş olabileceğinden.
      if (eklendiMi) {
        try {
          const temizVeri = jetSeyahatVerisiniOku(ortam);
          temizVeri.jetSeyahat.senaryolar = temizVeri.jetSeyahat.senaryolar.filter((s) => s.baslik !== geciciBaslik);
          jetSeyahatVerisiniYaz(ortam, temizVeri);
        } catch (temizlemeHatasi) {
          console.error('[jetseyahat-senaryo/dene] Geçici senaryo temizlenemedi:', temizlemeHatasi.message);
        }
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

    const { ortam, senaryo, baslik, token } = istek ?? {};
    if (token !== TOKEN) {
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

    try {
      const veri = jetSeyahatVerisiniOku(ortam);
      const temizBaslik = baslik.trim();
      if (veri.jetSeyahat.senaryolar.some((s) => s.baslik === temizBaslik)) {
        jsonGonder(res, 409, { basarili: false, mesaj: 'Bu başlıkta bir senaryo zaten var, başka bir başlık seçin.' });
        return;
      }
      const yeniSenaryo = jetSeyahatSenaryoNesnesiOlustur(temizBaslik, senaryo, ortam);
      veri.jetSeyahat.senaryolar.push(yeniSenaryo);
      jetSeyahatVerisiniYaz(ortam, veri);
      jsonGonder(res, 200, { basarili: true, mesaj: 'Senaryo kaydedildi.' });
    } catch (hata) {
      jsonGonder(res, 400, { basarili: false, mesaj: hata.message });
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
    if (token !== TOKEN) {
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

    if (token !== TOKEN) {
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

if (dogrudanCalistirildi) {
  sunucu.listen(PORT, '127.0.0.1', () => {
    console.log(`Test tetikleme sunucusu hazır: http://127.0.0.1:${PORT} (yalnızca bu bilgisayardan erişilebilir)`);
    console.log('Dashboard\'daki ▷ Çalıştır ikonları bu pencere açık kaldığı sürece çalışır. Kapatmak için Ctrl+C.');
  });
}
