// PLAYWRIGHT KODUNA DIŞA AKTARMA (genel, saf) — bir ekran senaryosunun koşu planından (model-kosusu.mjs > modelKosuPlani;
// koşucunun kullandığı AYNI plan) Nöbetçi'ye bağımlı OLMAYAN, çalıştırılabilir tek bir Playwright ".spec.ts" dosyası üretir.
// Dosya tarayıcıda indirilir; sunucu dosya yazmaz, hiçbir yere istek atmaz (yalnızca kod üretimi).
//
//  - Alanlar koşucunun (tests/support/model-kosucu.ts > alaniDoldur) yaptığı eylemlerle doldurulur: fill, pressSequentially
//    (tuşlayarak), selectOption value → label yedeği, radyo check / zorla, setChecked, tarih fill / betik, setInputFiles, ok
//    düğmeli seçim ve maske. Adım aksiyonları, başarı / hata göstergeleri ve kabul edilen uyarılar da aynı kurallarla.
//  - GİZLİ / KİŞİSEL DEĞERLER DÜZ YAZILMAZ: giriş bilgileri (kullanıcı adı, parola, TOTP, SMS kodu, ek alanlar), adı gizli sayılan
//    alanlar (çekirdek liste + Ayarlar > Güvenlik > Maskeleme ek adları), kasada şifreli (hassas) senaryo alanları, kimlik
//    profili alanları ve gizli tablo sütunlarından gelen değerler process.env.NOBETCI_<AD> okumasına çevrilir; gereken
//    değişkenler dosyanın başında (.env örneğiyle) listelenir.
//  - Nöbetçi'ye özgü adımlar (SQL kontrolü, indirilen dosyayı doğrulama) "Nöbetçi'de koşar" yorumu + açık TODO olarak kalır
//    (dosya adımında indirmeyi başlatan düğmeye basılır ve indirme beklenir; içerik beklentileri yorumdadır). Senaryonun bilerek
//    boş bıraktığı alanlar (olumsuz senaryo) koşu planında zaten yoktur: kod o alanlara değer yazmaz, dosya başında listelenir.
// Kullanıcının kendi verisi (seçiciler, ekran adı, değerler) üretilen koda yazılır; bu modülün kendisi genel kalır.
// NOT: import.meta KULLANILMAZ. Tipler: playwright-disa-aktarma.d.mts.

import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { seciciAgaciniDuzelt } from '../tarama/secici-duzelt.mjs';
import { girisAdimlariniCoz } from '../giris/tarif.mjs';
import { referansCoz } from '../dosyalar/referans.mjs';
import { secenekBul } from './model-kosusu.mjs';
import { goreliIfadeAyristir } from './goreli-tarih.mjs';
import { beklentiAdi } from '../dosyalar/dosya-icerigi.mjs';
import { GORUNURSE_BEKLEME_SN } from '../../dogrulama/ekran-modeli-dogrulayici.mjs';

/** Üretilen dosyanın ortam değişkenlerinin öneki. */
export const DISA_AKTARMA_ON_EKI = 'NOBETCI_';

const YER_TUTUCU = /\{([\p{L}\p{N}_.-]+)\}/gu;
const TR = /** @type {Record<string, string>} */ ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' });
/** @param {string} m */
const ascii = (m) => String(m).replace(/[çÇğĞıİöÖşŞüÜ]/g, (k) => TR[k] ?? k).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
/** TS dizge sabiti. @param {unknown} d */
const s = (d) => JSON.stringify(String(d));
/** Tek satır yorum metni. @param {unknown} d */
const yorum = (d) => String(d ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
/** @param {string} m */
const regexKacis = (m) => String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** @param {string} m */
const sablonKacis = (m) => String(m).replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${');
/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** "adSoyad" / "Ad soyad" / "kimlik.tcNo" → "AD_SOYAD" / "KIMLIK_TC_NO". @param {string} ad */
export function ortamDegiskeniParcasi(ad) {
  const p = ascii(ad).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return p || 'DEGER';
}

/** Dosya adı: senaryo başlığından (ASCII, küçük harf, "-"). @param {string} baslik */
export function disaAktarmaDosyaAdi(baslik) {
  const p = ascii(baslik).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return `${p || 'senaryo'}.spec.ts`;
}

/** Değeri koşucunun maskesiyle biçimler (model-kosucu.ts > maskeUygula ile aynı). @param {unknown} maske @param {unknown} deger */
function maskeUygula(maske, deger) {
  if (typeof maske !== 'string' || !maske.includes('#') || (typeof deger !== 'string' && typeof deger !== 'number')) return deger;
  const rakamlar = String(deger).replace(/\D/g, '');
  if (rakamlar.length !== (maske.match(/#/g) ?? []).length) return deger;
  let i = 0;
  return maske.replace(/#/g, () => rakamlar[i++]);
}

// ---------------------------------------------------------------------------------------
// Üretilen dosyanın yardımcıları (yalnızca kullanılanlar yazılır)
// ---------------------------------------------------------------------------------------

/** @type {Record<string, { gerekir?: string[]; kod: string }>} */
const YARDIMCILAR = {
  ortamDegeri: {
    kod: `/** Ortam değişkeninin değeri (tanımlı değilse açık hata; gizli değerler bu dosyaya yazılmaz). */
function ortamDegeri(ad: string): string {
  const d = process.env[ad];
  if (d === undefined || d === '') throw new Error(\`\${ad} ortam değişkeni tanımlı değil (dosyanın başındaki listeye bakın).\`);
  return d;
}`
  },
  sayfa: {
    kod: `/** Alanın ekranda görünmesi için bekleme (koşullu alanlar önceki seçimden sonra çizilebilir). */
const GORUNURLUK_MS = 2_000;
/** Alan doldurulduktan sonra başlayan arka plan isteklerinin (XHR / fetch) en çok beklenmesi. */
const ARKA_PLAN_EN_COK_MS = 8_000;
/** Adım boyunca çıkan tarayıcı uyarıları (alert / confirm); uyarılar kapatılır (confirm iptal edilir). */
const tarayiciUyarilari: string[] = [];
const surenIstekler = new Map<Request, number>();
let sonIstek = 0;

/** Tarayıcı uyarılarını kaydeder ve kapatır; arka plan isteklerini izler. */
function sayfayiHazirla(page: Page): void {
  page.on('dialog', (d) => { tarayiciUyarilari.push(d.message()); void d.dismiss().catch(() => undefined); });
  page.on('request', (r) => {
    if (r.resourceType() !== 'xhr' && r.resourceType() !== 'fetch') return;
    surenIstekler.set(r, Date.now());
    sonIstek = Date.now();
  });
  const bitti = (r: Request): void => { if (surenIstekler.delete(r)) sonIstek = Date.now(); };
  page.on('requestfinished', bitti);
  page.on('requestfailed', bitti);
}

/** baslangic'tan sonra başlayan arka plan istekleri bitene (ve kısa bir sessizlik olana) kadar bekler. */
async function arkaPlanBekle(page: Page, baslangic: number): Promise<void> {
  const bitis = Date.now() + ARKA_PLAN_EN_COK_MS;
  for (;;) {
    const suren = [...surenIstekler.values()].some((t) => t >= baslangic);
    const sessiz = Date.now() - Math.max(baslangic, sonIstek) >= 150;
    if ((!suren && sessiz) || Date.now() >= bitis) return;
    await page.waitForTimeout(50);
  }
}

/**
 * Alan: ekranda GÖRÜNÜYORSA doldurulur; görünmüyorsa ya da kapalıysa (disabled) atlanır ve yazdırılır — "mutlaka görünmeli"
 * alanda test düşer. zorla: gizli (özel çizimli) girdi; görünürlük yerine sayfada varlığı yeter.
 */
async function alan(page: Page, secici: string, etiket: string, doldur: ((l: Locator) => Promise<void>) | null,
  s: { zorunlu?: boolean; zorla?: boolean; cerceve?: string[] } = {}): Promise<void> {
  // cerceve: alan bir çerçevenin (iframe) içindeyse çerçeve seçicileri (dıştan içe).
  let k: Page | FrameLocator = page;
  for (const c of s.cerceve ?? []) k = k.frameLocator(c);
  const l = s.zorla ? k.locator(secici).first() : k.locator(secici).filter({ visible: true }).first();
  const var_ = await l.waitFor({ state: s.zorla ? 'attached' : 'visible', timeout: GORUNURLUK_MS }).then(() => true, () => false);
  if (!var_) {
    if (s.zorunlu) throw new Error(\`\${etiket} alanı ekranda görünmüyor (mutlaka görünmeli).\`);
    console.log(\`Atlanan alan: \${etiket} (ekranda görünmüyor)\`);
    return;
  }
  if (!doldur) return;
  if (await l.isDisabled().catch(() => false)) {
    if (s.zorunlu) throw new Error(\`\${etiket} alanı kapalı (disabled; mutlaka görünmeli).\`);
    console.log(\`Atlanan alan: \${etiket} (kapalı)\`);
    return;
  }
  const baslangic = Date.now();
  await doldur(l);
  await arkaPlanBekle(page, baslangic);
}`
  },
  degerOku: {
    kod: `/** Öğenin değeri (input / select / textarea) ya da görünen metni. */
async function degerOku(l: Locator): Promise<string> {
  return l.evaluate((e) => {
    const t = e.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return (e as HTMLInputElement).value;
    return (e as HTMLElement).innerText ?? e.textContent ?? '';
  }).catch(() => '');
}`
  },
  metin: {
    kod: `/** Toleranslı karşılaştırma: Türkçe küçük harf, ı→i, kıvrık tırnak → düz, boşluklar tek. */
function normallestir(m: string): string {
  return String(m ?? '').replace(/[“”„«»″]/g, '"').replace(/[‘’‚‹›′\`´]/g, "'").replace(/\\s+/g, ' ').trim()
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
}
function iceriyorMu(gorulen: string, beklenen: string): boolean {
  const b = normallestir(beklenen);
  return b !== '' && normallestir(gorulen).includes(b);
}`
  },
  gosterge: {
    gerekir: ['metin', 'sayfa'],
    kod: `type Gosterge = { tur: 'metin' | 'eleman' | 'url' | 'desen'; deger: string; secici?: string };

/** Seçicinin görünen öğelerinin metni; seçici yoksa sayfanın metni + tarayıcı uyarıları. */
async function gorunenMetin(page: Page, secici: string | null): Promise<string> {
  if (!secici) return [await page.locator('body').innerText().catch(() => ''), ...tarayiciUyarilari].join('\\n');
  const ogeler = await page.locator(secici).filter({ visible: true }).all();
  return (await Promise.all(ogeler.map((o) => o.innerText().catch(() => '')))).join(' ');
}

async function gostergeVarMi(page: Page, g: Gosterge): Promise<boolean> {
  if (g.tur === 'url') return new RegExp(g.deger).test(page.url());
  if (g.tur === 'eleman') return (await page.locator(g.deger).filter({ visible: true }).count().catch(() => 0)) > 0;
  const metin = await gorunenMetin(page, g.secici ?? null);
  return g.tur === 'desen' ? new RegExp(g.deger).test(metin) : iceriyorMu(metin, g.deger);
}

/** Hata göstergesinin görünen metinleri + adım boyunca çıkan tarayıcı uyarıları. */
async function hataMesajlari(page: Page, hataSecici: string | null): Promise<string[]> {
  const m: string[] = [];
  if (hataSecici) {
    const l = page.locator(hataSecici).filter({ visible: true });
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < n; i++) m.push(await l.nth(i).innerText().catch(() => ''));
  }
  m.push(...tarayiciUyarilari);
  return m.map((x) => x.trim()).filter(Boolean);
}

/**
 * Adımın başarısı: başarı göstergelerinden biri ("veya") görünür. Hata göstergesinde / tarayıcı uyarısında bir mesaj ya da akışın
 * kabul ettiği bir uyarı görünürse hemen başarısız (başarı mesajının kendisini gösteren uyarı hata sayılmaz).
 */
async function basariBekle(page: Page, s: { adim: string; basari: Gosterge[]; hataSecici: string | null; uyarilar: Array<{ metin: string; secici?: string }>; sureMs: number }): Promise<void> {
  const son = Date.now() + s.sureMs;
  for (;;) {
    let gorunen: Gosterge | null = null;
    for (const g of s.basari) if (await gostergeVarMi(page, g)) { gorunen = g; break; }
    const basariMetni = gorunen && gorunen.tur === 'metin' ? gorunen.deger : null;
    const hatalar = (await hataMesajlari(page, s.hataSecici)).filter((m) => !(basariMetni && iceriyorMu(m, basariMetni)));
    for (const u of s.uyarilar) {
      if (iceriyorMu(await gorunenMetin(page, u.secici ?? null), u.metin)) { hatalar.push(\`uyarı: "\${u.metin}"\`); break; }
    }
    if (hatalar.length) throw new Error(\`\${s.adim}: beklenmeyen uyarı — \${hatalar.join(' | ')}\`);
    if (gorunen || !s.basari.length) return;
    if (Date.now() >= son) throw new Error(\`\${s.adim}: \${Math.round(s.sureMs / 1000)} sn içinde başarı göstergesi görünmedi (sayfa: \${new URL(page.url()).pathname}).\`);
    await page.waitForTimeout(250);
  }
}

/** Beklenen iş kuralı uyarısı: hata göstergesinde (yoksa sayfada) beklenen mesajlardan biri görünene kadar (toleranslı). */
async function beklenenUyariyiBekle(page: Page, s: { adim: string; beklenenler: string[]; hataSecici: string | null; sureMs: number }): Promise<void> {
  const son = Date.now() + s.sureMs;
  let sonGorulen = '';
  for (;;) {
    const metin = s.hataSecici ? (await hataMesajlari(page, s.hataSecici)).join(' ') : await gorunenMetin(page, null);
    if (metin.trim()) sonGorulen = metin;
    if (s.beklenenler.some((b) => iceriyorMu(metin, b))) return;
    if (Date.now() >= son) {
      throw new Error(\`\${s.adim} adımında beklenen sonuç doğrulanamadı. Beklenen: \${s.beklenenler.map((b) => \`"\${b}"\`).join(' veya ')} — Görülen: "\${sonGorulen.replace(/\\s+/g, ' ').trim() || 'uyarı çıkmadı'}"\`);
    }
    await page.waitForTimeout(500);
  }
}`
  },
  okluSec: {
    gerekir: ['metin', 'degerOku'],
    kod: `/**
 * Ok düğmeli özel seçim: değeri gösteren öğe hedef metne gelene kadar ileri, uçta (değer değişmezse) ya da halka başa
 * dönerse geri düğmesine basılır (yön başına en çok maks tıklama). yanit: her tıklamanın başlattığı, adresi bu metni içeren
 * istek bitene kadar beklenir (ör. seçim değişince yeniden yüklenen bağımlı liste).
 */
async function okluSec(page: Page, gosterge: Locator, yonler: string[], hedefMetin: string, maks = 12, yanit: string | null = null): Promise<void> {
  const oku = async (): Promise<string> => normallestir(await degerOku(gosterge));
  const hedef = normallestir(hedefMetin);
  if (yanit) await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  const tikla = async (dugme: Locator): Promise<void> => {
    if (!yanit) { await dugme.click(); return; }
    const istek = page.waitForRequest((r) => r.url().includes(yanit), { timeout: 1_500 }).catch(() => null);
    await dugme.click();
    const r = await istek;
    if (r) await (await r.response().catch(() => null))?.finished().catch(() => null);
  };
  const gorulenler = new Set<string>([await oku()]);
  if ((await oku()) === hedef) return;
  for (const yon of yonler) {
    const dugme = page.locator(yon).filter({ visible: true }).first();
    const baslangic = await oku();
    for (let i = 0; i < maks; i++) {
      const once = await oku();
      await tikla(dugme);
      await expect.poll(oku, { timeout: 3_000 }).not.toBe(once).catch(() => undefined);
      const simdi = await oku();
      gorulenler.add(simdi);
      if (simdi === hedef) return;
      if (simdi === once || simdi === baslangic) break;
    }
  }
  throw new Error(\`"\${hedefMetin}" seçilemedi; seçilebilen değerler: \${[...gorulenler].join(', ')}\`);
}`
  },
  secimYap: {
    kod: `/** Açılır liste: önce değerle (value), olmazsa görünen metinle; özel liste (SELECT değil): açılıp metniyle seçilir. */
async function secimYap(page: Page, l: Locator, deger: string, metin: string, gerekirse = false): Promise<void> {
  if ((await l.evaluate((e) => e.tagName)) === 'SELECT') {
    // "Gerekirse seç": değer zaten seçiliyse dokunulmaz (yeniden seçmek bağımlı alanları sıfırlayabilir).
    if (gerekirse && (await l.inputValue()) === deger) return;
    try {
      await l.selectOption({ value: deger }, { timeout: 5_000 });
    } catch {
      await l.selectOption({ label: metin }, { timeout: 5_000 });
    }
    return;
  }
  await l.click();
  await page.getByText(metin, { exact: true }).filter({ visible: true }).first().click();
}`
  },
  degerJs: {
    kod: `/** Değer betikle yazılır (gizli ya da özel çizimli alanlar); input / change olayları tetiklenir. */
async function degerJsIleYaz(l: Locator, deger: string, metin: string): Promise<void> {
  const tamam = await l.evaluate((e, a) => {
    const el = e as HTMLInputElement | HTMLSelectElement;
    if (el instanceof HTMLSelectElement) {
      const secenekler = Array.from(el.options);
      const o = secenekler.find((x) => x.value === a.deger) ?? secenekler.find((x) => x.text.trim() === a.metin);
      if (!o) return false;
      el.value = o.value;
    } else {
      el.value = a.deger;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { deger, metin });
  if (!tamam) throw new Error(\`"\${metin}" seçeneği listede yok.\`);
}`
  },
  zorla: {
    kod: `/** Gizli girdili özel çizimli radyo / onay kutusu: zorla tıklama, olmazsa betikle tıklama; sonunda durum doğrulanır. */
async function zorlaIsaretle(l: Locator, isaretli: boolean): Promise<void> {
  await l.waitFor({ state: 'attached', timeout: 15_000 });
  if ((await l.isChecked({ timeout: 5_000 })) === isaretli) return;
  await l.setChecked(isaretli, { force: true, timeout: 3_000 }).catch(() => undefined);
  if ((await l.isChecked({ timeout: 5_000 })) !== isaretli) await l.evaluate((e) => (e as HTMLInputElement).click());
  expect(await l.isChecked({ timeout: 5_000 })).toBe(isaretli);
}`
  },
  doluBekle: {
    gerekir: ['degerOku'],
    kod: `/** Öğe dolana (metni / değeri boş değil) kadar bekler; icermez: dolu sayılmayan geçici metin (ör. "Aranıyor"). */
async function doluBekle(page: Page, secici: string, sureMs: number, icermez?: string): Promise<void> {
  const oge = page.locator(secici).first();
  await expect.poll(async () => {
    const d = (await degerOku(oge)).trim();
    return d !== '' && !(icermez && d.toLocaleLowerCase('tr-TR').includes(icermez.toLocaleLowerCase('tr-TR')));
  }, { timeout: sureMs, message: \`"\${secici}" dolar\` }).toBe(true);
}`
  },
  maske: {
    kod: `/** Değerin rakamları kalıptaki "#" yerlerine sırayla (rakam sayısı uymazsa değer olduğu gibi). */
function maskeUygula(maske: string, deger: string): string {
  const r = deger.replace(/\\D/g, '');
  if (r.length !== (maske.match(/#/g) ?? []).length) return deger;
  let i = 0;
  return maske.replace(/#/g, () => r[i++]);
}`
  },
  regexKacis: {
    kod: `const regexKacis = (m: string): string => m.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');`
  },
  goreliTarih: {
    kod: `/** Göreli tarih ("bugün+7", "ay sonu" …): koşu anındaki Europe/Istanbul gününe göre hesaplanır, alanın biçimiyle yazılır. */
function goreliTarih(taban: 'bugun' | 'ayBasi' | 'aySonu', gun: number, bicim: string): string {
  const [y, a, g] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  const baslangic = taban === 'ayBasi' ? 1 : taban === 'aySonu' ? new Date(Date.UTC(y, a, 0)).getUTCDate() : g;
  const t = new Date(Date.UTC(y, a - 1, baslangic + gun));
  const iki = (n: number): string => String(n).padStart(2, '0');
  return bicim.replace(/yyyy|yy|gg|dd|aa|mm/gi, (p) => {
    const k = p.toLowerCase();
    return k === 'yyyy' ? String(t.getUTCFullYear()) : k === 'yy' ? iki(t.getUTCFullYear() % 100) : k === 'gg' || k === 'dd' ? iki(t.getUTCDate()) : iki(t.getUTCMonth() + 1);
  });
}`
  },
  totp: {
    kod: `/** RFC 6238 TOTP (30 sn, SHA-1, 6 hane) — authenticator uygulamalarıyla aynı; anahtar base32. */
function totpKodu(anahtar: string, zaman = Date.now()): string {
  const alfabe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bitler = '';
  for (const k of anahtar.toUpperCase().replace(/[\\s-]/g, '').replace(/=+$/, '')) {
    const d = alfabe.indexOf(k);
    if (d < 0) throw new Error('TOTP anahtarı geçerli bir base32 metni değil.');
    bitler += d.toString(2).padStart(5, '0');
  }
  const baytlar: number[] = [];
  for (let i = 0; i + 8 <= bitler.length; i += 8) baytlar.push(parseInt(bitler.slice(i, i + 8), 2));
  const sayac = Buffer.alloc(8);
  sayac.writeBigUInt64BE(BigInt(Math.floor(zaman / 30_000)));
  const h = createHmac('sha1', Buffer.from(baytlar)).update(sayac).digest();
  const o = h[h.length - 1] & 0x0f;
  const kod = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(kod % 1_000_000).padStart(6, '0');
}`
  }
};
const YARDIMCI_SIRASI = ['ortamDegeri', 'sayfa', 'degerOku', 'metin', 'gosterge', 'okluSec', 'secimYap', 'degerJs', 'zorla', 'doluBekle', 'maske', 'regexKacis', 'goreliTarih', 'totp'];

// ---------------------------------------------------------------------------------------
// Üretici
// ---------------------------------------------------------------------------------------

/**
 * Koşu planı → Playwright ".spec.ts" dosyası. Gizli değerler ortam değişkenine çevrilir (bkz. dosya başı).
 * @param {import('./playwright-disa-aktarma.d.mts').DisaAktarmaGirdisi} g
 * @returns {import('./playwright-disa-aktarma.d.mts').DisaAktarmaSonucu}
 */
export function playwrightKoduUret(g) {
  // Eski kayıtlı seçicilerdeki iç içe metinli düğme sorunu (`tag:text-is`) dışa aktarılan kodda da düzeltilir.
  const plan = seciciAgaciniDuzelt(g.plan);
  /** @type {Set<string>} */
  const yardimcilar = new Set(['ortamDegeri', 'sayfa']);
  /** @type {Map<string, { ad: string; aciklama: string }>} anahtar → değişken */
  const degiskenler = new Map();
  /** @type {Set<string>} */
  const kullanilanAdlar = new Set();
  let dosyaDegiskeni = false;
  let totpGerekli = false;
  const gz = g.gizlilik ?? {};
  const ekAdlar = gz.ekGizliAdlar ?? [];
  const hassas = new Set(gz.hassasAnahtarlar ?? []);
  const kisisel = new Set(gz.kisiselAlanIdleri ?? []);
  const gizliDegerler = new Set((gz.gizliDegerler ?? []).map((x) => String(x)).filter((x) => x.length > 0));

  /** Ortam değişkeni (anahtar başına bir ad; çakışan ada sayı eklenir). @param {string} anahtar @param {string} parca @param {string} aciklama */
  const degisken = (anahtar, parca, aciklama) => {
    const var_ = degiskenler.get(anahtar);
    if (var_) return var_.ad;
    const kok = `${DISA_AKTARMA_ON_EKI}${ortamDegiskeniParcasi(parca)}`;
    let ad = kok;
    for (let i = 2; kullanilanAdlar.has(ad); i++) ad = `${kok}_${i}`;
    kullanilanAdlar.add(ad);
    degiskenler.set(anahtar, { ad, aciklama: yorum(aciklama) });
    return ad;
  };
  /** @param {string} ad */
  const envIfadesi = (ad) => `ortamDegeri(${s(ad)})`;

  /** Plan alanının değeri gizli mi (nedeni) ya da null. @param {import('./model-kosusu.d.mts').PlanAlani} a */
  const gizliNedeni = (a) => {
    if (kisisel.has(a.id)) return 'kişisel (kimlik profili)';
    const kok = String(a.anahtar).split('.')[0];
    if (hassas.has(a.anahtar) || hassas.has(kok)) return 'hassas alan (kasada şifreli)';
    if (gizliAdMi(a.etiket, ekAdlar) || gizliAdMi(a.anahtar, ekAdlar) || gizliAdMi(a.id, ekAdlar)) return 'adı gizli sayılan alan';
    if (a.deger !== null && a.deger !== undefined && gizliDegerler.has(String(a.deger))) return 'gizli tablo sütunu';
    return null;
  };

  /**
   * Alan değerinin TS ifadesi (metin). Gizliyse ortam değişkeni; maske varsa uygulanır.
   * @param {import('./model-kosusu.d.mts').PlanAlani} a @param {unknown} [ham]
   */
  const degerIfadesi = (a, ham = a.deger) => {
    const neden = gizliNedeni(a);
    const maske = typeof a.parametreler.maske === 'string' && a.parametreler.maske.includes('#') ? a.parametreler.maske : null;
    if (neden) {
      const ad = degisken(`alan:${a.anahtar}`, a.anahtar, `${a.etiket} (${neden})`);
      if (maske) { yardimcilar.add('maske'); return { ifade: `maskeUygula(${s(maske)}, ${envIfadesi(ad)})`, gizli: true }; }
      return { ifade: envIfadesi(ad), gizli: true };
    }
    return { ifade: s(maske ? maskeUygula(maske, ham) : ham), gizli: false };
  };

  // --- Yer tutucular ({ad}): giriş ek alanları → ortam değişkeni; bağlam profili değerleri → düz (adı gizliyse ortam değişkeni).
  /**
   * @param {string} metin @param {(ad: string) => { duz: string } | { env: string }} coz @param {boolean} [regex]
   */
  const metinIfadesi = (metin, coz, regex = false) => {
    const m = String(metin);
    if (!m.match(YER_TUTUCU)) return s(m);
    let sonuc = '';
    let son = 0;
    for (const e of m.matchAll(YER_TUTUCU)) {
      sonuc += sablonKacis(m.slice(son, e.index));
      const c = coz(e[1]);
      if ('duz' in c) sonuc += sablonKacis(regex ? regexKacis(c.duz) : c.duz);
      else {
        if (regex) yardimcilar.add('regexKacis');
        sonuc += regex ? `\${regexKacis(${envIfadesi(c.env)})}` : `\${${envIfadesi(c.env)}}`;
      }
      son = (e.index ?? 0) + e[0].length;
    }
    sonuc += sablonKacis(m.slice(son));
    return `\`${sonuc}\``;
  };

  /** Tarif adımının hedefi → locator ifadesi. @param {any} h @param {(ad: string) => any} coz @param {boolean} [tumu] */
  const hedefIfadesi = (h, coz, tumu = false) => {
    if ('rol' in h) return `page.getByRole(${s(h.rol)} as Parameters<Page['getByRole']>[0], { name: ${metinIfadesi(h.ad, coz)} })${tumu ? '' : '.first()'}`;
    let l = `page.locator(${metinIfadesi(h.secici, coz)})`;
    if (h.metin !== undefined) {
      l += h.tamMetin
        ? `.filter({ hasText: new RegExp(${metinIfadesi(`^${regexKacisYerTutuculu(h.metin)}$`, coz, true)}) })`
        : `.filter({ hasText: ${metinIfadesi(h.metin, coz)} })`;
    }
    return tumu ? l : `${l}.first()`;
  };

  /** Tarifin genel adımı (git / bekle / tıkla / doldur / seç…) → kod satırları. @param {any} a @param {(ad: string) => any} coz @param {string} ic */
  const tarifAdimi = (a, coz, ic) => {
    const zaman = a.zamanAsimiSn ? `{ timeout: ${Number(a.zamanAsimiSn) * 1000} }` : '';
    const z = zaman ? `, ${zaman}` : '';
    /** @type {string[]} */
    const satirlar = a.aciklama ? [`${ic}// ${yorum(a.aciklama)}`] : [];
    switch (a.islem) {
      case 'git': satirlar.push(`${ic}await page.goto(${metinIfadesi(a.adres, coz)}, { waitUntil: 'domcontentloaded' });`); break;
      case 'adresBekle': satirlar.push(`${ic}await expect(page).toHaveURL(new RegExp(${metinIfadesi(a.desen, coz, true)})${z});`); break;
      case 'kosulBekle': satirlar.push(`${ic}await page.waitForFunction(${s(a.ifade)}, undefined${z});`); break;
      case 'bekle': satirlar.push(`${ic}await page.waitForTimeout(${Number(a.saniye) * 1000});`); break;
      case 'tikla': {
        const bekle = [];
        if (a.yanitBekle) bekle.push(`page.waitForResponse((r) => new URL(r.url()).pathname === ${metinIfadesi(a.yanitBekle.yol, coz)}${z})`);
        if (a.adresBekle) bekle.push(`page.waitForURL(new RegExp(${metinIfadesi(a.adresBekle, coz, true)})${z})`);
        const tik = `${hedefIfadesi(a.hedef, coz)}.click(${zaman})`;
        satirlar.push(bekle.length ? `${ic}await Promise.all([${[...bekle, tik].join(', ')}]);` : `${ic}await ${tik};`);
        break;
      }
      case 'doldur': satirlar.push(`${ic}await ${hedefIfadesi(a.hedef, coz)}.fill(${metinIfadesi(a.deger, coz)}${z});`); break;
      case 'sec': satirlar.push(`${ic}await ${hedefIfadesi(a.hedef, coz)}.selectOption(${metinIfadesi(a.deger, coz)}${z});`); break;
      case 'gorunurBekle': satirlar.push(`${ic}await expect(${hedefIfadesi(a.hedef, coz)}).toBeVisible(${zaman});`); break;
      case 'degerBekle': satirlar.push(`${ic}await expect(${hedefIfadesi(a.hedef, coz)}).toHaveValue(${metinIfadesi(a.deger, coz)}${z});`); break;
      case 'sayiBekle': satirlar.push(`${ic}await expect(${hedefIfadesi(a.hedef, coz, true)}).toHaveCount(${Number(a.sayi)}${z});`); break;
      case 'metinBekle': satirlar.push(`${ic}await expect(${hedefIfadesi(a.hedef, coz)}).toContainText(${metinIfadesi(a.metin, coz)}${z});`); break;
      default: satirlar.push(`${ic}// TODO: bilinmeyen adım (${yorum(a.islem)}) — elle tamamlayın.`);
    }
    return satirlar;
  };

  // --- Giriş fonksiyonu (tarif) ---
  const tarif = g.tarif ?? null;
  /** Giriş profilinin ortam değişkeni öneki ("NOBETCI_" ya da "NOBETCI_<PROFİL>_"). @param {string | null} profil */
  const profilOneki = (profil) => (profil ? `${DISA_AKTARMA_ON_EKI}${ortamDegiskeniParcasi(profil)}_` : DISA_AKTARMA_ON_EKI);
  /** Profil için gereken giriş değişkenleri listeye yazılır. @param {string | null} profil */
  const girisDegiskenleri = (profil) => {
    if (!tarif) return;
    const on = profilOneki(profil).slice(DISA_AKTARMA_ON_EKI.length);
    const ek = profil ? ` — giriş profili "${profil}"` : ' — ortamın giriş profili';
    degisken(`giris:${profil ?? ''}:k`, `${on}KULLANICI_ADI`, `Kullanıcı adı${ek}`);
    degisken(`giris:${profil ?? ''}:p`, `${on}PAROLA`, `Parola${ek}`);
    const ikinci = tarif.ikinciAdim;
    if (ikinci.tur === 'totp') degisken(`giris:${profil ?? ''}:t`, `${on}TOTP_ANAHTARI`, `Authenticator (TOTP) anahtarı, base32${ek}`);
    if (ikinci.tur === 'sms') degisken(`giris:${profil ?? ''}:s`, `${on}SMS_KODU`, `SMS doğrulama kodu (sabit test kodu ya da koşudan hemen önce gelen kod)${ek}`);
    for (const ad of girisEkAlanlari(tarif)) degisken(`giris:${profil ?? ''}:e:${ad}`, `${on}GIRIS_${ortamDegiskeniParcasi(ad)}`, `Giriş ek alanı "${ad}"${ek}`);
  };

  /** @returns {string[]} */
  const girisFonksiyonu = () => {
    if (!tarif) return [];
    const on = DISA_AKTARMA_ON_EKI;
    // Giriş adımlarının "{ad}" yer tutucuları giriş profilinin ek alanlarıdır: öneke göre ortam değişkeninden okunur.
    /** @param {string} m @param {boolean} [regex] */
    const girisMetni = (m, regex = false) => {
      if (!String(m).match(YER_TUTUCU)) return s(m);
      let sonuc = '';
      let son = 0;
      for (const e of String(m).matchAll(YER_TUTUCU)) {
        sonuc += sablonKacis(String(m).slice(son, e.index));
        const oku = `ortamDegeri(\`\${on}GIRIS_${ortamDegiskeniParcasi(e[1])}\`)`;
        if (regex) yardimcilar.add('regexKacis');
        sonuc += regex ? `\${regexKacis(${oku})}` : `\${${oku}}`;
        son = (e.index ?? 0) + e[0].length;
      }
      return `\`${sonuc}${sablonKacis(String(m).slice(son))}\``;
    };
    const satirlar = [
      '/**',
      ' * Giriş (ortamın giriş tarifinden). Değerler ortam değişkenlerinden okunur: varsayılan önek "NOBETCI_", başka giriş profili',
      ' * için "NOBETCI_<PROFİL>_" (dosyanın başındaki listeye bakın).',
      ' */',
      `async function girisYap(page: Page, on = ${s(on)}): Promise<void> {`,
      `  await page.goto(${s(tarif.girisAdresi)}, { waitUntil: 'domcontentloaded' });`
    ];
    for (const a of girisAdimlariniCoz(tarif)) {
      if (a.islem === 'kullaniciAdi') satirlar.push(`  await page.locator(${s(tarif.kullaniciAlani)}).first().fill(ortamDegeri(\`\${on}KULLANICI_ADI\`));`);
      else if (a.islem === 'parola') satirlar.push(`  await page.locator(${s(tarif.parolaAlani)}).first().fill(ortamDegeri(\`\${on}PAROLA\`));`);
      else if (a.islem === 'gonder') satirlar.push(`  await page.locator(${s(tarif.gonderDugmesi)}).first().click();`);
      else {
        // Genel adım: yer tutucular giriş profilinin ek alanlarıdır (öneke göre ortam değişkeni).
        if (a.aciklama) satirlar.push(`  // ${yorum(a.aciklama)}`);
        satirlar.push(...girisGenelAdimi(a, girisMetni));
      }
    }
    const ikinci = tarif.ikinciAdim;
    const sure = Number(tarif.zamanAsimiSn) * 1000;
    if (ikinci.tur !== 'yok') {
      const kodAlani = ikinci.kodAlani || 'input[autocomplete="one-time-code"], input[inputmode="numeric"]';
      satirlar.push(`  // İkinci adım (${ikinci.tur === 'totp' ? 'authenticator / TOTP' : 'SMS'}).`);
      if (!ikinci.kodAlani) satirlar.push('  // TODO: giriş tarifinde kod alanı boş (Nöbetçi otomatik bulur); aşağıdaki seçiciyi kontrol edin.');
      satirlar.push(`  const kodAlani = page.locator(${s(kodAlani)}).first();`, `  await kodAlani.waitFor({ state: 'visible', timeout: ${sure} });`);
      if (ikinci.tur === 'totp') {
        totpGerekli = true;
        yardimcilar.add('totp');
        satirlar.push('  await kodAlani.fill(totpKodu(ortamDegeri(`${on}TOTP_ANAHTARI`)));');
      } else {
        satirlar.push('  // SMS kodu: sabit test kodu ya da koşudan hemen önce gelen kod ortam değişkeniyle verilir.');
        satirlar.push('  await kodAlani.fill(ortamDegeri(`${on}SMS_KODU`));');
      }
      satirlar.push(`  await page.locator(${s(ikinci.gonderDugmesi || tarif.gonderDugmesi)}).first().click();`);
    }
    const b = tarif.basariGostergesi;
    satirlar.push('  // Giriş başarılı (tarifin başarı göstergesi).');
    if (b.tur === 'url') satirlar.push(`  await expect(page).toHaveURL(new RegExp(${s(b.deger)}), { timeout: ${sure} });`);
    else if (b.tur === 'metin') satirlar.push(`  await expect(page.getByText(${s(b.deger)}, { exact: true }).first()).toBeVisible({ timeout: ${sure} });`);
    else satirlar.push(`  await expect(page.locator(${s(b.deger)}).first()).toBeVisible({ timeout: ${sure} });`);
    satirlar.push('}');
    return satirlar;
  };

  // --- Bağlam değiştirme (tarifte varsa; senaryonun bağlam profili değerleriyle) ---
  const baglam = tarif && tarif.baglamDegistirme ? tarif.baglamDegistirme : null;
  /** @returns {string[]} */
  const baglamFonksiyonu = () => {
    if (!baglam) return [];
    const degerler = g.baglam?.degerler ?? null;
    const profil = g.baglam?.profil ?? null;
    /** @param {string} ad */
    const coz = (ad) => {
      const d = degerler ? degerler[ad] : undefined;
      if (d === undefined || d === null || gizliAdMi(ad, ekAdlar)) {
        return { env: degisken(`baglam:${ad}`, `BAGLAM_${ad}`, `${baglam.baglamTuru} bağlamı: "${ad}"${profil ? ` (profil "${profil}")` : ''}${d === undefined || d === null ? ' — profilde değer yok' : ''}`) };
      }
      return { duz: typeof d === 'string' ? d : String(d) };
    };
    const satirlar = [`/** Bağlam değiştirme (${yorum(baglam.baglamTuru)}${profil ? `: ${yorum(profil)}` : ''}; ortamın giriş tarifinden). */`, 'async function baglamiDegistir(page: Page): Promise<void> {'];
    if (!profil) satirlar.push('  // TODO: senaryonun bağlam profili yok; Nöbetçi bu senaryoyu bu hâliyle koşamaz. Değerleri elle verin.');
    for (const a of baglam.adimlar) satirlar.push(...tarifAdimi(a, coz, '  '));
    satirlar.push('}');
    return satirlar;
  };

  // --- Senaryo adımları ---
  const girisAcik = g.girisGerekli === true;
  /** @type {Set<string | null>} */
  const profiller = new Set();
  if (girisAcik) profiller.add(g.girisProfili ?? null);
  /** @type {string[]} */
  const govde = [];
  const ic = '    ';
  const beklenen = plan.beklenen;
  let canlidaDurdu = false;
  let skipYazildi = false;

  /** Alanın doldurma satırları (alan() geri çağrısının gövdesi). @param {import('./model-kosusu.d.mts').PlanAlani} a @param {string} adimBasligi */
  const doldurmaSatirlari = (a, adimBasligi) => {
    const i2 = `${ic}  `;
    /** @type {string[]} */
    const satirlar = [];
    const d = a.deger;
    const secimli = a.tip === 'secim' || a.tip === 'okluSecim' || a.tip === 'radyo';
    const sb = secimli ? secenekBul(a.secenekler, d) : null;
    const gizli = gizliNedeni(a);
    if (a.doldurucu === 'degerJs' || a.doldurucu === 'ozelSecim') {
      yardimcilar.add('degerJs');
      // Özel açılır liste (gizli <select> + görünen aramalı kutu): dışa aktarılan kod gizli listeye değer yazar (input/change);
      // Nöbetçi koşucusu önce görünen kutudan aramayla seçer.
      if (a.doldurucu === 'ozelSecim') satirlar.push(`${i2}// Özel açılır liste: değer gizli listeye yazılır (sayfa değişikliği görmüyorsa kutuya tıklayıp seçeneği seçin).`);
      if (gizli) { const v = degerIfadesi(a).ifade; satirlar.push(`${i2}await degerJsIleYaz(l, ${v}, ${v});`); }
      else {
        const v = sb ? { deger: sb.deger, metin: sb.metin } : { deger: String(degerIfadesiDuz(a)), metin: String(degerIfadesiDuz(a)) };
        satirlar.push(`${i2}await degerJsIleYaz(l, ${s(v.deger)}, ${s(v.metin)});`);
      }
      return satirlar;
    }
    switch (a.tip) {
      case 'okluSecim': {
        yardimcilar.add('okluSec');
        const y = a.yardimci ?? {};
        const yonler = [y.ileri ?? y.arttir, y.geri ?? y.azalt].filter(Boolean);
        const maks = Number(a.parametreler.maksDeneme) > 0 ? Number(a.parametreler.maksDeneme) : 12;
        const yanit = typeof a.parametreler.yanitBekle === 'string' && a.parametreler.yanitBekle ? s(a.parametreler.yanitBekle) : 'null';
        const hedef = gizli ? degerIfadesi(a).ifade : s(sb?.metin ?? d);
        satirlar.push(`${i2}await okluSec(page, l, [${yonler.map(s).join(', ')}], ${hedef}, ${maks}, ${yanit});`);
        break;
      }
      case 'secim': {
        yardimcilar.add('secimYap');
        const gerekirse = a.doldurucu === 'secimGerekirse' ? ', true' : '';
        if (gizli) { const v = degerIfadesi(a).ifade; satirlar.push(`${i2}await secimYap(page, l, ${v}, ${v}${gerekirse});`); }
        else satirlar.push(`${i2}await secimYap(page, l, ${s(sb?.deger ?? d)}, ${s(sb?.metin ?? d)}${gerekirse});`);
        break;
      }
      case 'radyo': {
        let hedef;
        if (sb?.secici && !gizli) hedef = `page.locator(${s(sb.secici)})`;
        else if (gizli) hedef = `page.locator(${s(a.secici)}).and(page.locator(\`[value="\${${degerIfadesi(a).ifade}.replace(/["\\\\]/g, '\\\\$&')}"]\`))`;
        else hedef = `page.locator(${s(a.secici)}).and(page.locator(${s(`[value="${String(sb?.deger ?? d).replace(/["\\]/g, '\\$&')}"]`)}))`;
        if (a.doldurucu === 'radyoZorla') { yardimcilar.add('zorla'); satirlar.push(`${i2}await zorlaIsaretle(${hedef}.first(), true);`); }
        else satirlar.push(`${i2}await ${hedef}.first().check();`);
        break;
      }
      case 'onayKutusu': {
        const isaretli = d === true || d === 'true';
        if (a.doldurucu === 'onayKutusuZorla') { yardimcilar.add('zorla'); satirlar.push(`${i2}await zorlaIsaretle(l, ${isaretli});`); }
        else satirlar.push(`${i2}await l.setChecked(${isaretli});`);
        break;
      }
      case 'tarih': {
        // Göreli tarih ("bugün+7"): dışa aktarılan kod da tarihi koşu anında hesaplar (sabit tarih yazılmaz; tarih geçince kırılmaz).
        const gi = !gizli && a.goreliIfade ? goreliIfadeAyristir(a.goreliIfade) : null;
        if (gi) {
          yardimcilar.add('goreliTarih');
          satirlar.push(`${i2}// ${yorum(a.etiket)}: ${yorum(a.goreliIfade)} (koşu gününe göre)`);
        }
        const v = gi ? `goreliTarih(${s(gi.taban)}, ${gi.gun}, ${s(a.tarihBicimi || 'gg.aa.yyyy')})` : degerIfadesi(a).ifade;
        if (a.doldurucu === 'tarihJs') {
          satirlar.push(`${i2}await l.evaluate((e, v) => {`, `${i2}  (e as HTMLInputElement).value = v;`,
            `${i2}  e.dispatchEvent(new Event('input', { bubbles: true }));`, `${i2}  e.dispatchEvent(new Event('change', { bubbles: true }));`, `${i2}}, ${v});`);
        } else satirlar.push(`${i2}await l.fill(${v});`);
        break;
      }
      case 'dosya': {
        const ref = referansCoz(d);
        if (ref) {
          const ad = degisken(`dosya:${a.anahtar}`, `DOSYA_${a.anahtar}`, `${a.etiket}: yüklenecek dosyanın TAM yolu (Nöbetçi'de şifreli senaryo dosyası "${ref.ad}")`);
          satirlar.push(`${i2}// Şifreli senaryo dosyası ("${yorum(ref.ad)}") Nöbetçi dışında yoktur: dosyanın yolunu ortam değişkeniyle verin.`);
          satirlar.push(`${i2}await l.setInputFiles(${envIfadesi(ad)});`);
        } else if (gizli) {
          satirlar.push(`${i2}await l.setInputFiles(join(YUKLEME_KLASORU, ${degerIfadesi(a).ifade}));`);
          dosyaDegiskeni = true;
        } else {
          satirlar.push(`${i2}await l.setInputFiles(join(YUKLEME_KLASORU, ${s(d)}));`);
          dosyaDegiskeni = true;
        }
        break;
      }
      default: {
        const v = degerIfadesi(a).ifade;
        if (a.doldurucu === 'secimGerekirse') satirlar.push(`${i2}if ((await l.inputValue().catch(() => null)) === ${v}) return;`);
        if (a.doldurucu === 'tuslayarakYaz' || a.doldurucu === 'telefonTuslama') {
          satirlar.push(`${i2}await l.fill('');`, `${i2}await l.pressSequentially(${v}, { delay: 25 });`);
        } else satirlar.push(`${i2}await l.fill(${v});`);
      }
    }
    // Alan sonrası (doldurucu parametreleri): tuş, katman gizleme, tıklama, koşul bekleme.
    const p = a.parametreler;
    if (typeof p.tus === 'string' && p.tus) satirlar.push(`${i2}await l.press(${s(p.tus)});`);
    if (typeof p.gizle === 'string' && p.gizle) {
      satirlar.push(`${i2}await page.locator(${s(p.gizle)}).evaluateAll((ogeler) => { for (const e of ogeler) (e as HTMLElement).style.display = 'none'; }).catch(() => undefined);`);
    }
    if (typeof p.tikla === 'string' && p.tikla) satirlar.push(`${i2}await page.locator(${s(p.tikla)}).filter({ visible: true }).first().click({ timeout: 15_000 });`);
    const b = p.bekle;
    if (nesneMi(b) && typeof b.secici === 'string') {
      const ms = Number(b.zamanAsimiSn) > 0 ? Number(b.zamanAsimiSn) * 1000 : 20_000;
      if (b.durum === 'gorunur' || b.durum === 'gizli') satirlar.push(`${i2}await page.locator(${s(b.secici)}).first().waitFor({ state: '${b.durum === 'gizli' ? 'hidden' : 'visible'}', timeout: ${ms} });`);
      else {
        yardimcilar.add('doluBekle');
        satirlar.push(`${i2}await doluBekle(page, ${s(b.secici)}, ${ms}${typeof b.icermez === 'string' && b.icermez ? `, ${s(b.icermez)}` : ''});`);
      }
    }
    void adimBasligi;
    return satirlar;
  };

  /** @param {import('./model-kosusu.d.mts').PlanAlani} a */
  function degerIfadesiDuz(a) {
    const maske = typeof a.parametreler.maske === 'string' ? a.parametreler.maske : null;
    return maske ? maskeUygula(maske, a.deger) : a.deger;
  }

  /** Çerçeve (iframe) zinciri → Playwright kapsam ifadesi ("page" ya da "page.frameLocator(…)…"). @param {string[] | undefined | null} c */
  const kapsamIfadesi = (c) => `page${(c ?? []).map((x) => `.frameLocator(${s(x)})`).join('')}`;
  /** @param {any} kosu @param {number} sureSn */
  const aksiyonSatirlari = (kosu, sureSn) => {
    /** @type {string[]} */
    const satirlar = [];
    for (const a of kosu?.aksiyonlar ?? []) {
      if (a.aciklama) satirlar.push(`${ic}// ${yorum(a.aciklama)}`);
      if (a.tur === 'bekle' && a.sureSn && !a.secici) { satirlar.push(`${ic}await page.waitForTimeout(${Number(a.sureSn) * 1000});`); continue; }
      if (!a.secici) continue;
      // Öğe bir çerçevedeyse (iframe) o çerçevede aranır.
      const l = `${kapsamIfadesi(a.cerceve)}.locator(${s(a.secici)})${a.metin ? `.filter({ hasText: ${s(a.metin)} })` : ''}`;
      if (a.cerceve?.length && a.durum === 'dolu') satirlar.push(`${ic}// TODO: öğe bir çerçevede (${yorum(a.cerceve.join(' › '))}); doluBekle ana sayfada arar.`);
      // Görünürse bas (ör. her ekranda çıkmayan ara pencere düğmesi): kısa bekleme, görünmezse atlanır.
      if (a.tur === 'tikla' && a.kosul === 'gorunurse') {
        const kisa = (a.zamanAsimiSn ?? GORUNURSE_BEKLEME_SN) * 1000;
        satirlar.push(`${ic}{`, `${ic}  const oge = ${l}.filter({ visible: true }).first();`,
          `${ic}  await oge.waitFor({ state: 'visible', timeout: ${kisa} }).catch(() => undefined);`,
          `${ic}  if (await oge.isVisible()) await oge.click({ timeout: ${sureSn * 1000} });`, `${ic}}`);
        continue;
      }
      const zaman = (a.zamanAsimiSn ?? sureSn) * 1000;
      if (a.tur === 'tikla') satirlar.push(`${ic}await ${l}.filter({ visible: true }).first().click({ timeout: ${zaman} });`);
      else if (a.durum === 'dolu') { yardimcilar.add('doluBekle'); satirlar.push(`${ic}await doluBekle(page, ${s(a.secici)}, ${zaman});`); }
      else satirlar.push(`${ic}await ${l}.first().waitFor({ state: '${a.durum === 'gizli' ? 'hidden' : 'visible'}', timeout: ${zaman} });`);
    }
    return satirlar;
  };

  /** @param {import('./model-kosusu.d.mts').PlanAdimi} adim */
  const sonucSatirlari = (adim) => {
    const kosu = adim.kosu;
    const sureMs = (kosu?.zamanAsimiSn ?? 30) * 1000;
    const hataSecici = kosu?.hataGostergesi?.secici ? s(kosu.hataGostergesi.secici) : 'null';
    if (beklenen.tur === 'hata' && beklenen.adim === adim.id) {
      yardimcilar.add('gosterge');
      const liste = beklenen.mesajlar.length ? beklenen.mesajlar : [beklenen.mesaj];
      return [
        `${ic}// Beklenen sonuç: iş kuralı uyarısı (${liste.length > 1 ? 'herhangi biri' : 'toleranslı eşleşme'}).`,
        `${ic}await beklenenUyariyiBekle(page, { adim: ${s(adim.baslik)}, beklenenler: [${liste.map(s).join(', ')}], hataSecici: ${hataSecici}, sureMs: ${sureMs} });`
      ];
    }
    if (!kosu || (!kosu.basariGostergesi && !kosu.hataGostergesi && !kosu.uyarilar?.length)) return [];
    const bg = kosu.basariGostergesi;
    const secenekler = !bg ? [] : bg.tur === 'veya' ? bg.secenekler : [bg];
    /** @type {string[]} */
    const satirlar = [];
    const uyarilar = kosu.uyarilar ?? [];
    if (uyarilar.length) {
      satirlar.push(`${ic}// Akışın kabul ettiği uyarılar (başarı beklenirken biri görünürse adım başarısız):`);
      for (const u of uyarilar) satirlar.push(`${ic}//   - "${yorum(u.metin)}"${u.secici ? ` (${yorum(u.secici)})` : ''}`);
    }
    // Tek, basit gösterge ve hata göstergesi / uyarı yoksa doğrudan Playwright beklentisi.
    if (secenekler.length === 1 && !kosu.hataGostergesi && !uyarilar.length && (secenekler[0].tur === 'eleman' || secenekler[0].tur === 'url')) {
      const x = secenekler[0];
      satirlar.push(x.tur === 'eleman'
        ? `${ic}await expect(${kapsamIfadesi(x.cerceve)}.locator(${s(x.deger)}).filter({ visible: true }).first()).toBeVisible({ timeout: ${sureMs} });`
        : `${ic}await expect(page).toHaveURL(new RegExp(${s(x.deger)}), { timeout: ${sureMs} });`);
      return satirlar;
    }
    yardimcilar.add('gosterge');
    if ([...secenekler, ...uyarilar, ...(kosu.hataGostergesi ? [kosu.hataGostergesi] : [])].some((x) => /** @type {{ cerceve?: string[] }} */ (x).cerceve?.length)) {
      satirlar.push(`${ic}// TODO: göstergelerden biri bir çerçevede (iframe); aşağıdaki denetim ana sayfada arar.`);
    }
    const g2 = secenekler.map((x) => `{ tur: '${x.tur}', deger: ${s(x.deger)}${x.secici ? `, secici: ${s(x.secici)}` : ''} }`);
    const u2 = uyarilar.map((u) => `{ metin: ${s(u.metin)}${u.secici ? `, secici: ${s(u.secici)}` : ''} }`);
    satirlar.push(`${ic}await basariBekle(page, { adim: ${s(adim.baslik)}, basari: [${g2.join(', ')}], hataSecici: ${hataSecici}, uyarilar: [${u2.join(', ')}], sureMs: ${sureMs} });`);
    return satirlar;
  };

  // Giriş değişkenleri alanlardan ÖNCE adlandırılır (kodda sabit adla okunurlar; çakışan alan adı sayı eki alır).
  if (girisAcik) girisDegiskenleri(g.girisProfili ?? null);
  if (girisAcik) {
    if (tarif) govde.push(`  await test.step('Sisteme giriş yapılır', async () => {`, `    await girisYap(page${g.girisProfili ? `, ${s(profilOneki(g.girisProfili))}` : ''});`, '  });');
    else govde.push('  // TODO: bu ortamda giriş tarifi tanımlı değil (Nöbetçi > Ayarlar > Giriş tarifi); giriş adımlarını elle ekleyin.');
    if (baglam) govde.push(`  await test.step(${s(`Bağlam değiştirilir (${g.baglam?.profil ?? '—'})`)}, async () => {`, '    await baglamiDegistir(page);', '  });');
  } else {
    govde.push('  // Giriş yapılmaz (senaryonun giriş seçimi "Girişsiz" ya da ekran giriş gerektirmiyor).');
  }
  // Akışın başındaki ortak akışlar (plan: ekranAcilmadan) ekran açılmadan önce koşar (model-kosucu.ts ile aynı sıra).
  let ekranAcildi = false;
  const ekraniAc = () => {
    if (ekranAcildi) return;
    ekranAcildi = true;
    govde.push(`  await test.step('Ekran açılır', async () => {`, `    await page.goto(${s(plan.ekranUrl)}, { waitUntil: 'domcontentloaded' });`, '  });');
  };
  if (plan.adimlar.some((a) => a.dahil && a.ekranAcilmadan)) {
    govde.push(girisAcik ? '  // Baştaki ortak akışlar ekran açılmadan önce, girişten sonra açılan sayfada koşar.'
      : '  // Baştaki ortak akışlar ekran açılmadan önce, ortamın taban adresinde koşar.');
    if (!girisAcik) govde.push("  await page.goto(TABAN_ADRES, { waitUntil: 'domcontentloaded' });");
  } else ekraniAc();

  for (const adim of plan.adimlar) {
    if (!adim.dahil) continue;
    if (!adim.ekranAcilmadan) ekraniAc();
    if ((adim.yalnizTest || canlidaDurdu) && g.canli === true) {
      const beklenenSira = beklenen.tur === 'hata' ? plan.adimlar.findIndex((x) => x.id === /** @type {{ adim: string }} */ (beklenen).adim) : -1;
      govde.push(`  // ${yorum(adim.baslik)}: yalnızca test ortamında koşar (bu ortam riskli / canlı) — atlandı.`);
      if (beklenenSira >= plan.adimlar.indexOf(adim) && !skipYazildi) {
        govde.push(`  test.skip(true, ${s(`Beklenen iş kuralı hatası “${adim.baslik}” ya da sonraki bir adımda; bu adım yalnızca test ortamında koşar.`)});`);
        skipYazildi = true;
      }
      canlidaDurdu = true;
      if (adim.sonAdim) break;
      continue;
    }
    govde.push(`  await test.step(${s(adim.baslik)}, async () => {`);
    if (adim.ortakAkisAdi) govde.push(`${ic}// Ortak akış: ${yorum(adim.ortakAkisAdi)}`);
    if (adim.sql) {
      const sql = adim.sql;
      govde.push(`${ic}// Nöbetçi'de koşar: SQL kontrolü — sorgu ortamın veritabanında çalıştırılıp beklenenle karşılaştırılır.`);
      for (const satir of String(sql.sql).split(/\r?\n/)) govde.push(`${ic}//   ${yorum(satir)}`);
      govde.push(`${ic}//   Beklenen: ${yorum(JSON.stringify(sql.beklenen))}`);
      if (sql.okumalar?.length) govde.push(`${ic}//   Okunan değerler: ${yorum(sql.okumalar.map((o) => o.ad).join(', '))}`);
      govde.push(`${ic}// TODO: bu kontrol Nöbetçi dışında yok; gerekiyorsa kendi veritabanı istemcinizle ekleyin.`, '  });');
      if (adim.sonAdim) break;
      continue;
    }
    if (adim.dosya) {
      // İndirilen dosyayı doğrulama (Nöbetçi'ye özgü; dosyalar/dosya-icerigi.mjs): indirme Playwright'la yapılır, içerik beklentileri
      // (CSV / XLSX / PDF / metin ayrıştırma) Nöbetçi dışında yok → yorum + TODO. Gizli tablo değeri taşıyan beklenti maskelenir.
      const dosya = adim.dosya;
      /** @param {unknown} d */
      const maskeli = (d) => (d !== null && d !== undefined && gizliDegerler.has(String(d)) ? '***' : d);
      govde.push(`${ic}// Nöbetçi'de koşar: indirilen dosyayı doğrulama (${yorum(dosya.bicim)}) — dosya indirilir, beklentiler tek tek denetlenir.`);
      const tetik = dosya.tetikleyici?.secici;
      if (tetik) {
        govde.push(`${ic}const indirme = page.waitForEvent('download', { timeout: ${(dosya.zamanAsimiSn ?? 30) * 1000} });`,
          `${ic}await page.locator(${s(tetik)}).filter({ visible: true }).first().click();`,
          `${ic}const indirilen = await indirme;`,
          `${ic}expect(indirilen.suggestedFilename()).toBeTruthy();`);
      } else govde.push(`${ic}// TODO: indirmeyi başlatan düğme tanımlı değil; elle ekleyin.`);
      for (const b of Array.isArray(dosya.beklentiler) ? dosya.beklentiler : []) {
        govde.push(`${ic}//   Beklenti: ${yorum(beklentiAdi({ ...b, deger: maskeli(b.deger), ...(b.satir?.deger !== undefined ? { satir: { ...b.satir, deger: maskeli(b.satir.deger) } } : {}) }))}`);
      }
      govde.push(`${ic}// TODO: dosya içeriği doğrulaması Nöbetçi dışında yok; gerekiyorsa indirilen.path() ile kendi ayrıştırıcınızla ekleyin.`, '  });');
      if (adim.sonAdim) break;
      continue;
    }
    if (adim.yenidenGiris) {
      const p = adim.yenidenGiris.profil;
      if (tarif) {
        profiller.add(p);
        girisDegiskenleri(p);
        govde.push(`${ic}// Yeniden giriş${p ? ` (giriş profili "${yorum(p)}")` : ''}: oturum kapatılır, yeniden girilir, kalınan sayfaya dönülür.`,
          `${ic}const donus = page.url();`, `${ic}await page.context().clearCookies();`,
          `${ic}await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* depolama kapalı */ } }).catch(() => undefined);`,
          `${ic}await girisYap(page${p ? `, ${s(profilOneki(p))}` : ''});`);
        if (baglam) govde.push(`${ic}await baglamiDegistir(page);`);
        govde.push(`${ic}if (/^https?:/i.test(donus)) await page.goto(donus, { waitUntil: 'domcontentloaded' });`);
      } else govde.push(`${ic}// TODO: yeniden giriş adımı — ortamda giriş tarifi yok; elle ekleyin.`);
      govde.push('  });');
      if (adim.sonAdim) break;
      continue;
    }
    govde.push(`${ic}tarayiciUyarilari.length = 0;`);
    const sureSn = adim.kosu?.zamanAsimiSn ?? 30;
    for (const a of adim.alanlar) {
      const etiket = s(a.etiket);
      if (a.atla) {
        if (a.mutlakaGorunmeli) govde.push(`${ic}throw new Error(${s(`${a.etiket} alanı doldurulamaz (mutlaka görünmeli): ${a.atla}`)});`);
        else govde.push(`${ic}// Atlanan alan: ${yorum(a.etiket)} — ${yorum(a.atla)}`);
        continue;
      }
      const zorla = a.doldurucu === 'radyoZorla' || a.doldurucu === 'onayKutusuZorla' || a.doldurucu === 'degerJs' || a.doldurucu === 'ozelSecim';
      const sec = [a.mutlakaGorunmeli ? 'zorunlu: true' : '', zorla ? 'zorla: true' : '', a.cerceve?.length ? `cerceve: [${a.cerceve.map(s).join(', ')}]` : ''].filter(Boolean);
      const ek = sec.length ? `, { ${sec.join(', ')} }` : '';
      if (a.yalnizTus) {
        // Boş bırakılan alan (senaryo bu adımda iş kuralı uyarısı bekliyor): alana girilip tuşa basılır.
        govde.push(`${ic}// ${yorum(a.etiket)}: boş bırakılır; alandan ${yorum(a.yalnizTus)} ile çıkılır (uyarı beklenir).`, `${ic}await alan(page, ${s(a.secici)}, ${etiket}, async (l) => { await l.focus(); await l.press(${s(a.yalnizTus)}); }${ek});`);
        continue;
      }
      if (a.yalnizGorunurluk) { govde.push(`${ic}// ${yorum(a.etiket)}: yalnızca görünürlüğü denetlenir (mutlaka görünmeli).`, `${ic}await alan(page, ${s(a.secici)}, ${etiket}, null${ek});`); continue; }
      const gizli = gizliNedeni(a);
      govde.push(`${ic}// ${yorum(a.etiket)} (${yorum(a.doldurucu ?? a.tip)})${gizli ? ` — değer ortam değişkeninden (${gizli})` : ''}`);
      govde.push(`${ic}await alan(page, ${s(a.secici)}, ${etiket}, async (l) => {`, ...doldurmaSatirlari(a, adim.baslik), `${ic}}${ek});`);
    }
    govde.push(...aksiyonSatirlari(adim.kosu, sureSn));
    govde.push(...sonucSatirlari(adim));
    govde.push('  });');
    if (adim.sonAdim) break;
  }

  const girisKodu = girisAcik || profiller.size ? girisFonksiyonu() : [];
  const baglamKodu = girisAcik && baglam ? baglamFonksiyonu() : [];
  if (dosyaDegiskeni) degiskenler.set('dosya-klasoru', { ad: 'NOBETCI_YUKLEME_KLASORU', aciklama: 'Yüklenecek dosyaların klasörü (isteğe bağlı; varsayılan ./yuklenecek-dosyalar)' });

  // Yardımcıların bağımlılıkları
  for (const ad of [...yardimcilar]) for (const x of YARDIMCILAR[ad]?.gerekir ?? []) yardimcilar.add(x);
  for (const ad of [...yardimcilar]) for (const x of YARDIMCILAR[ad]?.gerekir ?? []) yardimcilar.add(x);

  const k = g.kaynak;
  const adimSayisi = plan.adimlar.filter((a) => a.dahil).length;
  const zorunluDegiskenler = [...degiskenler.values()].filter((d) => d.ad !== 'NOBETCI_YUKLEME_KLASORU');
  const bas = [
    '// Nöbetçi\'den dışa aktarılan Playwright testi.',
    `//   Ekran: ${yorum(k.ekran)}`,
    `//   Senaryo: ${yorum(k.senaryo)}`,
    ...(k.talepler?.length ? [`//   Talep: ${yorum(k.talepler.join(', '))}`] : []),
    `//   Model sürümü: ${k.modelSurumu ?? '—'}${k.akis ? ` · akış: ${yorum(k.akis)}` : ''}`,
    `//   Ortam: ${yorum(k.ortam)}`,
    `//   Üretim zamanı: ${yorum(k.uretim)}`,
    '//',
    '// Bu dosya Nöbetçi DIŞINDADIR: Nöbetçi\'deki değişiklikler (ekran modeli, senaryo, giriş tarifi, test verisi) buraya',
    '// yansımaz. Model değişince senaryoyu yeniden dışa aktarın. Kayıtlı oturum kullanılmaz; her koşuda yeniden giriş yapılır.',
    '// Gizli / kişisel değerler dosyaya yazılmadı: ortam değişkenlerinden okunur.',
    ...(g.bilerekBos?.length ? ['//', `// Bilerek boş bırakılan alanlar (olumsuz senaryo; kod bu alanlara değer yazmaz): ${yorum(g.bilerekBos.join(', '))}`] : []),
    '//',
    zorunluDegiskenler.length ? '// Gereken ortam değişkenleri (.env örneği — değerleri Nöbetçi\'deki giriş profilinden / test verisinden alın):' : '// Gereken ortam değişkeni yok.',
    ...zorunluDegiskenler.map((d) => `//   ${d.ad}=        # ${d.aciklama}`),
    '// İsteğe bağlı:',
    '//   NOBETCI_TABAN_ADRES=        # ortamın taban adresi (verilmezse aşağıdaki adres)',
    ...(dosyaDegiskeni ? ['//   NOBETCI_YUKLEME_KLASORU=    # yüklenecek dosyaların klasörü (varsayılan ./yuklenecek-dosyalar)'] : []),
    '//',
    '// Çalıştırma: npx playwright test <bu dosya>'
  ];
  const importlar = [
    "import { test, expect, type FrameLocator, type Locator, type Page, type Request } from '@playwright/test';",
    ...(totpGerekli ? ["import { createHmac } from 'node:crypto';"] : []),
    ...(dosyaDegiskeni ? ["import { join } from 'node:path';"] : [])
  ];
  const sabitler = [
    `const TABAN_ADRES = process.env.NOBETCI_TABAN_ADRES || ${s(g.tabanUrl)};`,
    ...(dosyaDegiskeni ? ["const YUKLEME_KLASORU = process.env.NOBETCI_YUKLEME_KLASORU || 'yuklenecek-dosyalar';"] : [])
  ];
  const yardimciKodu = YARDIMCI_SIRASI.filter((ad) => yardimcilar.has(ad)).map((ad) => YARDIMCILAR[ad].kod);
  const testSuresi = (adimSayisi + (girisAcik ? 2 : 0) + 1) * 30_000 + 30_000;
  const icerik = [
    ...bas, '', ...importlar, '', ...sabitler, '', ...yardimciKodu.flatMap((x) => [x, '']),
    ...(girisKodu.length ? [...girisKodu, ''] : []),
    ...(baglamKodu.length ? [...baglamKodu, ''] : []),
    'test.use({ baseURL: TABAN_ADRES });',
    '',
    `test(${s(k.senaryo)}, async ({ page }) => {`,
    `  test.setTimeout(${testSuresi});`,
    '  sayfayiHazirla(page);',
    ...govde,
    '});',
    ''
  ].join('\n');
  return {
    dosyaAdi: disaAktarmaDosyaAdi(k.senaryo),
    icerik,
    ortamDegiskenleri: zorunluDegiskenler.map((d) => ({ ad: d.ad, aciklama: d.aciklama }))
  };
}

/** Düzenli ifade içinde kullanılacak metnin yer tutucuları korunarak kaçışlanması (tamMetin filtresi). @param {string} m */
function regexKacisYerTutuculu(m) {
  let sonuc = '';
  let son = 0;
  for (const e of String(m).matchAll(YER_TUTUCU)) {
    sonuc += regexKacis(String(m).slice(son, e.index)) + e[0];
    son = (e.index ?? 0) + e[0].length;
  }
  return sonuc + regexKacis(String(m).slice(son));
}

/** Tarifin giriş adımlarındaki ek alan adları (yer tutucular). @param {any} tarif */
function girisEkAlanlari(tarif) {
  /** @type {string[]} */
  const adlar = [];
  for (const a of girisAdimlariniCoz(tarif)) {
    for (const m of Object.values(a).flatMap((v) => (typeof v === 'string' ? [v] : nesneMi(v) ? Object.values(v).filter((x) => typeof x === 'string') : []))) {
      for (const e of String(m).matchAll(YER_TUTUCU)) if (!adlar.includes(e[1])) adlar.push(e[1]);
    }
  }
  return adlar;
}

/**
 * Giriş adımının genel (tarif) adımı: yer tutucular giriş profilinin ek alanlarıdır; ortam değişkeni önekle (on) kurulur.
 * @param {any} a @param {(m: string, regex?: boolean) => string} metin @returns {string[]}
 */
function girisGenelAdimi(a, metin) {
  const ic = '  ';
  const zaman = a.zamanAsimiSn ? `{ timeout: ${Number(a.zamanAsimiSn) * 1000} }` : '';
  const z = zaman ? `, ${zaman}` : '';
  /** @param {any} h @param {boolean} [tumu] */
  const hedef = (h, tumu = false) => {
    if ('rol' in h) return `page.getByRole(${s(h.rol)} as Parameters<Page['getByRole']>[0], { name: ${metin(h.ad)} })${tumu ? '' : '.first()'}`;
    let l = `page.locator(${metin(h.secici)})`;
    if (h.metin !== undefined) l += h.tamMetin ? `.filter({ hasText: new RegExp(${metin(`^${regexKacisYerTutuculu(h.metin)}$`, true)}) })` : `.filter({ hasText: ${metin(h.metin)} })`;
    return tumu ? l : `${l}.first()`;
  };
  switch (a.islem) {
    case 'git': return [`${ic}await page.goto(${metin(a.adres)}, { waitUntil: 'domcontentloaded' });`];
    case 'adresBekle': return [`${ic}await expect(page).toHaveURL(new RegExp(${metin(a.desen, true)})${z});`];
    case 'kosulBekle': return [`${ic}await page.waitForFunction(${s(a.ifade)}, undefined${z});`];
    case 'bekle': return [`${ic}await page.waitForTimeout(${Number(a.saniye) * 1000});`];
    case 'tikla': {
      const bekle = [];
      if (a.yanitBekle) bekle.push(`page.waitForResponse((r) => new URL(r.url()).pathname === ${metin(a.yanitBekle.yol)}${z})`);
      if (a.adresBekle) bekle.push(`page.waitForURL(new RegExp(${metin(a.adresBekle, true)})${z})`);
      const tik = `${hedef(a.hedef)}.click(${zaman})`;
      return [bekle.length ? `${ic}await Promise.all([${[...bekle, tik].join(', ')}]);` : `${ic}await ${tik};`];
    }
    case 'doldur': return [`${ic}await ${hedef(a.hedef)}.fill(${metin(a.deger)}${z});`];
    case 'sec': return [`${ic}await ${hedef(a.hedef)}.selectOption(${metin(a.deger)}${z});`];
    case 'gorunurBekle': return [`${ic}await expect(${hedef(a.hedef)}).toBeVisible(${zaman});`];
    case 'degerBekle': return [`${ic}await expect(${hedef(a.hedef)}).toHaveValue(${metin(a.deger)}${z});`];
    case 'sayiBekle': return [`${ic}await expect(${hedef(a.hedef, true)}).toHaveCount(${Number(a.sayi)}${z});`];
    case 'metinBekle': return [`${ic}await expect(${hedef(a.hedef)}).toContainText(${metin(a.metin)}${z});`];
    default: return [`${ic}// TODO: bilinmeyen giriş adımı (${yorum(a.islem)}) — elle tamamlayın.`];
  }
}
