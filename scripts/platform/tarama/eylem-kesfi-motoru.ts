// EYLEM VE DOĞRULAMA KEŞFİ — Playwright tarafı (genel). eylemAdaylariniCikar(page): açık sayfadaki İZLERDEN gönderim düğmesi,
// başarı mesajı, hata alanı, yönlendirme ve bekleme göstergesi adaylarını çıkarır. HİÇBİR ŞEYE BASMAZ: tıklama, odaklama, yazma,
// form gönderimi, gezinme yoktur; yalnız DOM okunur (görünürlük, sınıf, rol, metin) ve seçici adayları Playwright ile SAYILIR.
// Puanlama ve güven düzeyi saf kurallardadır (eylem-kesfi.mjs). Seçici üretimi "Sayfada seç" ile aynıdır (oge-secme-paneli.ts >
// ogeBilgisi: rol + ad → görünen metin → kimlik → name / aria-label → CSS yolu); her aday sayfada tek eşleşme ve aynı öğe
// denetiminden geçer. Hata kapları grup seçicisiyle (ör. .invalid-feedback) verilir; koşucu hata göstergesinin görünen tüm
// öğelerini okur. Yalnız ana belge okunur (çerçevelerin içi okunmaz).
// Kullanım: otomatik tarama (tarama-motoru.ts > profilTara) ve ileride hızlı test; sunucu ucu gerekmez.
import type { Frame, FrameLocator, Page } from '@playwright/test';
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

  // 0) Açık gölge kökleri (shadow DOM): düğmeler gölge köklerin içinde de aranır (Playwright'ın rol / CSS seçicileri onları deler).
  const golgeKokleri: ShadowRoot[] = [];
  const kokleriTopla = (k: ParentNode, n = 0): void => {
    for (const e of Array.from(k.querySelectorAll('*'))) {
      // Nöbetçi'nin kendi arayüzü (kayıt paneli, seçme şeridi; kimliği "nobetci" ile başlar) okunmaz.
      if (e.shadowRoot && !e.closest('[id^="nobetci"]') && golgeKokleri.length < 200) { golgeKokleri.push(e.shadowRoot); if (n < 5) kokleriTopla(e.shadowRoot, n + 1); }
    }
  };
  kokleriTopla(document);
  const derinSec = (s: string): Element[] => [...document.querySelectorAll(s), ...golgeKokleri.flatMap((k) => [...k.querySelectorAll(s)])];
  /** Öğenin atası (gölge kökü sınırında kabuğa geçer). */
  const ata = (e: Element): Element | null => e.parentElement ?? ((e.getRootNode() as ShadowRoot).host ?? null);

  // 1) Düğmeler (görünür): button, düğme türü girdiler, role=button / role=link / role=switch / role=tab / role=option / role=menuitem /
  // role=radio, onclick'li öğeler, bağlantılar ve BAĞLANTI BİÇİMLİ eylem düğmeleri (href'siz ya da "#" / "javascript:" adresli <a>,
  // işaretçi imleçli "btn" / "button" sınıflı ya da odaklanabilir öğe; tıklama dinleyiciyle bağlanmış olabilir). Yerel olmayan öğe yalnız
  // işaretçi imleci ve kısa kendi metniyle aday olur. addEventListener ile bağlanmış div / span / svg / img (öznitelik yok): imleci
  // KENDİSİ işaretçi olan (atasından devralmayan), içinde form alanı olmayan öğe — metinsizse (simge, yıldız) de aday olur.
  const ROLLER = '[role="button"], [role="link"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]:not(input)';
  const yerelEylem = (e: Element): boolean => e.matches(`button, input[type="submit"], input[type="button"], input[type="image"], a[href], ${ROLLER}, [onclick]`);
  const isaretciMi = (e: Element | null): boolean => Boolean(e) && getComputedStyle(e as Element).cursor === 'pointer';
  /** İmleci kendisi işaretçi (atası değil) ve tıklanabilir görünen yaprak benzeri öğe. */
  const kendiIsaretci = (e: Element): boolean => isaretciMi(e) && !isaretciMi(ata(e)) && !e.querySelector('input, select, textarea, button, a[href]');
  const dugmeler = derinSec(`button, input[type="submit"], input[type="button"], input[type="image"], ${ROLLER}, [onclick], a, [class*="btn"], [class*="button"], [tabindex]:not([tabindex="-1"]), div, span, li, svg, img, i`)
    .filter((e) => !nobetcininMi(e) && gorunur(e) && !e.matches('select, textarea, option, label, input:not([type="submit"]):not([type="button"]):not([type="image"])'))
    .filter((e) => {
      if (yerelEylem(e)) return true;
      if (e.matches('div, span, li, svg, img, i') && !e.matches('[class*="btn"], [class*="button"], [tabindex]:not([tabindex="-1"])')) {
        // Seçim öğesi değil (etiket / seçenek / sürükleme); kendi işaretçi imleci; çok büyük kap değil.
        if (e.closest('label, select, option, [contenteditable="true"]') || !kendiIsaretci(e)) return false;
        const r = e.getBoundingClientRect();
        return r.width * r.height <= 160_000 && tumMetin(e).length <= 40;
      }
      return isaretciMi(e) && !e.querySelector('input, select, textarea') && tumMetin(e).length > 0 && tumMetin(e).length <= 40;
    });
  /** Adres bir gezinme değil (href yok, "#", "javascript:"): bağlantı biçimli eylem düğmesi. */
  const eylemBaglantisi = (e: Element): boolean => {
    const h = (e.getAttribute('href') ?? '').trim();
    return e.getAttribute('role') === 'link' || !h || h === '#' || /^javascript:/i.test(h);
  };
  /** Erişilebilir ad: aria-label → aria-labelledby (aynı kökte) → title → svg <title>. */
  const erisilebilirAd = (e: Element): string => {
    const kok = e.getRootNode() as Document | ShadowRoot;
    const bagli = (e.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
      .map((id) => (typeof kok.getElementById === 'function' ? kok.getElementById(id) : document.getElementById(id))).map((x) => (x ? tumMetin(x) : '')).filter(Boolean).join(' ');
    return bosluk(e.getAttribute('aria-label')) || bosluk(bagli) || bosluk(e.getAttribute('title')) || bosluk(e.querySelector('title')?.textContent);
  };
  /** Aynı adlı adayları ayırt eden yakın yazı: öğenin (ya da atalarının) önceki kardeşlerindeki ilk harfli satır (ör. ürün adı, satır başlığı). */
  const baglamMetni = (e: Element, haric: string): string | null => {
    let d: Element | null = e;
    for (let i = 0; d && i < 6; i++) {
      for (let o = d.previousElementSibling; o; o = o.previousElementSibling) {
        if (o.matches('script, style, template, input, select, textarea') || !gorunur(o)) continue;
        const satir = ((o as HTMLElement).innerText || '').split('\n').map((x) => bosluk(x)).find((x) => /\p{L}/u.test(x) && katla(x) !== katla(haric));
        if (satir) return satir.slice(0, 50);
      }
      d = ata(d);
    }
    return null;
  };
  /** Düğme izlerinin öğeleri (aynı adlıları ayırt etmek için). */
  const dugmeOgeleri = new Map<SayfaIzi, Element>();
  for (const e of dugmeler) {
    if (izler.filter((i) => i.tur === 'dugme').length >= ayar.enCok.dugme) { notlar.push(`İlk ${ayar.enCok.dugme} düğme değerlendirildi.`); break; }
    const etiket = e.tagName.toLowerCase();
    const tip = etiket === 'input' ? ((e as HTMLInputElement).type || '').toLowerCase() : etiket === 'button' ? ((e.getAttribute('type') || 'submit').toLowerCase()) : '';
    // Görünen yazı simgeyse ("+", "−", "×", "▾") ya da yoksa erişilebilir ad (aria-label / aria-labelledby / title) gösterilir.
    const gorunenYazi = bosluk(etiket === 'input' ? e.getAttribute('value') || e.getAttribute('alt') : tumMetin(e));
    const metin = /[\p{L}\p{N}]/u.test(gorunenYazi) ? gorunenYazi : erisilebilirAd(e) || gorunenYazi;
    if (etiket === 'a' && !e.hasAttribute('href') && !e.hasAttribute('onclick') && !e.hasAttribute('role') && !isaretciMi(e)) continue;
    if (etiket === 'a' && !e.hasAttribute('onclick') && e.getAttribute('role') !== 'button' && !eylemBaglantisi(e)) {
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
    const iz: SayfaIzi = {
      tur: 'dugme', ...t, metin: metin.slice(0, 200) || null, gizli: false, konum: konum(e),
      formIci: Boolean(form), submit: Boolean(form) && ['submit', 'image'].includes(tip), onclick: Boolean(onclick),
      devreDisi: (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true'
    };
    izler.push(iz);
    dugmeOgeleri.set(iz, e);
  }
  // Aynı adlı (ya da adsız) düğmeler kullanıcıya ayırt edilebilir gösterilir: yakın yazıyla ("+ (Kablosuz kulaklık)", "Seç (07:40 · PG 101)"),
  // hâlâ aynıysa sırasıyla ("Genel puanınız (2/5)").
  const gruplar = new Map<string, SayfaIzi[]>();
  for (const iz of izler.filter((x) => x.tur === 'dugme')) {
    const k2 = katla(iz.metin ?? '');
    (gruplar.get(k2) ?? gruplar.set(k2, []).get(k2))?.push(iz);
  }
  for (const [, liste] of gruplar) {
    if (liste.length < 2 && liste[0]?.metin) continue;
    for (const iz of liste) {
      const e = dugmeOgeleri.get(iz);
      const b = e ? baglamMetni(e, iz.metin ?? '') : null;
      if (b) iz.metin = iz.metin ? `${iz.metin} (${b})`.slice(0, 200) : b;
    }
    const ayni = new Map<string, SayfaIzi[]>();
    for (const iz of liste) { const k2 = katla(iz.metin ?? ''); (ayni.get(k2) ?? ayni.set(k2, []).get(k2))?.push(iz); }
    for (const [, l2] of ayni) {
      if (l2.length < 2) continue;
      l2.forEach((iz, i) => { iz.metin = `${iz.metin ?? 'Simge'} (${i + 1}/${l2.length})`.slice(0, 200); });
    }
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
  const tumu = [...document.body.querySelectorAll('*'), ...golgeKokleri.flatMap((g) => [...g.querySelectorAll('*')])].slice(0, 6000);
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
/** Çerçeve öğesinin (iframe / frame) üst belgesine göre seçicisi (sayfa içi; sayfa-envanteri.ts > cerceveSecici ile aynı kural). */
function cerceveSeciciHesapla(f: Element): string | null {
  const tekMi = (s: string): boolean => { try { return (f.ownerDocument ?? document).querySelectorAll(s).length === 1; } catch { return false; } };
  const tirnak = (d: string): string => d.replace(/["\\]/g, '\\$&');
  const t = f.tagName.toLowerCase();
  const id = f.getAttribute('id');
  if (id && !/^\d/.test(id) && tekMi(`${t}#${CSS.escape(id)}`)) return `${t}#${CSS.escape(id)}`;
  const ad = f.getAttribute('name');
  if (ad && tekMi(`${t}[name="${tirnak(ad)}"]`)) return `${t}[name="${tirnak(ad)}"]`;
  const src = (f.getAttribute('src') ?? '').split(/[?#]/)[0];
  const son = src.split('/').filter(Boolean).pop() ?? '';
  if (son && !/^(about:|javascript:|data:)/i.test(src) && tekMi(`${t}[src*="${tirnak(son)}"]`)) return `${t}[src*="${tirnak(son)}"]`;
  const baslik = f.getAttribute('title');
  if (baslik && tekMi(`${t}[title="${tirnak(baslik)}"]`)) return `${t}[title="${tirnak(baslik)}"]`;
  const hepsi = [...(f.ownerDocument ?? document).querySelectorAll(t)];
  return hepsi.length === 1 ? t : null;
}

/** Çerçevenin seçici zinciri (dıştan içe; en çok 2 düzey, aynı kökenli ve görünür). Kurulamazsa null. */
async function cerceveZinciri(page: Page, f: Frame): Promise<string[] | null> {
  let koken = '';
  try { koken = new URL(page.url()).origin; } catch { return null; }
  const zincir: string[] = [];
  for (let x: Frame | null = f; x && x.parentFrame(); x = x.parentFrame()) {
    try { if (new URL(x.url()).origin !== koken) return null; } catch { return null; }
    const el = await x.frameElement().catch(() => null);
    if (!el) return null;
    const s = await el.evaluate((e) => {
      const r = (e as Element).getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? true : null;
    }).catch(() => null);
    const secici = s ? await el.evaluate(cerceveSeciciHesapla).catch(() => null) : null;
    if (!secici) return null;
    zincir.unshift(secici);
    if (zincir.length > 2) return null;
  }
  return zincir;
}

/**
 * Açık sayfadan eylem adaylarını çıkarır — BASMAZ. Sayfa (Page) olduğu gibi kalır: yalnız geçici işaret öznitelikleri eklenip
 * kaldırılır. Sayfa kapanırsa / okunamazsa boş küme ve not döner (hata fırlatmaz). cerceveler: aynı kökenli çerçevelerin (iframe)
 * düğmeleri de aday olur (her biri çerçeve seçicileriyle; hızlı test).
 */
export async function eylemAdaylariniCikar(page: Page, secenek: { dugmeSiniri?: number; cerceveler?: boolean } = {}): Promise<EylemAdaylari> {
  const dugmeSiniri = secenek.dugmeSiniri ?? 25;
  type Kapsam = { frame: Frame; cerceve: string[]; kapsam: Page | FrameLocator };
  const kapsamlar: Kapsam[] = [{ frame: page.mainFrame(), cerceve: [], kapsam: page }];
  if (secenek.cerceveler) {
    for (const f of page.frames().slice(0, 12)) {
      if (f === page.mainFrame()) continue;
      const zincir = await cerceveZinciri(page, f);
      if (!zincir) continue;
      let k: Page | FrameLocator = page;
      for (const c of zincir) k = k.frameLocator(c);
      kapsamlar.push({ frame: f, cerceve: zincir, kapsam: k });
    }
  }
  const izler: HamEylemIzi[] = [];
  let sayfaYolu = '';
  const yonlendirmeler: HamYonlendirme[] = [];
  const notlar: string[] = [];
  for (const [i, k] of kapsamlar.entries()) {
    const onek = `${ISARET_ONEKI}${i}x`;
    let ham: SayfaIzleri;
    try {
      // Seçici üreticisi ("Sayfada seç"le aynı) belgeye verilir; init betiği gerekmez.
      await k.frame.evaluate(`window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()}; 0`);
      ham = await k.frame.evaluate(eylemIzleriniTopla, { kaliplar: { ...KALIPLAR }, enCok: { dugme: dugmeSiniri, basari: 12, hata: 10, bekleme: 8 }, onek });
    } catch (hata) {
      if (i > 0) continue;
      return eylemAdaylariniDegerlendir({ sayfaYolu: '', izler: [], yonlendirmeler: [], notlar: [`Eylem adayları okunamadı: ${String(hata instanceof Error ? hata.message : hata).split('\n')[0].slice(0, 200)}`] });
    }
    if (i === 0) { sayfaYolu = ham.sayfaYolu; yonlendirmeler.push(...ham.yonlendirmeler); notlar.push(...ham.notlar); }
    try {
      for (const iz of ham.izler) {
        // Çerçevelerden yalnız düğmeler (sonuç / hata metinleri ayrıca sayfa metninden okunur).
        if (i > 0 && iz.tur !== 'dugme') continue;
        const { isaret, adaylar, grupSecici, ...kalan } = iz;
        const ek = k.cerceve.length ? { cerceve: k.cerceve } : {};
        if (grupSecici) {
          const n = await k.kapsam.locator(grupSecici).count().catch(() => 0);
          if (n >= 1) izler.push({ ...kalan, ...ek, secici: grupSecici, seciciTuru: 'css', kirilganlik: 'orta', adet: n });
          continue;
        }
        if (!isaret || !adaylar?.length) continue;
        for (const a of sirala(adaylar, iz.tur !== 'dugme')) {
          try {
            const l = k.kapsam.locator(a.secici);
            if ((await l.count()) !== 1) continue;
            if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== isaret) continue;
            izler.push({ ...kalan, ...ek, secici: a.secici, seciciTuru: a.tur === 'rolAdsiz' ? 'rol' : a.tur, kirilganlik: a.kirilganlik });
            break;
          } catch { /* geçersiz seçici: sonraki aday */ }
        }
      }
    } finally {
      // İşaretler belgeden ve açık gölge köklerinden temizlenir.
      await k.frame.evaluate((o) => {
        const temizle = (kok: ParentNode): void => {
          for (const e of kok.querySelectorAll('*')) {
            if (e.getAttribute('data-nobetci-secilen')?.startsWith(o)) e.removeAttribute('data-nobetci-secilen');
            if (e.shadowRoot) temizle(e.shadowRoot);
          }
        };
        temizle(document);
        delete (window as unknown as Record<string, unknown>).__nobetciOgeBilgisi;
      }, onek).catch(() => undefined);
    }
  }
  return eylemAdaylariniDegerlendir({ sayfaYolu, izler, yonlendirmeler, notlar }, secenek.dugmeSiniri ? { gonderim: secenek.dugmeSiniri } : {});
}
