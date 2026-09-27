// GİRİŞ SAYFASI OTOMATİK ALGILAMA (genel) — bir giriş sayfasından tarif için seçici ÖNERİSİ çıkarır,
// giriş sonrası çıkan doğrulama kodu (OTP) alanını ve CAPTCHA'yı tanır. Hiçbir proje bilgisi içermez.
// - girisFormunuAlgila(page): parola alanı → formu → kullanıcı adı = paroladan ÖNCEKİ en yakın metin/e-posta
//   alanı; gönder = formun submit düğmesi / input[type=submit|image] (yoksa "giriş/login" metinli düğme).
// - kodAlaniniAlgila(page): OTP'ye benzeyen görünür alan (autocomplete=one-time-code, ad/etiket "kod/otp/sms…",
//   sayısal ve 4–8 karakter sınırlı).
// - captchaAlgila(page): reCAPTCHA / hCaptcha / Turnstile iframe/öğe/betik izleri.
// - girisSayfasiniOner(adres): Nöbetçi > Ayarlar > "Varsayılanları öner" için: başsız tarayıcıda adresi açar,
//   hiçbir alanı DOLDURMAZ/GÖNDERMEZ, yalnızca DOM'a bakar. YALNIZCA kullanıcı açıkça isteyince çağrılır.
// Sayfa içinde çalışan fonksiyonlar (page.evaluate) kendi içinde bağımsızdır (dış değişkene erişmez).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).

/**
 * SAYFA İÇİ: benzersiz ve okunur bir seçici üretir (id → name → tür + sıra). Diğer sayfa içi
 * fonksiyonlara metin olarak gömülür (bkz. seciciUretKaynagi).
 * @param {Element} el
 */
function seciciUret(el) {
  const kacis = (/** @type {string} */ d) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(d) : d.replace(/[^A-Za-z0-9_-]/g, '\\$&'));
  const tekMi = (/** @type {string} */ s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const etiket = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  if (id && !/^\d/.test(id) && tekMi(`#${kacis(id)}`)) return `#${kacis(id)}`;
  const ad = el.getAttribute('name');
  if (ad) {
    const s = `${etiket}[name="${ad.replace(/"/g, '\\"')}"]`;
    if (tekMi(s)) return s;
  }
  const tur = el.getAttribute('type');
  const temel = tur ? `${etiket}[type="${tur}"]` : etiket;
  const hepsi = [...document.querySelectorAll(temel)];
  const sira = hepsi.indexOf(el);
  return sira <= 0 ? temel : `${temel} >> nth=${sira}`;
}
const SECICI_URET_KAYNAGI = seciciUret.toString();

/**
 * SAYFA İÇİ (metin olarak gömülür): giriş formu önerisi.
 * @returns {{ bulundu: boolean; neden?: string; kullaniciAlani?: string; parolaAlani?: string; gonderDugmesi?: string; formVar?: boolean; notlar: string[] }}
 */
function sayfadaGirisFormu() {
  const notlar = [];
  // @ts-ignore — seciciUret metin olarak aynı kapsama eklenir
  const secici = seciciUret;
  const gorunur = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const parolalar = [...document.querySelectorAll('input[type="password"]')].filter(gorunur);
  if (!parolalar.length) return { bulundu: false, neden: 'Sayfada görünür bir parola alanı bulunamadı.', notlar };
  if (parolalar.length > 1) notlar.push(`${parolalar.length} parola alanı var; ilki kullanıldı (kayıt/parola değiştirme formu olabilir).`);
  const parola = parolalar[0];
  const form = parola.closest('form');
  const kapsam = form ?? document;
  const metinTurleri = ['text', 'email', 'tel', ''];
  const adaylar = [...kapsam.querySelectorAll('input')].filter((el) => {
    const t = (el.getAttribute('type') ?? '').toLowerCase();
    return metinTurleri.includes(t) && gorunur(el) && !el.disabled && !el.readOnly;
  });
  // Paroladan önce gelenler (belge sırası); en yakını (sonuncusu). autocomplete=username/email öncelikli.
  const once = adaylar.filter((el) => el.compareDocumentPosition(parola) & Node.DOCUMENT_POSITION_FOLLOWING);
  const otomatik = once.find((el) => /username|email/i.test(el.getAttribute('autocomplete') ?? ''));
  const kullanici = otomatik ?? once[once.length - 1] ?? adaylar[0];
  if (!kullanici) notlar.push('Kullanıcı adı alanı bulunamadı (yalnızca parola soran bir sayfa olabilir).');
  const dugmeSecici = 'button, input[type="submit"], input[type="image"], [role="button"]';
  const dugmeler = [...kapsam.querySelectorAll(dugmeSecici)].filter((el) => gorunur(el) && !(/** @type {HTMLButtonElement} */ (el).disabled));
  const gonderilebilir = (/** @type {Element} */ el) => {
    const etiket = el.tagName.toLowerCase();
    const tur = (el.getAttribute('type') ?? '').toLowerCase();
    if (etiket === 'input') return tur === 'submit' || tur === 'image';
    if (etiket === 'button') return tur === '' || tur === 'submit';
    return false;
  };
  const metinli = (/** @type {Element} */ el) => /giri[şs]|login|log in|sign in|oturum a[çc]|devam|g[öo]nder|submit/i.test(
    `${el.textContent ?? ''} ${el.getAttribute('value') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('alt') ?? ''} ${el.getAttribute('id') ?? ''}`
  );
  const sonra = (/** @type {Element} */ el) => Boolean(parola.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const gonder = dugmeler.find((el) => gonderilebilir(el) && sonra(el))
    ?? dugmeler.find(gonderilebilir)
    ?? dugmeler.find((el) => metinli(el) && sonra(el))
    ?? dugmeler.find(metinli)
    ?? [...document.querySelectorAll('a, [onclick]')].find((el) => gorunur(el) && metinli(el) && sonra(el));
  if (!gonder) notlar.push('Giriş düğmesi bulunamadı; Enter tuşuyla gönderilen bir form olabilir.');
  if (!form) notlar.push('Parola alanı bir <form> içinde değil (tek sayfa uygulaması olabilir); seçiciler sayfa geneline göre önerildi.');
  return {
    bulundu: true,
    formVar: Boolean(form),
    kullaniciAlani: kullanici ? secici(kullanici) : '',
    parolaAlani: secici(parola),
    gonderDugmesi: gonder ? secici(gonder) : '',
    notlar
  };
}

/**
 * SAYFA İÇİ (metin olarak gömülür): OTP'ye benzeyen görünür alan.
 * @param {string[]} haric bu seçicilere uyan öğeler aday sayılmaz (kullanıcı/parola alanı)
 * @returns {string | null}
 */
function sayfadaKodAlani(haric) {
  // @ts-ignore — seciciUret metin olarak aynı kapsama eklenir
  const secici = seciciUret;
  const gorunur = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const haricOgeler = new Set();
  for (const s of haric) { try { document.querySelectorAll(s).forEach((e) => haricOgeler.add(e)); } catch { /* geçersiz seçici */ } }
  const girdiler = [...document.querySelectorAll('input')].filter((el) => {
    const t = (el.getAttribute('type') ?? 'text').toLowerCase();
    return ['text', 'tel', 'number', 'password', ''].includes(t) && gorunur(el) && !el.disabled && !haricOgeler.has(el);
  });
  const etiketMetni = (/** @type {HTMLInputElement} */ el) => {
    const id = el.getAttribute('id');
    const etiket = id ? document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`) : el.closest('label');
    return `${el.getAttribute('name') ?? ''} ${id ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${etiket?.textContent ?? ''}`;
  };
  const puan = (/** @type {HTMLInputElement} */ el) => {
    let p = 0;
    if ((el.getAttribute('autocomplete') ?? '').toLowerCase() === 'one-time-code') p += 5;
    if (/otp|one.?time|2fa|mfa|totp|auth.?code|authcode|verif|do[ğg]rulama|onay kodu|sms|g[üu]venlik kodu|kod|code|token|pin/i.test(etiketMetni(el))) p += 3;
    const enFazla = Number(el.getAttribute('maxlength'));
    if (enFazla >= 4 && enFazla <= 8) p += 2;
    if (/numeric|decimal/i.test(el.getAttribute('inputmode') ?? '') || /\\d|\[0-9\]/.test(el.getAttribute('pattern') ?? '')) p += 1;
    return p;
  };
  const sirali = girdiler.map((el) => ({ el, p: puan(el) })).filter((x) => x.p >= 3).sort((a, b) => b.p - a.p);
  return sirali.length ? secici(sirali[0].el) : null;
}

/**
 * SAYFA İÇİ (metin olarak gömülür): CAPTCHA izleri (kanıt listesi; boşsa yok).
 * @returns {string[]}
 */
function sayfadaCaptcha() {
  // NOT: Yalnızca EKRANDA GÖRÜNEN CAPTCHA engel sayılır. Bazı uygulamalar (ör. birkaç hatalı
  // denemeden sonra açılan) CAPTCHA alanını sayfada gizli tutar; gizli öğe ya da yalnızca yüklenmiş
  // bir betik (görünmez reCAPTCHA v3 gibi) girişi engellemez, o yüzden kanıt sayılmaz.
  const gorunur = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const kanit = [];
  const desen = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|captcha/i;
  for (const f of document.querySelectorAll('iframe')) {
    const kaynak = `${f.getAttribute('src') ?? ''} ${f.getAttribute('title') ?? ''}`;
    if (desen.test(kaynak) && gorunur(f)) kanit.push(`iframe: ${kaynak.trim().slice(0, 80)}`);
  }
  const seciciler = ['.g-recaptcha', '.h-captcha', '.cf-turnstile', '[data-sitekey]', '#captcha', '.captcha', 'img[src*="captcha" i]', 'input[name*="captcha" i]', 'textarea[name="g-recaptcha-response"]'];
  for (const s of seciciler) {
    if ([...document.querySelectorAll(s)].some(gorunur)) kanit.push(`öğe: ${s}`);
  }
  return kanit;
}

/** seciciUret'i de içeren, page.evaluate'e verilecek fonksiyon kaynağı. @param {Function} fn @param {unknown} [arg] */
function sayfaIfadesi(fn, arg) {
  return `(() => { ${SECICI_URET_KAYNAGI}; return (${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)}); })()`;
}

/**
 * Giriş formu önerisi. Parola alanı henüz yoksa (tek sayfa uygulaması, gecikmeli çizim) beklemeSn kadar bekler.
 * @param {import('@playwright/test').Page} page @param {{ beklemeSn?: number }} [secenekler]
 */
export async function girisFormunuAlgila(page, secenekler = {}) {
  const bekleme = (secenekler.beklemeSn ?? 10) * 1000;
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: bekleme }).catch(() => undefined);
  return /** @type {Promise<{ bulundu: boolean; neden?: string; kullaniciAlani?: string; parolaAlani?: string; gonderDugmesi?: string; formVar?: boolean; notlar: string[] }>} */ (
    page.evaluate(sayfaIfadesi(sayfadaGirisFormu))
  );
}

/**
 * Giriş sonrası çıkan doğrulama kodu alanı (yoksa null). haric: kullanıcı/parola alanı seçicileri.
 * @param {import('@playwright/test').Page} page @param {string[]} [haric]
 * @returns {Promise<string | null>}
 */
export async function kodAlaniniAlgila(page, haric = []) {
  try {
    return /** @type {string | null} */ (await page.evaluate(sayfaIfadesi(sayfadaKodAlani, haric)));
  } catch {
    return null; // sayfa geçişi sırasında bağlam yok olabilir
  }
}

/** CAPTCHA kanıtları (boş dizi = yok). @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
export async function captchaAlgila(page) {
  try {
    return /** @type {string[]} */ (await page.evaluate(sayfaIfadesi(sayfadaCaptcha)));
  } catch {
    return [];
  }
}

export const CAPTCHA_MESAJI = 'Giriş sayfasında CAPTCHA algılandı. Test ortamında CAPTCHA kapatılmalı (ya da test kullanıcısı/IP için devre dışı bırakılmalı); otomasyon CAPTCHA çözmez.';

/**
 * Nöbetçi > Ayarlar > "Varsayılanları öner": adresi başsız tarayıcıda açar, formu ALGILAR (doldurmaz,
 * göndermez) ve tarif alanları için öneri döner. Yalnızca kullanıcı açıkça isteyince çağrılır.
 * @param {string} adres tam http(s) adresi
 * @param {{ zamanAsimiSn?: number; tarayiciSecenekleri?: import("@playwright/test").LaunchOptions; yasakDesenleri?: ReadonlyArray<{ kalip: string; desen: RegExp }> }} [secenekler]
 */
export async function girisSayfasiniOner(adres, secenekler = {}) {
  const u = new URL(adres);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Adres http(s) olmalıdır.');
  // Yasak adresler (Ayarlar > Güvenlik + ortam değişkeni): hedefin kendisi çağıran tarafından denetlenir; sayfanın yasaklı
  // host'a yönlendirmesi ya da oradan kaynak istemesi ağ katmanında iptal edilir.
  const desenler = secenekler.yasakDesenleri ?? [];
  const yasakli = (/** @type {string} */ a) => { try { const h = new URL(a).hostname.toLowerCase(); return desenler.some((d) => d.desen.test(h)); } catch { return false; } };
  if (yasakli(u.toString())) throw new Error(`${u.hostname} yasaklı adres kalıbına uyuyor (Ayarlar > Güvenlik > Yasak adresler).`);
  const { chromium } = await import('@playwright/test');
  const tarayici = await chromium.launch({ headless: true, ...(secenekler.tarayiciSecenekleri ?? {}) });
  try {
    const baglam = await tarayici.newContext();
    if (desenler.length) await baglam.route('**/*', (r) => (yasakli(r.request().url()) ? r.abort('blockedbyclient') : r.continue()));
    const page = await baglam.newPage();
    const sure = (secenekler.zamanAsimiSn ?? 20) * 1000;
    try {
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: sure });
    } catch (hata) {
      const mesaj = String(/** @type {Error} */ (hata)?.message ?? hata).split('\n')[0];
      return { bulundu: false, neden: `Sayfa açılamadı: ${mesaj.slice(0, 200)}`, notlar: [], captcha: [], sonAdres: null };
    }
    const form = await girisFormunuAlgila(page, { beklemeSn: Math.min(10, sure / 1000) });
    const captcha = await captchaAlgila(page);
    const sonAdres = page.url();
    return { ...form, captcha, sonAdres };
  } finally {
    await tarayici.close();
  }
}
