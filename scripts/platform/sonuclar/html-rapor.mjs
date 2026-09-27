// PAYLAŞILABİLİR HTML RAPOR — bir ekran koşusunun ya da servis / akış koşusunun tek dosyalık, dışa bağımlılığı olmayan raporu
// (satır içi CSS, JS YOK, harici font / CDN YOK; CSP ile yalnız data: görüntüler). Nöbetçi temasından bağımsız, açık zemin,
// yazdırılabilir (print CSS), erişilebilir (lang="tr", tablo başlıkları scope ile).
// - Seçenekler (kullanıcı kararı, Sonuçlar > koşu ayrıntısı > "Raporu indir (HTML)" diyaloğu):
//     goruntuler (varsayılan KAPALI): kasadaki şifreli ekran görüntüleri sunucuda çözülüp data: URI olarak gömülür
//       (toplam en çok EN_COK_GORUNTU_BAYT; sığmayanlar atlanır ve raporda sayısı yazılır),
//     hatalar (varsayılan açık): hata metninin ilk satırları, "Beklenen / Görülen" ve hata kalıpları özeti,
//     adres (varsayılan KAPALI): ortam adresi; kapalıyken hata metinlerindeki ortam adresi de "‹ortam adresi›" olur.
// - Maskeleme HER ZAMAN: bilinen gizli değerler (giriş profillerinin kullanıcı adı / parola / TOTP / gizli ek alanları, test
//   verisi tablolarının gizli sütunları), adı gizli sayılan alanlar (Ayarlar > Güvenlik > Maskeleme ek adlarıyla), uzun rakam
//   dizileri, e-posta adresleri, adreslerdeki sorgu dizesi (yakalanan-mesajlar.mjs > yakalananMetniMaskele). İstek / yanıt
//   gövdesi, başlıklar, okunan değerler ve giriş bilgisi rapora HİÇ girmez.
// - Tüm kullanıcı verisi HTML'e kaçışlanarak yazılır.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DepoHatasi, girisProfiliGetir, girisProfilleriniListele, ortamGetir, projeGetir } from '../veritabani/depo.mjs';
import { kosuDetayi, medyaGetir, sonucDetayi } from '../veritabani/sonuc-deposu.mjs';
import { servisKosusuGetir } from '../servisler/servis-deposu.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { medyaAnahtariniHazirla } from '../kasa.mjs';
import { medyaDosyaAdiGecerliMi, medyaTamamenCoz } from '../medya.mjs';
import { ansiTemizle, beklenenGorulenCikar, kalipCikar } from './siniflandirma.mjs';
import { raporMetniniMaskele, servisSonucKosusu } from './servis-sonuclari.mjs';
import { yakalananMetniMaskele } from './yakalanan-mesajlar.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ ad: string; icerikTuru: string; base64: string }} RaporGoruntusu
 * @typedef {{ ad: string; gecti: boolean; aciklama?: string }} RaporKontrolu
 * @typedef {{ baslik: string; grup: string; durum: string; sureMs: number | null; kalinanAdim: string | null; hata: string | null;
 *   kontroller?: RaporKontrolu[]; goruntuler?: RaporGoruntusu[] }} RaporSenaryosu
 * @typedef {{ tur: 'ekran' | 'servis' | 'akis'; baslik: string; proje: string; ortam: string | null; ortamAdresi: string | null;
 *   baslangic: string | null; bitis: string | null; sureMs: number | null; kosuDurumu: string | null;
 *   sayilar: { basarili: number; basarisiz: number; atlanan: number; durduruldu: number };
 *   senaryolar: RaporSenaryosu[]; atlananGoruntu?: number; olusturma?: string }} RaporVerisi
 * @typedef {{ goruntuler?: boolean; hatalar?: boolean; adres?: boolean; gizliDegerler?: ReadonlyArray<string>; ekAdlar?: ReadonlyArray<string> }} RaporSecenekleri
 */

/** Gömülen görüntülerin toplam en çok boyutu (base64, bayt). */
export const EN_COK_GORUNTU_BAYT = 25 * 1024 * 1024;
/** Hata metninden rapora giren en çok satır. */
const HATA_SATIR_SINIRI = 12;
const ADRES_YERINE = '‹ortam adresi›';
const GORUNTU_TURU = /^image\/(png|jpeg|webp|gif)$/;

const DURUM_ETIKETI = /** @type {Record<string, string>} */ ({
  basarili: 'Başarılı', basarisiz: 'Başarısız', hata: 'Hata', atlanan: 'Atlanan', durduruldu: 'Durduruldu'
});
const KOSU_DURUMU = /** @type {Record<string, string>} */ ({
  calisiyor: 'Çalışıyor', tamamlandi: 'Tamamlandı', durduruldu: 'Durduruldu', zaman_asimi: 'Zaman aşımı', hata: 'Hata'
});

/** HTML kaçışlama (metin ve öznitelik). @param {unknown} v */
export function kacis(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** @param {number | null | undefined} ms */
function sureMetni(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sn = ms / 1000;
  if (sn < 60) return `${sn.toFixed(1).replace('.', ',')} sn`;
  const dk = Math.floor(sn / 60);
  return `${dk} dk ${Math.round(sn - dk * 60)} sn`;
}

/** @param {string | null | undefined} iso */
function tarihMetni(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * İndirme dosya adı: nobetci-rapor-<proje>-<ortam>-<tarih>.html (yalnız a-z, 0-9, "-").
 * @param {string} proje @param {string | null} ortam @param {Date} [tarih]
 */
export function raporDosyaAdi(proje, ortam, tarih = new Date()) {
  const tr = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' });
  const temiz = (/** @type {string} */ s) => String(s ?? '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => tr[c] ?? c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const t = `${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}-${iki(tarih.getDate())}-${iki(tarih.getHours())}${iki(tarih.getMinutes())}`;
  return `nobetci-rapor-${[temiz(proje) || 'proje', temiz(ortam ?? '') || 'ortam', t].join('-')}.html`;
}

/**
 * Maskeleyici: bilinen gizli değerler + adı gizli alanlar + uzun rakam / e-posta / sorgu dizesi; adres kapalıysa ortam adresi.
 * @param {RaporSecenekleri} s @param {string | null} ortamAdresi
 */
function maskeleyici(s, ortamAdresi) {
  const ekAdlar = s.ekAdlar ?? [];
  const gizliDegerler = s.gizliDegerler ?? [];
  let koken = null;
  try { koken = ortamAdresi ? new URL(ortamAdresi).origin : null; } catch { koken = null; }
  /** @param {unknown} metin */
  return (metin) => {
    // Adreslerdeki sorgu dizesi / parça önce silinir (ortam adresi aşağıda yer tutucuya dönse de).
    let m = ansiTemizle(String(metin ?? '')).replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1');
    if (!s.adres && ortamAdresi) {
      for (const a of [ortamAdresi, koken]) if (a && a.length >= 4) m = m.split(a).join(ADRES_YERINE);
    }
    m = adliDegerleriMaskele(String(raporMetniniMaskele(m, ekAdlar) ?? ''), ekAdlar);
    return m.split('\n').map((satir) => yakalananMetniMaskele(satir, { gizliDegerler, ekAdlar })).join('\n');
  };
}

/**
 * "ad=değer" / "ad: değer" çiftlerinde adı gizli olanın değerini maskeler. yakalananMetniMaskele aynı işi yapar ancak eşleşme
 * değeri tükettiği için "Giriş: parola=x" gibi zincirlerde ikinci çifti atlar; burada değer tüketilmeden her ad denetlenir.
 * @param {string} m @param {ReadonlyArray<string>} ekler
 */
function adliDegerleriMaskele(m, ekler) {
  const re = /([\p{L}\p{N}_-]{2,40})(\s*[=:]\s*)/gu;
  let cikti = '';
  let i = 0;
  for (let e = re.exec(m); e; e = re.exec(m)) {
    if (!gizliAdMi(e[1], ekler)) continue;
    const bas = e.index + e[0].length;
    const deger = /^[^\s,;&"'<>]+/.exec(m.slice(bas));
    if (!deger || deger[0] === '•••') continue;
    cikti += `${m.slice(i, bas)}•••`;
    i = bas + deger[0].length;
    re.lastIndex = i;
  }
  return cikti + m.slice(i);
}

/** Hata metninin ilk satırları (boş satırlar ve Playwright çağrı günlüğü sonrası atılır). @param {string} m */
function ilkSatirlar(m) {
  const satirlar = m.split('\n');
  const gunluk = satirlar.findIndex((x) => /^\s*Call log:/.test(x));
  return (gunluk > 0 ? satirlar.slice(0, gunluk) : satirlar).map((x) => x.trimEnd()).filter((x) => x.trim()).slice(0, HATA_SATIR_SINIRI).join('\n');
}

const CSS = `
:root{color-scheme:light;--metin:#1b1f24;--soluk:#57606a;--cizgi:#d0d7de;--zemin:#fff;--yuzey:#f6f8fa;--yesil:#1a7f37;--kirmizi:#cf222e;--sari:#9a6700;--gri:#57606a}
*{box-sizing:border-box}
body{margin:0;background:var(--zemin);color:var(--metin);font:14px/1.5 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;border-bottom:1px solid var(--cizgi);padding-bottom:4px}
h3{font-size:15px;margin:18px 0 6px}
.alt{color:var(--soluk);margin:0 0 16px}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}
dl.meta dt{color:var(--soluk)}dl.meta dd{margin:0;overflow-wrap:anywhere}
.ozet{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
.ozet li{border:1px solid var(--cizgi);border-radius:6px;padding:8px 14px;min-width:110px;background:var(--yuzey)}
.ozet .sayi{display:block;font-size:22px;font-weight:600}
.ozet .etiket{color:var(--soluk);font-size:12px}
table{border-collapse:collapse;width:100%;margin:0 0 8px}
th,td{border:1px solid var(--cizgi);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
thead th{background:var(--yuzey)}
td.sayi,th.sayi{text-align:right;white-space:nowrap}
.durum{font-weight:600;white-space:nowrap}
.durum.basarili{color:var(--yesil)}.durum.basarisiz,.durum.hata{color:var(--kirmizi)}.durum.atlanan{color:var(--sari)}.durum.durduruldu{color:var(--gri)}
pre{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:6px;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.45 Consolas,"Courier New",monospace;margin:6px 0}
dl.bg{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:6px 0}
dl.bg dt{font-weight:600}dl.bg dd{margin:0;font-family:Consolas,"Courier New",monospace;overflow-wrap:anywhere}
.ayrinti{border:1px solid var(--cizgi);border-radius:6px;padding:4px 14px 10px;margin:12px 0;break-inside:avoid}
figure{margin:8px 0}figure img{max-width:100%;height:auto;border:1px solid var(--cizgi)}figcaption{color:var(--soluk);font-size:12px}
.not{color:var(--soluk);font-size:12px}
footer{margin-top:32px;color:var(--soluk);font-size:12px;border-top:1px solid var(--cizgi);padding-top:8px}
@media print{@page{size:A4;margin:14mm}body{font-size:11px}main{max-width:none;padding:0}h2{break-after:avoid}tr,figure,.ayrinti{break-inside:avoid}
pre{white-space:pre-wrap}figure img{max-height:120mm}a{color:inherit;text-decoration:none}}
`;

/**
 * Rapor HTML'i (saf; yan etki yok). Görüntüler yalnız secenekler.goruntuler açıkken gömülür.
 * @param {RaporVerisi} v @param {RaporSecenekleri} [secenekler]
 * @returns {string}
 */
export function htmlRaporuUret(v, secenekler = {}) {
  const s = { goruntuler: false, hatalar: true, adres: false, ...secenekler };
  const maskele = maskeleyici(s, v.ortamAdresi);
  // Başlık / ad alanlarında yalnız bilinen gizli değerler ve adı gizli alanlar (uzun rakam vb. başlıkta anlamlı olabilir).
  const gizliler = [...new Set((s.gizliDegerler ?? []).map(String))].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length);
  /** @param {unknown} m */
  const adMaskele = (m) => gizliler.reduce((t, g) => t.split(g).join('•••'), String(m ?? ''));
  const e = (/** @type {unknown} */ x) => kacis(adMaskele(x));
  const sayilar = v.sayilar;
  const payda = sayilar.basarili + sayilar.basarisiz + sayilar.atlanan;
  const oran = payda ? `%${Math.round((sayilar.basarili / payda) * 100)}` : '—';
  const toplam = sayilar.basarili + sayilar.basarisiz + sayilar.atlanan + sayilar.durduruldu;
  const grupBasligi = v.tur === 'ekran' ? 'Ekran' : v.tur === 'akis' ? 'Servis' : 'Servis';
  const turMetni = v.tur === 'ekran' ? 'Ekran koşusu' : v.tur === 'akis' ? 'Servis akışı koşusu' : 'Servis koşusu';
  const durum = (/** @type {string} */ d) => `<span class="durum ${kacis(/^[a-z_]+$/.test(d) ? d : '')}">${kacis(DURUM_ETIKETI[d] ?? d)}</span>`;
  const kalanMi = (/** @type {RaporSenaryosu} */ x) => x.durum === 'basarisiz' || x.durum === 'hata';

  /** @type {Map<string, { kalip: string; sayi: number; ornek: string }>} */
  const kaliplar = new Map();
  const ayrintilar = [];
  let gomulen = 0;
  const satirlar = v.senaryolar.map((x, i) => {
    const hataMaskeli = x.hata ? ilkSatirlar(maskele(x.hata)) : '';
    if (s.hatalar && hataMaskeli && kalanMi(x)) {
      const kalip = kalipCikar(hataMaskeli);
      const k = kaliplar.get(kalip) ?? { kalip, sayi: 0, ornek: x.baslik };
      k.sayi++;
      kaliplar.set(kalip, k);
    }
    const bg = s.hatalar && x.hata ? beklenenGorulenCikar(maskele(x.hata)) : null;
    const kontroller = (x.kontroller ?? []).filter((k) => k && typeof k.ad === 'string');
    const goruntuler = s.goruntuler ? (x.goruntuler ?? []).filter((g) => GORUNTU_TURU.test(g.icerikTuru) && /^[A-Za-z0-9+/=]+$/.test(g.base64)) : [];
    const ayrintiVar = (s.hatalar && (hataMaskeli || bg)) || (kontroller.length && x.durum !== 'basarili') || goruntuler.length;
    const ayrintiId = `s${i + 1}`;
    if (ayrintiVar) {
      gomulen += goruntuler.length;
      ayrintilar.push(`<section class="ayrinti" id="${ayrintiId}" aria-labelledby="${ayrintiId}-b">
<h3 id="${ayrintiId}-b">${i + 1}. ${e(x.baslik)} — ${durum(x.durum)}</h3>
${x.kalinanAdim ? `<p><strong>Kalınan adım:</strong> ${kacis(maskele(x.kalinanAdim))}</p>` : ''}
${bg ? `<dl class="bg"><dt>Beklenen</dt><dd>${kacis(bg.beklenen || '—')}</dd><dt>Görülen</dt><dd>${kacis(bg.gorulen || '—')}</dd></dl>` : ''}
${s.hatalar && hataMaskeli ? `<pre aria-label="Hata mesajı (ilk satırlar)">${kacis(hataMaskeli)}</pre>` : ''}
${kontroller.length && x.durum !== 'basarili' ? `<table><caption class="not">Kontroller</caption><thead><tr><th scope="col">Kontrol</th><th scope="col">Sonuç</th><th scope="col">Açıklama</th></tr></thead><tbody>${
  kontroller.map((k) => `<tr><td>${kacis(maskele(k.ad))}</td><td>${durum(k.gecti ? 'basarili' : 'basarisiz')}</td><td>${s.hatalar ? kacis(maskele(k.aciklama ?? '')) : ''}</td></tr>`).join('')}</tbody></table>` : ''}
${goruntuler.map((g, j) => `<figure><img src="data:${g.icerikTuru};base64,${g.base64}" alt="${e(`${x.baslik} — ekran görüntüsü ${j + 1}`)}"><figcaption>${e(g.ad)}</figcaption></figure>`).join('\n')}
</section>`);
    }
    return `<tr><td class="sayi">${i + 1}</td><td>${durum(x.durum)}</td><td>${e(x.grup)}</td><td>${ayrintiVar ? `<a href="#${ayrintiId}">${e(x.baslik)}</a>` : e(x.baslik)}</td>`
      + `<td class="sayi">${kacis(sureMetni(x.sureMs))}</td><td>${x.kalinanAdim ? kacis(maskele(x.kalinanAdim)) : ''}</td></tr>`;
  });
  const kalipListesi = [...kaliplar.values()].sort((a, b) => b.sayi - a.sayi || a.kalip.localeCompare(b.kalip, 'tr'));
  const olusturma = v.olusturma ?? new Date().toISOString();

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<title>${e(`Nöbetçi test raporu — ${v.proje}${v.ortam ? ` / ${v.ortam}` : ''}`)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>Nöbetçi test raporu</h1>
<p class="alt">${kacis(turMetni)}: ${e(v.baslik)}</p>
<dl class="meta">
<dt>Proje</dt><dd>${e(v.proje)}</dd>
<dt>Ortam</dt><dd>${e(v.ortam || '—')}</dd>
${s.adres && v.ortamAdresi ? `<dt>Ortam adresi</dt><dd>${kacis(maskele(v.ortamAdresi))}</dd>` : ''}
<dt>Koşu başlangıcı</dt><dd>${kacis(tarihMetni(v.baslangic))}</dd>
<dt>Koşu bitişi</dt><dd>${kacis(tarihMetni(v.bitis))}</dd>
<dt>Süre</dt><dd>${kacis(sureMetni(v.sureMs))}</dd>
${v.kosuDurumu ? `<dt>Koşu durumu</dt><dd>${kacis(KOSU_DURUMU[v.kosuDurumu] ?? v.kosuDurumu)}</dd>` : ''}
</dl>
</header>
<section aria-labelledby="ozet-b">
<h2 id="ozet-b">Özet</h2>
<ul class="ozet">
<li><span class="sayi">${sayilar.basarili}</span><span class="etiket">Başarılı</span></li>
<li><span class="sayi">${sayilar.basarisiz}</span><span class="etiket">Kalan</span></li>
<li><span class="sayi">${sayilar.atlanan}</span><span class="etiket">Atlanan</span></li>
<li><span class="sayi">${sayilar.durduruldu}</span><span class="etiket">Durduruldu</span></li>
<li><span class="sayi">${toplam}</span><span class="etiket">Toplam</span></li>
<li><span class="sayi">${kacis(oran)}</span><span class="etiket">Başarı oranı</span></li>
</ul>
<p class="not">Başarı oranı = başarılı / (başarılı + kalan + atlanan); durdurulanlar orana katılmaz.</p>
</section>
${s.hatalar && kalipListesi.length ? `<section aria-labelledby="kalip-b">
<h2 id="kalip-b">Hata kalıpları</h2>
<table><thead><tr><th scope="col">Kalıp</th><th scope="col" class="sayi">Senaryo</th><th scope="col">Örnek senaryo</th></tr></thead>
<tbody>${kalipListesi.map((k) => `<tr><td>${kacis(k.kalip)}</td><td class="sayi">${k.sayi}</td><td>${e(k.ornek)}</td></tr>`).join('')}</tbody></table>
</section>` : ''}
<section aria-labelledby="senaryo-b">
<h2 id="senaryo-b">${v.tur === 'akis' ? 'Adımlar' : 'Senaryolar'} (${v.senaryolar.length})</h2>
${v.senaryolar.length ? `<table>
<thead><tr><th scope="col" class="sayi">#</th><th scope="col">Durum</th><th scope="col">${kacis(grupBasligi)}</th><th scope="col">${v.tur === 'akis' ? 'Adım' : 'Senaryo'}</th><th scope="col" class="sayi">Süre</th><th scope="col">Kalınan adım</th></tr></thead>
<tbody>
${satirlar.join('\n')}
</tbody>
</table>` : '<p>Bu koşuda sonuç yok.</p>'}
</section>
${ayrintilar.length ? `<section aria-labelledby="ayrinti-b">
<h2 id="ayrinti-b">Ayrıntılar</h2>
${ayrintilar.join('\n')}
</section>` : ''}
<footer>
<p>Oluşturma: ${kacis(tarihMetni(olusturma))} · Nöbetçi. Gizli değerler maskelenmiştir; giriş bilgisi, istek / yanıt gövdesi ve test verisinin gizli sütunları rapora eklenmez.${
  s.goruntuler ? ` Gömülü ekran görüntüsü: ${gomulen}.` : ''}${
  s.goruntuler && v.atlananGoruntu ? ` Boyut sınırı (${Math.round(EN_COK_GORUNTU_BAYT / 1024 / 1024)} MB) nedeniyle eklenmeyen görüntü: ${v.atlananGoruntu}.` : ''}</p>
</footer>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------
// Sunucu: veriyi toplama (kasa açık olmalı)
// ---------------------------------------------------------------------------------------

/**
 * Projenin bilinen gizli değerleri (yalnız maskeleme için; rapora yazılmaz).
 * @param {Veritabani} vt @param {string} projeId @returns {string[]}
 */
function bilinenGizliDegerler(vt, projeId) {
  /** @type {unknown[]} */
  const d = [];
  try {
    for (const p of girisProfilleriniListele(vt, projeId)) {
      const t = girisProfiliGetir(vt, p.id, { coz: true });
      if (!t) continue;
      d.push(t.kullaniciAdi, t.parola, t.totpGizli, ...t.ekAlanlar.filter((x) => x.gizli).map((x) => x.deger));
    }
  } catch { /* profil okunamazsa ad tabanlı maskeleme yine uygulanır */ }
  try {
    for (const t of tablolariListele(vt, projeId, { cozulsun: true })) {
      const gizliSutunlar = t.sutunlar.filter((x) => x.gizli).map((x) => x.ad);
      for (const r of t.satirlar) for (const a of gizliSutunlar) d.push(r.degerler[a]);
    }
  } catch { /* tablo okunamazsa ad tabanlı maskeleme yine uygulanır */ }
  return [...new Set(d.filter((x) => typeof x === 'string' && x.length >= 3).map(String))];
}

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/** @param {Veritabani} vt @param {string | null} ortamId */
function ortamBilgisi(vt, ortamId) {
  if (!ortamId) return { ad: null, adres: null };
  try {
    const o = ortamGetir(vt, ortamId);
    return { ad: o?.ad ?? null, adres: o?.tabanUrl ?? null };
  } catch {
    return { ad: null, adres: null };
  }
}

/**
 * Ekran koşusunun rapor verisi (görüntüler medya kimliğiyle; henüz gömülmemiş).
 * @param {Veritabani} vt @param {string} projeId @param {string} id
 */
function ekranKosusuVerisi(vt, projeId, id) {
  const d = kosuDetayi(vt, id);
  if (!d || d.kosu.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı.');
  const ortam = ortamBilgisi(vt, d.kosu.ortamId);
  const k = d.kosu;
  /** @type {Array<RaporSenaryosu & { medya: Array<{ id: string; ad: string; icerikTuru: string; boyut: number }> }>} */
  const senaryolar = d.sonuclar.map((x) => {
    const t = sonucDetayi(vt, x.id);
    const kalinan = t?.adimlar.find((a) => a.durum === 'basarisiz')?.ad ?? null;
    return {
      baslik: x.senaryoBaslik, grup: x.urun, durum: x.durum, sureMs: x.sureMs, kalinanAdim: x.durum === 'basarili' ? null : kalinan,
      hata: x.durum === 'basarili' ? null : t?.hataMesaji ?? null,
      medya: (t?.medya ?? []).filter((m) => m.tur === 'ekran_goruntusu' && !m.silinme && !m.yedekDisi)
        .map((m) => ({ id: m.id, ad: m.ad, icerikTuru: m.icerikTuru, boyut: m.boyut }))
    };
  });
  const sure = k.bitis ? new Date(k.bitis).getTime() - new Date(k.baslangic).getTime() : null;
  return {
    veri: {
      tur: /** @type {const} */ ('ekran'), baslik: k.tur === 'tam' ? 'Tam koşu' : `Tekil koşu${k.kapsam ? ` (${k.kapsam})` : ''}`,
      proje: projeGetir(vt, projeId)?.ad ?? '', ortam: ortam.ad, ortamAdresi: ortam.adres, baslangic: k.baslangic, bitis: k.bitis, sureMs: sure,
      kosuDurumu: k.durum, sayilar: { basarili: k.basarili, basarisiz: k.basarisiz, atlanan: k.atlanan, durduruldu: k.durduruldu }
    },
    senaryolar
  };
}

/**
 * Servis / akış koşusunun rapor verisi (istek / yanıt gövdesi, başlık ve okunan değerler ALINMAZ).
 * @param {Veritabani} vt @param {string} projeId @param {string} id
 */
function servisKosusuVerisi(vt, projeId, id) {
  const r = servisSonucKosusu(vt, new URLSearchParams({ projeId, id }));
  const k = /** @type {Record<string, any>} */ (r.kosu);
  const ortam = ortamBilgisi(vt, k.ortamId ?? null);
  const akis = k.tur === 'akis';
  const durumu = (/** @type {string} */ d) => (d === 'atlandi' ? 'atlanan' : d);
  /** @type {RaporSenaryosu[]} */
  const senaryolar = akis
    ? r.adimlar.map((a) => ({
      baslik: `${a.no}. ${a.ad || a.senaryo}`, grup: a.servis, durum: durumu(a.durum), sureMs: a.sureMs, kalinanAdim: null,
      hata: a.durum === 'basarili' ? null : a.hata || null
    }))
    : r.senaryolar.map((x) => {
      const satir = servisKosusuGetir(vt, x.satirId);
      const kontroller = Array.isArray(satir?.sonuc.kontroller) ? satir.sonuc.kontroller : [];
      return {
        baslik: x.baslik, grup: String(k.baslik ?? ''), durum: x.durduruldu ? 'durduruldu' : durumu(x.durum), sureMs: x.sureMs, kalinanAdim: null,
        hata: x.hata || null,
        kontroller: kontroller.filter((/** @type {any} */ c) => c && typeof c.ad === 'string')
          .map((/** @type {any} */ c) => ({ ad: String(c.ad), gecti: c.gecti === true, aciklama: c.aciklama ? String(c.aciklama) : '' }))
      };
    });
  return {
    veri: {
      tur: /** @type {'servis' | 'akis'} */ (akis ? 'akis' : 'servis'), baslik: String(k.baslik ?? ''),
      proje: projeGetir(vt, projeId)?.ad ?? '', ortam: ortam.ad ?? (k.ortam && k.ortam !== '—' ? String(k.ortam) : null), ortamAdresi: ortam.adres,
      baslangic: k.baslangic ?? null, bitis: k.bitis ?? null, sureMs: typeof k.sureMs === 'number' ? k.sureMs : null, kosuDurumu: null,
      sayilar: { basarili: Number(k.basarili) || 0, basarisiz: (Number(k.basarisiz) || 0) + (Number(k.hata) || 0), atlanan: Number(k.atlanan) || 0, durduruldu: Number(k.durduruldu) || 0 }
    },
    senaryolar
  };
}

/**
 * GET /platform/sonuclar/html-rapor?projeId=&tur=ekran|servis&id=&goruntuler=1&hatalar=0|1&adres=1
 * @param {Veritabani} vt @param {URLSearchParams} q @param {{ medyaKlasoru: string }} ortamlar
 * @returns {Promise<{ html: string; dosyaAdi: string; boyut: number; goruntu: { eklenen: number; atlanan: number; bayt: number } }>}
 */
export async function htmlRaporuOlustur(vt, q, ortamlar) {
  const projeId = kimlik(q.get('projeId'), 'projeId');
  const id = kimlik(q.get('id'), 'id');
  const tur = q.get('tur') === 'servis' ? 'servis' : 'ekran';
  const secenekler = { goruntuler: q.get('goruntuler') === '1', hatalar: q.get('hatalar') !== '0', adres: q.get('adres') === '1' };
  const { veri, senaryolar } = tur === 'servis' ? servisKosusuVerisi(vt, projeId, id) : ekranKosusuVerisi(vt, projeId, id);
  let bayt = 0;
  let eklenen = 0;
  let atlanan = 0;
  /** @type {RaporSenaryosu[]} */
  const son = [];
  // Görüntüler: kalan senaryolarınki önce (koşu detayı zaten başarısızları önce sıralar); sığmayanlar atlanır.
  const anahtar = secenekler.goruntuler && senaryolar.some((x) => 'medya' in x && x.medya.length) ? medyaAnahtariniHazirla(vt) : null;
  try {
    for (const x of senaryolar) {
      const { medya, ...kalan } = /** @type {RaporSenaryosu & { medya?: Array<{ id: string; ad: string; icerikTuru: string; boyut: number }> }} */ (x);
      /** @type {RaporGoruntusu[]} */
      const goruntuler = [];
      for (const m of anahtar ? medya ?? [] : []) {
        if (!GORUNTU_TURU.test(m.icerikTuru)) continue;
        const tahmin = Math.ceil(m.boyut / 3) * 4;
        if (bayt + tahmin > EN_COK_GORUNTU_BAYT) { atlanan++; continue; }
        const kayit = medyaGetir(vt, m.id);
        if (!kayit || !medyaDosyaAdiGecerliMi(kayit.dosya)) { atlanan++; continue; }
        try {
          const base64 = (await medyaTamamenCoz(/** @type {Buffer} */ (anahtar), join(ortamlar.medyaKlasoru, kayit.dosya))).toString('base64');
          if (bayt + base64.length > EN_COK_GORUNTU_BAYT) { atlanan++; continue; }
          bayt += base64.length;
          eklenen++;
          goruntuler.push({ ad: m.ad, icerikTuru: m.icerikTuru, base64 });
        } catch {
          atlanan++; // dosya yok / bozuk
        }
      }
      son.push({ ...kalan, ...(goruntuler.length ? { goruntuler } : {}) });
    }
  } finally {
    if (anahtar) anahtar.fill(0);
  }
  const html = htmlRaporuUret({ ...veri, senaryolar: son, atlananGoruntu: atlanan }, {
    ...secenekler, ekAdlar: ekGizliAdlar(vt), gizliDegerler: bilinenGizliDegerler(vt, projeId)
  });
  return {
    html, dosyaAdi: raporDosyaAdi(veri.proje, veri.ortam, veri.baslangic ? new Date(veri.baslangic) : new Date()),
    boyut: Buffer.byteLength(html, 'utf8'), goruntu: { eklenen, atlanan, bayt }
  };
}

// ---------------------------------------------------------------------------------------
// Önizleme: arayüzün CSP'si (style-src 'self') satır içi stili engellediği için önizleme srcdoc ile değil, kendi CSP başlığıyla
// sunulan tek kullanımlık bir adresten (iframe sandbox="") yüklenir. Üretilen HTML en çok ONIZLEME_OMRU_MS bellekte kalır,
// ilk okumada silinir (diske yazılmaz).
// ---------------------------------------------------------------------------------------

const ONIZLEME_OMRU_MS = 2 * 60_000;
const EN_COK_ONIZLEME = 4;
/** @type {Map<string, { html: string; bitis: number }>} */
const onizlemeler = new Map();

/** @param {string} html @returns {string} tek kullanımlık önizleme kimliği */
export function onizlemeSakla(html) {
  const simdi = Date.now();
  for (const [k, d] of onizlemeler) if (d.bitis < simdi) onizlemeler.delete(k);
  while (onizlemeler.size >= EN_COK_ONIZLEME) onizlemeler.delete(/** @type {string} */ (onizlemeler.keys().next().value));
  const id = randomBytes(16).toString('hex');
  onizlemeler.set(id, { html, bitis: simdi + ONIZLEME_OMRU_MS });
  return id;
}

/** @param {string} id @returns {string | null} */
export function onizlemeAl(id) {
  const d = onizlemeler.get(id);
  onizlemeler.delete(id);
  return d && d.bitis >= Date.now() ? d.html : null;
}

/** Kasa kilitlenince / sunucu kapanırken bellekteki önizlemeler silinir. */
export function onizlemeleriTemizle() {
  onizlemeler.clear();
}

/** Önizleme yanıtının başlıkları (betik yok; yalnız data: görüntü ve satır içi stil). */
export const ONIZLEME_BASLIKLARI = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox"
});
