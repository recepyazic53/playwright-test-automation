// KAPSAM MATRİSİ (Sonuçlar > Raporlar > Kapsam matrisi) — talep × senaryo × son sonuç. Talep numaraları senaryoların içeriğindedir
// (senaryolar/talepler.mjs); yalnız senaryosu olan talepler listelenir (ayrı talep listesi yoktur). Satır: talep, tür (ekran senaryosu /
// servis senaryosu / uçtan uca akış), senaryo, ekran / servis adı, son sonuç (başarılı / başarısız / koşmadı), tarih ve ortam.
// SON SONUÇ kuralı (süzgeçteki ortam ve dönem içinde, en yeni):
//  - Ekran senaryosu: koşu sonuçları (kosu_sonuclari, senaryo kimliğiyle; Senaryolar listesindeki "Son sonuç" ile aynı kaynak).
//    Ortamı bilinmeyen eski koşular her ortamda sayılır (liste kuralı). Atlanan / durdurulan sonuç koşu sayılmaz.
//  - Servis senaryosu: servis koşuları (servis_kosulari, tur 'kosu'; "Dene" sayılmaz). 'hata' başarısız sayılır.
//  - Uçtan uca akış: akış koşuları (servis_akis_kosulari, tur 'kosu'; "Dene" sayılmaz). 'hata' başarısız sayılır.
// Çıktı: JSON (ekran), CSV (UTF-8 BOM, ";" ayraçlı; formül gibi başlayan hücreler "'" ile kaçışlanır) ve PDF (yerel Chromium;
// pdf-rapor/pdf.mjs; talep metni raporMaskeleyici, adlar adMaskeleyici ile maskelenir). Hiçbir veri dışarı gönderilmez.
//   GET  /platform/kapsam-matrisi?projeId=&ortamId=&baslangic=&bitis=   → matris (JSON)
//   POST /platform/kapsam-matrisi/csv { projeId, ortamId?, baslangic?, bitis? } → { dosyaAdi, csv }
//   POST /platform/kapsam-matrisi/pdf { … }                                  → application/pdf (sunucu-platform.mjs gönderir)
// NOT: import.meta KULLANILMAZ. Tipler: kapsam-matrisi.d.mts.
import { DepoHatasi, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { TALEP_TUR_ADLARI, talepGruplari, talepliOgeler } from '../senaryolar/talep-servisi.mjs';
import { talepKucuk, talepSirala } from '../senaryolar/talepler.mjs';
import { adMaskeleyici, bilinenGizliDegerler, dosyaAdiParcasi, kacis, raporMaskeleyici } from './html-rapor.mjs';
import { araliktaMi, sorgudanAralik } from './aralik.mjs';
import { gunAnahtari } from './donem.mjs';
import { sayfaHtml, tarihSaat } from './pdf-rapor/bilesenler.mjs';
import { htmldenPdf, pdfSayfaSayisi } from './pdf-rapor/pdf.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./aralik.mjs').Aralik} Aralik */
/** @typedef {'basarili' | 'basarisiz' | 'kosmadi'} MatrisSonucu */

/** Sonuç adları (arayüz, CSV, PDF). */
export const SONUC_ADLARI = Object.freeze({ basarili: 'Başarılı', basarisiz: 'Başarısız', kosmadi: 'Koşmadı' });
/** Talep özet durumu: hepsi başarılı / en az biri başarısız / koşmayan var (başarısız yok). */
export const TALEP_DURUM_ADLARI = Object.freeze({ basarili: 'Tamamı başarılı', basarisiz: 'Başarısız var', eksik: 'Koşmayan var' });
const TUR_SIRASI = { ekran: 0, servis: 1, uctanUca: 2 };

/** @param {unknown} d @param {string} alan */
function kimlik(d, alan) {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}

/**
 * Son sonuç haritası: öğe kimliği → { sonuc, zaman, ortamId } (ortam / dönem süzgecinde en yeni).
 * @param {Iterable<Record<string, unknown>>} satirlar { oge, durum, zaman, ortam_id } @param {(d: string) => MatrisSonucu | null} cevir
 * @param {string | null} ortamId @param {Aralik} aralik @param {boolean} ortamsizHerOrtamda
 */
function sonSonuclar(satirlar, cevir, ortamId, aralik, ortamsizHerOrtamda) {
  /** @type {Map<string, { sonuc: MatrisSonucu; zaman: string; ortamId: string | null }>} */
  const m = new Map();
  for (const r of satirlar) {
    const sonuc = cevir(String(r.durum));
    if (!sonuc || r.oge == null || r.zaman == null) continue;
    const o = r.ortam_id == null ? null : String(r.ortam_id);
    if (ortamId && o !== ortamId && !(o === null && ortamsizHerOrtamda)) continue;
    const zaman = String(r.zaman);
    if (!araliktaMi(zaman, aralik)) continue;
    const onceki = m.get(String(r.oge));
    if (!onceki || onceki.zaman < zaman) m.set(String(r.oge), { sonuc, zaman, ortamId: o });
  }
  return m;
}

/**
 * Kapsam matrisi verisi.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ ortamId?: string | null; aralik?: Aralik; simdi?: Date }} [s]
 */
export function kapsamMatrisi(vt, projeId, s = {}) {
  const proje = projeGetir(vt, projeId);
  if (!proje) throw new DepoHatasi('Proje bulunamadı.');
  const ortamlar = ortamlariListele(vt, projeId);
  const ortamId = s.ortamId ?? null;
  const ortam = ortamId ? ortamlar.find((o) => o.id === ortamId) : null;
  if (ortamId && !ortam) throw new DepoHatasi('Ortam bulunamadı.');
  const aralik = s.aralik ?? { baslangic: null, bitis: null };
  const ortamAdi = new Map(ortamlar.map((o) => [o.id, o.ad]));
  const ogeler = talepliOgeler(vt, projeId);

  const ekranSon = sonSonuclar(vt.tumu(
    `SELECT r.senaryo_id AS oge, r.durum, k.ortam_id, COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id WHERE k.proje_id = ? AND r.senaryo_id IS NOT NULL`, [projeId]),
  (d) => (d === 'basarili' ? 'basarili' : d === 'basarisiz' ? 'basarisiz' : null), ortamId, aralik, true);
  const servisCevir = (/** @type {string} */ d) => (d === 'basarili' ? 'basarili' : d === 'basarisiz' || d === 'hata' ? 'basarisiz' : null);
  const servisSon = sonSonuclar(vt.tumu(
    "SELECT senaryo_id AS oge, durum, ortam_id, baslangic AS zaman FROM servis_kosulari WHERE proje_id = ? AND tur = 'kosu' AND senaryo_id IS NOT NULL", [projeId]),
  servisCevir, ortamId, aralik, false);
  const akisSon = sonSonuclar(vt.tumu(
    "SELECT akis_id AS oge, durum, ortam_id, baslangic AS zaman FROM servis_akis_kosulari WHERE proje_id = ? AND tur = 'kosu' AND akis_id IS NOT NULL", [projeId]),
  servisCevir, ortamId, aralik, false);

  const gruplar = talepGruplari([...ogeler.ekran, ...ogeler.servis, ...ogeler.uctanUca]);
  const gorunen = new Map(gruplar.map((g) => [g.anahtar, g.talep]));
  /** @type {Array<{ talep: string; tur: 'ekran' | 'servis' | 'uctanUca'; turAdi: string; id: string; baslik: string; oge: string; sonuc: MatrisSonucu; sonucAdi: string; zaman: string | null; ortamId: string | null; ortamAdi: string | null }>} */
  const satirlar = [];
  const ekle = (/** @type {{ tur: 'ekran' | 'servis' | 'uctanUca'; id: string; baslik: string; talepler: string[] }} */ x, /** @type {string} */ oge,
    /** @type {Map<string, { sonuc: MatrisSonucu; zaman: string; ortamId: string | null }>} */ sonlar) => {
    const son = sonlar.get(x.id);
    for (const t of x.talepler) {
      const sonuc = son?.sonuc ?? 'kosmadi';
      satirlar.push({
        talep: gorunen.get(talepKucuk(t)) ?? t, tur: x.tur, turAdi: TALEP_TUR_ADLARI[x.tur], id: x.id, baslik: x.baslik, oge, sonuc, sonucAdi: SONUC_ADLARI[sonuc],
        zaman: son?.zaman ?? null, ortamId: son?.ortamId ?? null, ortamAdi: son ? (son.ortamId ? ortamAdi.get(son.ortamId) ?? null : null) : null
      });
    }
  };
  for (const x of ogeler.ekran) ekle(x, x.ekranAdi ?? '', ekranSon);
  for (const x of ogeler.servis) ekle(x, x.servisAdi, servisSon);
  for (const x of ogeler.uctanUca) ekle(x, '', akisSon);
  satirlar.sort((a, b) => talepSirala(a.talep, b.talep) || TUR_SIRASI[a.tur] - TUR_SIRASI[b.tur] || a.oge.localeCompare(b.oge, 'tr') || a.baslik.localeCompare(b.baslik, 'tr'));

  const talepler = gruplar.map((g) => {
    const l = satirlar.filter((r) => r.talep === g.talep);
    const say = (/** @type {MatrisSonucu} */ d) => l.filter((r) => r.sonuc === d).length;
    const basarili = say('basarili');
    const basarisiz = say('basarisiz');
    const kosmadi = say('kosmadi');
    return { talep: g.talep, toplam: l.length, basarili, basarisiz, kosmadi, durum: /** @type {'basarili' | 'basarisiz' | 'eksik'} */ (basarisiz ? 'basarisiz' : kosmadi ? 'eksik' : 'basarili') };
  });
  return {
    proje: { id: proje.id, ad: proje.ad }, ortam: ortam ? { id: ortam.id, ad: ortam.ad } : null, aralik,
    olusturulma: (s.simdi ?? new Date()).toISOString(), talepler, satirlar
  };
}

/** @typedef {ReturnType<typeof kapsamMatrisi>} KapsamMatrisi */

/** Sorgu / gövdeden süzgeç. @param {Veritabani} vt @param {Record<string, unknown>} g @param {Date} [simdi] */
export function matrisGirdisi(vt, g, simdi = new Date()) {
  const projeId = kimlik(g.projeId, 'projeId');
  const ortamId = g.ortamId === undefined || g.ortamId === null || g.ortamId === '' ? null : kimlik(g.ortamId, 'ortamId');
  const q = new URLSearchParams();
  for (const a of ['baslangic', 'bitis']) if (typeof g[a] === 'string' && g[a]) q.set(a, String(g[a]));
  return { projeId, ortamId, aralik: sorgudanAralik(q, simdi) };
}

/** CSV hücresi: ";" / tırnak / satır sonu varsa tırnaklanır; "=", "+", "-", "@" ile başlayan metin formül sayılmasın diye "'" alır. @param {unknown} d */
function csvHucre(d) {
  let t = String(d ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Tarih metni (yerel "GG.AA.YYYY SS:DD"). @param {string | null} iso */
const tarihMetni = (iso) => (iso ? tarihSaat(iso) : '');

/**
 * CSV (UTF-8 BOM, ";" ayraç, CRLF). Sütunlar: Talep; Tür; Senaryo; Ekran / servis; Son sonuç; Tarih; Ortam.
 * @param {KapsamMatrisi} m @returns {string}
 */
export function kapsamMatrisiCsv(m) {
  const satirlar = [['Talep', 'Tür', 'Senaryo', 'Ekran / servis', 'Son sonuç', 'Tarih', 'Ortam'],
    ...m.satirlar.map((r) => [r.talep, r.turAdi, r.baslik, r.oge, r.sonucAdi, tarihMetni(r.zaman), r.ortamAdi ?? ''])];
  return `\uFEFF${satirlar.map((s) => s.map(csvHucre).join(';')).join('\r\n')}\r\n`;
}

/** "nobetci-kapsam-matrisi-<proje>-<tarih>.<uzantı>" @param {KapsamMatrisi} m @param {'csv' | 'pdf'} uzanti */
export const kapsamMatrisiDosyaAdi = (m, uzanti) => `nobetci-kapsam-matrisi-${dosyaAdiParcasi(m.proje.ad) || 'proje'}-${gunAnahtari(new Date(m.olusturulma))}.${uzanti}`;

/** Dönem etiketi. @param {Aralik} a */
const aralikEtiketi = (a) => (!a.baslangic && !a.bitis ? 'Tüm zamanlar'
  : a.baslangic && a.bitis ? `${tarihSaat(a.baslangic)} – ${tarihSaat(a.bitis)}` : a.baslangic ? `${tarihSaat(a.baslangic)} sonrası` : `${tarihSaat(/** @type {string} */ (a.bitis))} öncesi`);

const MATRIS_CSS = `
.hap { display: inline-block; padding: 0 6px; border-radius: 9px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; border: 1px solid; }
.h-basarili { color: #1a7f37; background: #eefbf1; border-color: #1a7f37; }
.h-basarisiz { color: #b42318; background: #fff0ef; border-color: #cf222e; }
.h-kosmadi, .h-eksik { color: #57606a; background: #f6f8fa; border-color: #9aa4b1; }
`;

/**
 * PDF için HTML (maskeli). @param {KapsamMatrisi} m
 * @param {{ maskele: (m: unknown) => string; adMaskele: (m: unknown) => string }} s
 */
export function kapsamMatrisiHtml(m, s) {
  const e = (/** @type {unknown} */ x) => kacis(s.adMaskele(x));
  const t = (/** @type {unknown} */ x) => kacis(s.maskele(x));
  const hap = (/** @type {string} */ d, /** @type {string} */ metin) => `<span class="hap h-${d}">${kacis(metin)}</span>`;
  const toplam = m.satirlar.length;
  const say = (/** @type {MatrisSonucu} */ d) => m.satirlar.filter((r) => r.sonuc === d).length;
  const meta = /** @type {Array<[string, string]>} */ ([
    ['Proje', e(m.proje.ad)], ['Ortam', m.ortam ? e(m.ortam.ad) : 'Tüm ortamlar'], ['Dönem', kacis(aralikEtiketi(m.aralik))],
    ['Oluşturulma', `${kacis(tarihSaat(m.olusturulma))} · Nöbetçi`]
  ]);
  const ozet = `<div class="ozet-sayilar"><span class="x"><b>${m.talepler.length}</b> talep</span><span class="x"><b>${toplam}</b> talep × senaryo</span>`
    + `<span class="x iyi"><b>${say('basarili')}</b> başarılı</span><span class="x kotu"><b>${say('basarisiz')}</b> başarısız</span><span class="x notr"><b>${say('kosmadi')}</b> koşmadı</span></div>`;
  const talepTablosu = m.talepler.length ? `<table><thead><tr><th>Talep</th><th class="s">Senaryo</th><th class="s">Başarılı</th><th class="s">Başarısız</th><th class="s">Koşmadı</th><th>Durum</th></tr></thead><tbody>${
    m.talepler.map((x) => `<tr><td>${t(x.talep)}</td><td class="s">${x.toplam}</td><td class="s">${x.basarili}</td><td class="s">${x.basarisiz}</td><td class="s">${x.kosmadi}</td><td>${hap(x.durum, TALEP_DURUM_ADLARI[x.durum])}</td></tr>`).join('')}</tbody></table>` : '';
  const matris = m.talepler.length ? `<table><thead><tr><th>Tür</th><th>Senaryo</th><th>Ekran / servis</th><th>Son sonuç</th><th>Tarih</th><th>Ortam</th></tr></thead><tbody>${
    m.talepler.map((x) => `<tr class="grup"><td colspan="6">${t(x.talep)}</td></tr>${m.satirlar.filter((r) => r.talep === x.talep).map((r) => `<tr><td>${kacis(r.turAdi)}</td><td>${e(r.baslik)}</td>`
      + `<td>${r.oge ? e(r.oge) : '<span class="notr">—</span>'}</td><td>${hap(r.sonuc, r.sonucAdi)}</td><td class="mono">${kacis(tarihMetni(r.zaman)) || '<span class="notr">—</span>'}</td>`
      + `<td>${r.ortamAdi ? e(r.ortamAdi) : '<span class="notr">—</span>'}</td></tr>`).join('')}`).join('')}</tbody></table>`
    : '<p class="bos">Talep numarası girilmiş senaryo yok. Talep no, senaryo formlarında başlığın altındaki "Talep no" alanından eklenir.</p>';
  const govde = `<style>${MATRIS_CSS}</style>${ozet}<h2><span class="no">1</span>Talepler</h2>${talepTablosu || '<p class="bos">—</p>'}<h2><span class="no">2</span>Talep × senaryo</h2>${matris}`
    + `<div class="yontem"><h3>Yöntem</h3><dl><dt>Son sonuç</dt><dd>${kacis('Seçilen ortam ve dönemdeki en yeni koşu. Ekran senaryosu: koşu sonuçları (atlanan / durdurulan sayılmaz; ortamı bilinmeyen eski koşular her ortamda sayılır). Servis senaryosu ve uçtan uca akış: "koşu" kayıtları ("Dene" sayılmaz; hata = başarısız). Dönemde koşu yoksa "Koşmadı".')}</dd>`
    + `<dt>Kapsam</dt><dd>${kacis('Yalnız senaryosu olan talepler listelenir; talep no senaryonun içeriğinde durur ve yalnız metindir (dış sisteme bağlanmaz).')}</dd></dl></div>`
    + '<div class="gizlilik"><b>Gizlilik.</b> Rapor yerel bilgisayarda üretildi; hiçbir veri dışarı gönderilmedi. Talep metinleri rapor maskeleyicisiyle, adlar bilinen gizli değerlerle maskelenir.</div>';
  const baslik = 'Kapsam matrisi';
  return { html: sayfaHtml({ baslik: kacis(baslik), alt: 'Talep × senaryo × son sonuç', meta, govde }), baslik };
}

/**
 * Maskeleyiciler (PDF rapor ile aynı kaynak: bilinen gizli değerler + Ayarlar > Güvenlik > Maskeleme adları).
 * @param {Veritabani} vt @param {string} projeId
 */
function maskeleyiciler(vt, projeId) {
  const gizliDegerler = bilinenGizliDegerler(vt, projeId);
  return { maskele: raporMaskeleyici({ hatalar: true, adres: false, goruntuler: false, gizliDegerler, ekAdlar: ekGizliAdlar(vt) }, null), adMaskele: adMaskeleyici(gizliDegerler) };
}

/** GET /platform/kapsam-matrisi @param {Veritabani} vt @param {URLSearchParams} q */
export function kapsamMatrisiUcu(vt, q) {
  const g = matrisGirdisi(vt, Object.fromEntries(q.entries()));
  return { matris: kapsamMatrisi(vt, g.projeId, { ortamId: g.ortamId, aralik: g.aralik }) };
}

/** POST /platform/kapsam-matrisi/csv @param {Veritabani} vt @param {Record<string, unknown>} govde */
export function kapsamMatrisiCsvUcu(vt, govde) {
  const g = matrisGirdisi(vt, govde);
  const m = kapsamMatrisi(vt, g.projeId, { ortamId: g.ortamId, aralik: g.aralik });
  return { dosyaAdi: kapsamMatrisiDosyaAdi(m, 'csv'), csv: kapsamMatrisiCsv(m), satir: m.satirlar.length };
}

/**
 * POST /platform/kapsam-matrisi/pdf: PDF (yerel Chromium; ağ istekleri engelli; diske yazılmaz).
 * @param {Veritabani} vt @param {Record<string, unknown>} govde @param {{ simdi?: Date }} [b]
 */
export async function kapsamMatrisiPdf(vt, govde, b = {}) {
  const g = matrisGirdisi(vt, govde, b.simdi);
  const m = kapsamMatrisi(vt, g.projeId, { ortamId: g.ortamId, aralik: g.aralik, simdi: b.simdi });
  const { html, baslik } = kapsamMatrisiHtml(m, maskeleyiciler(vt, g.projeId));
  const { pdf, engellenenIstek } = await htmldenPdf(html, { altBilgi: `Nöbetçi · ${baslik}` });
  return { pdf, dosyaAdi: kapsamMatrisiDosyaAdi(m, 'pdf'), sayfa: pdfSayfaSayisi(pdf), engellenenIstek, html };
}

/** @type {Array<[string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown>]>} */
export const KAPSAM_MATRISI_GET_UCLARI = [['/platform/kapsam-matrisi', kapsamMatrisiUcu]];
/** @type {Array<[string, (db: Veritabani, g: Record<string, any>) => unknown]>} */
export const KAPSAM_MATRISI_POST_UCLARI = [['/platform/kapsam-matrisi/csv', kapsamMatrisiCsvUcu]];
