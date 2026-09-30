// EYLEM VE DOĞRULAMA KEŞFİ — Playwright tarafı (genel). eylemAdaylariniCikar(page): açık sayfadaki İZLERDEN gönderim düğmesi,
// başarı mesajı, hata alanı, yönlendirme ve bekleme göstergesi adaylarını çıkarır. HİÇBİR ŞEYE BASMAZ: tıklama, odaklama, yazma,
// form gönderimi, gezinme yoktur; yalnız DOM okunur (görünürlük, sınıf, rol, metin) ve seçici adayları Playwright ile SAYILIR.
// Puanlama ve güven düzeyi saf kurallardadır (eylem-kesfi.mjs). Seçici üretimi "Sayfada seç" ile aynıdır (oge-secme-paneli.ts >
// ogeBilgisi: rol + ad → görünen metin → kimlik → name / aria-label → CSS yolu); her aday sayfada tek eşleşme ve aynı öğe
// denetiminden geçer. Hata kapları grup seçicisiyle (ör. .invalid-feedback) verilir; koşucu hata göstergesinin görünen tüm
// öğelerini okur. Yalnız ana belge okunur (çerçevelerin içi okunmaz).
// Kullanım: otomatik tarama (tarama-motoru.ts > profilTara) ve ileride hızlı test; sunucu ucu gerekmez.
import type { Page } from '@playwright/test';
import { KALIPLAR, eylemAdaylariniDegerlendir, type EylemAdaylari, type HamEylemIzi, type HamYonlendirme } from './eylem-kesfi.mjs';
import { ogeBilgisi, type SeciciAdayi } from './oge-secme-paneli';

/** Sayfa içi ham iz: tek öğe (isaret + seçici adayları) ya da grup (grupSecici). */
type SayfaIzi = Omit<HamEylemIzi, 'secici' | 'seciciTuru' | 'kirilganlik'> & { isaret?: string; adaylar?: SeciciAdayi[]; grupSecici?: string };
type SayfaIzleri = { sayfaYolu: string; izler: SayfaIzi[]; yonlendirmeler: HamYonlendirme[]; notlar: string[] };
type TopladiAyari = { kaliplar: Record<string, string>; enCok: { dugme: number; basari: number; hata: number; bekleme: number }; onek: string };

/** Geçici öğe işaretinin öneki ("Sayfada seç"in s1, s2… işaretleriyle karışmaz). */
const ISARET_ONEKI = 'ek';

/**
 * SAYFA İÇİ (kendi içinde bağımsız): izleri toplar. Düğme ve tek öğeli izlerde window.__nobetciOgeBilgisi ile seçici adaylarını
 * üretir (öğeye geçici data-nobetci-secilen işareti konur; motor denetleyip kaldırır). Hiçbir öğeye tıklanmaz, odaklanılmaz.
 */
export function eylemIzleriniTopla(ayar: TopladiAyari): SayfaIzleri {
  const k = (ad: string): RegExp => new RegExp(ayar.kaliplar[ad], 'i');
  const katla = (m: string | null | undefined): string => (m ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/̇/g, '').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, ' ').trim();
  const bosluk = (m: string | null | undefined): string => (m ?? '').replace(/\s+/g, ' ').trim();
  const bilgi = (window as unknown as { __nobetciOgeBilgisi?: (el: Element, isaret: string) => { adaylar: SeciciAdayi[]; metin: string | null } }).__nobetciOgeBilgisi;
  const notlar: string[] = [];
  const izler: SayfaIzi[] = [];
  const yonlendirmeler: HamYonlendirme[] = [];
  let sira = 0;
  const gorunur = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cv = (e as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility;
    if (typeof cv === 'function') return cv.call(e, { checkVisibilityCSS: true });
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const konum = (e: Element): HamEylemIzi['konum'] => {
    if (!gorunur(e)) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), genislik: Math.round(r.width), yukseklik: Math.round(r.height) };
  };
  const yol = (adres: string | null): string | null => {
    if (!adres) return null;
    try {
      const u = new URL(adres, location.href);
      return u.origin === location.origin && /^https?:$/.test(u.protocol) ? u.pathname : null;
    } catch { return null; }
  };
  const nobetcininMi = (e: Element): boolean => Boolean(e.closest('[id^="nobetci"]'));
  const tekOge = (e: Element): { isaret: string; adaylar: SeciciAdayi[] } | null => {
    if (typeof bilgi !== 'function') return null;
    const isaret = `${ayar.onek}${++sira}`;
    try { return { isaret, adaylar: bilgi(e, isaret).adaylar }; } catch { return null; }
  };
  const siniflar = (e: Element): string[] => [...e.classList].map((c) => c.toLowerCase());
  const kendiMetni = (e: Element): string => bosluk([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
  const tumMetin = (e: Element): string => bosluk((e as HTMLElement).innerText || e.textContent);

  // 1) Düğmeler (görünür): button, düğme türü girdiler, role=button, onclick'li öğeler, eylem metinli bağlantılar.
  const dugmeler = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], [onclick], a[href]')]
    .filter((e) => !nobetcininMi(e) && gorunur(e));
  for (const e of dugmeler) {
    if (izler.filter((i) => i.tur === 'dugme').length >= ayar.enCok.dugme) { notlar.push(`İlk ${ayar.enCok.dugme} düğme değerlendirildi.`); break; }
    const etiket = e.tagName.toLowerCase();
    const tip = etiket === 'input' ? ((e as HTMLInputElement).type || '').toLowerCase() : etiket === 'button' ? ((e.getAttribute('type') || 'submit').toLowerCase()) : '';
    const metin = bosluk(etiket === 'input' ? e.getAttribute('value') || e.getAttribute('alt') : tumMetin(e)) || bosluk(e.getAttribute('aria-label') || e.getAttribute('title'));
    if (etiket === 'a' && !e.hasAttribute('onclick') && e.getAttribute('role') !== 'button') {
      // Bağlantı: yalnız yönlendirme adayı (eylem metinliyse düğme adayı da olur).
      const hedef = yol(e.getAttribute('href'));
      if (hedef) yonlendirmeler.push({ adres: hedef, kaynak: 'baglanti', metin: metin || null });
      if (!k('eylem').test(katla(metin))) continue;
    }
    // İç içe (ör. onclick'li kabın içindeki düğme): yalnız en içteki alınır.
    if (dugmeler.some((d) => d !== e && e.contains(d))) continue;
    const form = (e as HTMLButtonElement).form ?? e.closest('form');
    const onclick = e.getAttribute('onclick');
    const betikAdresi = onclick ? /(?:location(?:\.href)?\s*=|location\.(?:assign|replace)\()\s*['"]([^'"]+)['"]/.exec(onclick)?.[1] ?? null : null;
    if (betikAdresi && yol(betikAdresi)) yonlendirmeler.push({ adres: yol(betikAdresi) as string, kaynak: 'betik', metin: metin || null });
    const t = tekOge(e);
    if (!t) continue;
    izler.push({
      tur: 'dugme', ...t, metin: metin.slice(0, 200) || null, gizli: false, konum: konum(e),
      formIci: Boolean(form), submit: Boolean(form) && ['submit', 'image'].includes(tip), onclick: Boolean(onclick),
      devreDisi: (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true'
    });
  }
  // Form hedefleri.
  for (const f of document.querySelectorAll('form')) {
    const hedef = yol(f.getAttribute('action'));
    if (hedef) yonlendirmeler.push({ adres: hedef, kaynak: 'form', metin: null });
  }

  // 2) Başarı / hata / bekleme izleri (gizliler dahil). Aynı türde bir atası aday olan öğe atlanır.
  const adaylar = new Map<Element, 'basari' | 'hata' | 'bekleme'>();
  const atasiAday = (e: Element, tur: string): boolean => {
    for (let a = e.parentElement; a; a = a.parentElement) if (adaylar.get(a) === tur) return true;
    return false;
  };
  const kontrol = (e: Element): boolean => ['input', 'select', 'textarea', 'button', 'option'].includes(e.tagName.toLowerCase());
  const tumu = [...document.body.querySelectorAll('*')].slice(0, 6000);
  const alanaBagliKimlikler = new Set<string>();
  for (const c of document.querySelectorAll('input, select, textarea')) {
    for (const id of (c.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) alanaBagliKimlikler.add(id);
  }
  const ariaInvalid = document.querySelectorAll('[aria-invalid]').length;
  /** Hata grupları: grup seçicisi → öğeler. */
  const hataGruplari = new Map<string, { sinif: string | null; rol: string | null; ogeler: Element[] }>();
  for (const e of tumu) {
    if (nobetcininMi(e) || kontrol(e) || ['script', 'style', 'noscript', 'template', 'svg', 'path', 'br', 'hr', 'img'].includes(e.tagName.toLowerCase())) continue;
    const etiketAdi = e.tagName.toLowerCase();
    const cls = siniflar(e);
    const rol = (e.getAttribute('role') ?? '').toLowerCase() || null;
    const canli = e.hasAttribute('aria-live') && e.getAttribute('aria-live') !== 'off';
    const kMetin = katla(kendiMetni(e));
    const hataSinifi = cls.find((c) => k('alanHataSinifi').test(c)) ?? cls.find((c) => k('hataSinifi').test(c) && !/^(is|has|was|needs)-/.test(c)) ?? null;
    const bagli = Boolean(e.id && alanaBagliKimlikler.has(e.id));
    const beklemeSinifi = cls.find((c) => k('beklemeSinifi').test(c)) ?? null;
    const mesgul = e.getAttribute('aria-busy') === 'true';
    const basariSinifi = cls.find((c) => k('basariSinifi').test(c) && !/^(is|has)-/.test(c)) ?? null;
    const durumBolgesi = rol === 'status' || canli || etiketAdi === 'output';
    // İz yoksa pahalı okumalar (metin, görünürlük) yapılmaz.
    const iz = hataSinifi || rol === 'alert' || bagli || beklemeSinifi || mesgul || rol === 'progressbar' || basariSinifi || durumBolgesi
      || (kMetin && (k('beklemeMetni').test(kMetin) || k('basariMetni').test(kMetin)));
    if (!iz || ['form', 'fieldset', 'main', 'section', 'article', 'nav', 'header', 'footer', 'table', 'tbody', 'ul', 'ol'].includes(etiketAdi)) continue;
    const kisa = bosluk(e.textContent).length <= 200;
    if (!kisa) continue;
    const tam = tumMetin(e);
    const gizli = !gorunur(e);
    // Hata: bilinen hata kabı sınıfı, role=alert ya da alana aria-describedby ile bağlı hata metinli kap.
    if (hataSinifi || rol === 'alert' || (bagli && k('hataMetni').test(katla(tam)))) {
      if (!atasiAday(e, 'hata')) {
        adaylar.set(e, 'hata');
        const anahtar = hataSinifi ? `.${CSS.escape(hataSinifi)}` : rol === 'alert' ? '[role="alert"]' : `#${CSS.escape(e.id)}`;
        const g = hataGruplari.get(anahtar) ?? { sinif: hataSinifi, rol: hataSinifi ? null : rol, ogeler: [] };
        g.ogeler.push(e);
        hataGruplari.set(anahtar, g);
      }
      continue;
    }
    // Bekleme: sınıf, role=progressbar, aria-busy ya da bekleme metni.
    if (beklemeSinifi || rol === 'progressbar' || mesgul || (kMetin && k('beklemeMetni').test(kMetin))) {
      if (!atasiAday(e, 'bekleme') && izler.filter((i) => i.tur === 'bekleme').length < ayar.enCok.bekleme) {
        const t = tekOge(e);
        if (t) {
          adaylar.set(e, 'bekleme');
          izler.push({ tur: 'bekleme', ...t, metin: tam || null, gizli, konum: konum(e), sinif: beklemeSinifi, rol, mesgul });
        }
      }
      continue;
    }
    // Başarı: başarı sınıfı, role=status / aria-live / output, ya da GİZLİ öğede kendi metni başarı çağrıştırıyor.
    const gizliMetin = gizli && Boolean(kMetin) && k('basariMetni').test(kMetin) && !k('hataMetni').test(kMetin);
    if ((basariSinifi || durumBolgesi || gizliMetin) && !atasiAday(e, 'basari') && izler.filter((i) => i.tur === 'basari').length < ayar.enCok.basari) {
      const t = tekOge(e);
      if (t) {
        adaylar.set(e, 'basari');
        izler.push({ tur: 'basari', ...t, metin: tam || null, gizli, konum: konum(e), sinif: basariSinifi, rol, canliBolge: canli });
      }
    }
  }
  for (const [grupSecici, g] of [...hataGruplari].slice(0, ayar.enCok.hata)) {
    const ilk = g.ogeler[0];
    const metin = g.ogeler.map((e) => tumMetin(e)).find((m) => m && m.length <= 200) ?? null;
    izler.push({
      tur: 'hata', grupSecici, metin, gizli: g.ogeler.every((e) => !gorunur(e)), konum: konum(ilk), sinif: g.sinif, rol: g.rol,
      alanaBagli: g.ogeler.some((e) => (e.id && alanaBagliKimlikler.has(e.id)) || Boolean(e.previousElementSibling && kontrol(e.previousElementSibling)) || Boolean(e.parentElement?.querySelector('input, select, textarea'))),
      adet: document.querySelectorAll(grupSecici).length, ariaInvalid
    });
  }
  return { sayfaYolu: location.pathname, izler, yonlendirmeler, notlar };
}

/** Seçici adaylarının deneme sırası (oge-secme-motoru.ts > adaySirasi ile aynı kural; döngüsel içe aktarmayı önlemek için burada). */
function sirala(adaylar: SeciciAdayi[], cikti: boolean): SeciciAdayi[] {
  const sira = cikti ? ['rol', 'kimlik', 'etiket', 'rolAdsiz', 'metin', 'css'] : ['rol', 'metin', 'kimlik', 'etiket', 'rolAdsiz', 'css'];
  return adaylar.filter((a) => !(cikti && (a.tur === 'rol' || a.tur === 'metin') && /\d/.test(a.secici)))
    .map((a, i) => ({ a, i })).sort((x, y) => sira.indexOf(x.a.tur) - sira.indexOf(y.a.tur) || x.i - y.i).map((x) => x.a);
}

/**
 * Açık sayfadan eylem adaylarını çıkarır — BASMAZ. Sayfa (Page) olduğu gibi kalır: yalnız geçici işaret öznitelikleri eklenip
 * kaldırılır. Sayfa kapanırsa / okunamazsa boş küme ve not döner (hata fırlatmaz).
 */
export async function eylemAdaylariniCikar(page: Page, secenek: { dugmeSiniri?: number } = {}): Promise<EylemAdaylari> {
  const dugmeSiniri = secenek.dugmeSiniri ?? 25;
  let ham: SayfaIzleri;
  try {
    // Seçici üreticisi ("Sayfada seç"le aynı) sayfaya verilir; init betiği gerekmez.
    await page.evaluate(`window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()}; 0`);
    ham = await page.evaluate(eylemIzleriniTopla, { kaliplar: { ...KALIPLAR }, enCok: { dugme: dugmeSiniri, basari: 12, hata: 10, bekleme: 8 }, onek: ISARET_ONEKI });
  } catch (hata) {
    return eylemAdaylariniDegerlendir({ sayfaYolu: '', izler: [], yonlendirmeler: [], notlar: [`Eylem adayları okunamadı: ${String(hata instanceof Error ? hata.message : hata).split('\n')[0].slice(0, 200)}`] });
  }
  const izler: HamEylemIzi[] = [];
  try {
    for (const iz of ham.izler) {
      const { isaret, adaylar, grupSecici, ...kalan } = iz;
      if (grupSecici) {
        const n = await page.locator(grupSecici).count().catch(() => 0);
        if (n >= 1) izler.push({ ...kalan, secici: grupSecici, seciciTuru: 'css', kirilganlik: 'orta', adet: n });
        continue;
      }
      if (!isaret || !adaylar?.length) continue;
      for (const a of sirala(adaylar, iz.tur !== 'dugme')) {
        try {
          const l = page.locator(a.secici);
          if ((await l.count()) !== 1) continue;
          if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== isaret) continue;
          izler.push({ ...kalan, secici: a.secici, seciciTuru: a.tur === 'rolAdsiz' ? 'rol' : a.tur, kirilganlik: a.kirilganlik });
          break;
        } catch { /* geçersiz seçici: sonraki aday */ }
      }
    }
  } finally {
    await page.evaluate((onek) => {
      for (const e of document.querySelectorAll(`[data-nobetci-secilen^="${onek}"]`)) e.removeAttribute('data-nobetci-secilen');
      delete (window as unknown as Record<string, unknown>).__nobetciOgeBilgisi;
    }, ISARET_ONEKI).catch(() => undefined);
  }
  return eylemAdaylariniDegerlendir({ sayfaYolu: ham.sayfaYolu, izler, yonlendirmeler: ham.yonlendirmeler, notlar: ham.notlar }, secenek.dugmeSiniri ? { gonderim: secenek.dugmeSiniri } : {});
}
