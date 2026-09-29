// SERVİS SENARYO ÖNERİLERİ (genel, saf fonksiyon; YAPAY ZEKÂ YOK — kural tabanlı). Ekran önerilerinin (senaryolar/senaryo-onerileri.mjs)
// altyapısı ORTAKTIR: pairwise (pairwiseUret, AETG), puan (oneriPuani), kararlardan öğrenme (kararAgirliklari) ve red / erteleme
// (oneriRedDurumu). Burada yalnız servise özgü kısım var: metodun alanları, senaryo gövdesinden değer okuma / yazma (SOAP: servis-govdesi.mjs;
// REST: yol / sorgu / JSON gövde), şema kısıtlarından sınır ve negatif, servis koşu geçmişinden risk.
//
// İlkeler ("çok değil, işe yarar senaryo"):
//  1) Her önerinin gerekçesi var; yeni bir şey kapsamayan öneri ELENİR (mevcut senaryolar ve veri güdümlü satırlar kapsanmış sayılır).
//  2) Öneriler metot bazındadır: senaryosu olmayan metoda başarılı akış; liste alanlarının (enum / seçenek / evet-hayır / tablo listesi)
//     eksik ikilileri (pairwise) ve hiç denenmemiş değerleri; şema kısıtlarından (WSDL / XSD, OpenAPI) zorunlu alan eksik, sınır ve negatif;
//     geçmişten risk (son 14 gün başarısız senaryoların değerleri öne; son 90 günde görülen, beklenen olarak test edilmemiş hata mesajı).
//  3) Şemada kuralı olmayan alanda sınır / negatif UYDURULMAZ. Aynı etkiyi yaratan negatiflerden biri kalır: alan başına en çok bir
//     geçerli sınır + bir negatif (en anlamlısı: sınır dışı › uzunluk dışı › liste dışı › desen dışı › biçim dışı › yanlış tip).
//  4) Hassas alanlar (gizli adlar, gizli sütuna bağlı, REST ucunun gizli alanları) sınır / negatif / pairwise'a girmez; değerleri yazılmaz.
//  5) Beklenen sonuç: pozitifte "başarılı" (SOAP: zarf + Fault yok; REST: 2xx); negatifte "Hata beklenir" (SOAP Fault / HTTP 4xx-5xx) ve
//     mesaj BOŞ (tahmin yok; kullanıcı yazar ya da ilk koşudan alır); görülen mesaj önerisinde beklenen o mesajdır — maskeli parça
//     varsa doğrudan eklenemez (engel; önizlemede düzeltilir).
//  6) Öneri yalnız senaryo TASLAĞIDIR: hiçbir istek atılmaz, hiçbir şey kaydedilmez.
// Tipler: servis-onerileri.d.mts.
import {
  KOMBINASYON_ALAN_SINIRI, KOMBINASYON_DEGER_SINIRI, MASKE, ONERI_UST_SINIRI, PAIRWISE_SATIR_SINIRI,
  ikiliAnahtari, ikiliCoz, kararAgirliklari, kisalt, normalMetin, oneriPuani, oneriRedDurumu, pairwiseUret
} from '../senaryolar/senaryo-onerileri.mjs';
import { alanSatirlari, baslangicDegerleri, govdeCoz, govdeUret } from './servis-govdesi.mjs';
import { baslangicSablonu } from './rest-semasi.mjs';
import { basvuru, basvuruCoz, grupAnahtari, sutunSecenekleri } from '../tablolar/tablo-secimi.mjs';

/** Servis öneri türleri (karar kaydı bu adları taşır). */
export const SERVIS_ONERI_TURLERI = Object.freeze(['basari', 'zorunlu', 'sinir', 'negatif', 'deger', 'kombinasyon', 'uyari']);
/** Negatif sınıfları, anlamlılık sırasıyla (aynı etki: alan başına yalnız ilki önerilir). */
export const NEGATIF_SINIFLARI = Object.freeze(['sinirDisi', 'uzunlukDisi', 'listeDisi', 'desenDisi', 'bicimDisi', 'yanlisTip']);
const NEGATIF_ETIKETI = { sinirDisi: 'sınır dışı', uzunlukDisi: 'uzunluk sınırı + 1', listeDisi: 'liste dışı değer', desenDisi: 'desene uymayan değer', bicimDisi: 'biçime uymayan değer', yanlisTip: 'yanlış tip' };
const HAM = '__NOBETCI_HAM__';
const SAYISAL = new Set(['tamsayi', 'ondalik']);
/** OpenAPI biçimlerinin (format) denetimi — yalnız "biçim dışı" negatifi ve kapsam için. */
const BICIM_DESENLERI = Object.freeze({
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, date: /^\d{4}-\d{2}-\d{2}$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, uri: /^[a-z][a-z0-9+.-]*:/i, ipv4: /^(\d{1,3}\.){3}\d{1,3}$/
});
const TIPLI = new Set(['tamsayi', 'ondalik', 'mantiksal', 'tarih', 'tarihSaat']);
const TIP_ADI = { tamsayi: 'tam sayı', ondalik: 'sayı', mantiksal: 'evet / hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @template T @param {T} d @returns {T} */
const kopya = (d) => (d === undefined ? d : JSON.parse(JSON.stringify(d)));
/** @param {unknown[]} l */
const benzersiz = (l) => [...new Set(l)];
/** Kayıtlarda gizli değerler "***" / "•••" ile maskelenir. @param {unknown} m */
export const maskeliMi = (m) => /\*{3,}|•{3,}/.test(String(m ?? ''));

/** Başarı beklentisi (mevcut senaryoların varsayılanı gibi): SOAP zarfı + Fault yok; REST 2xx. @param {'soap' | 'rest'} tur */
export const basariKontrolleri = (tur) => (tur === 'rest' ? [{ tur: 'durumKodu', deger: '200-299' }] : [{ tur: 'soapYaniti' }, { tur: 'soapHatasiYok' }]);
/**
 * "Hata beklenir": SOAP Fault ya da HTTP 4xx / 5xx (servis türüne göre). Mesaj verilirse "Yanıtta geçer" kontrolü eklenir (tahmin edilmez).
 * hataTuru 'yanit': mesaj başarılı bir yanıtın içinde görüldü (Fault / HTTP hatası yok) — yalnız mesaj beklenir.
 * @param {'soap' | 'rest'} tur @param {string} [mesaj] @param {'fault' | 'http' | 'yanit'} [hataTuru]
 */
export function hataKontrolleri(tur, mesaj = '', hataTuru) {
  /** @type {Array<Record<string, string>>} */
  const liste = hataTuru === 'yanit' ? (tur === 'rest' ? [] : [{ tur: 'soapYaniti' }]) : tur === 'rest' ? [{ tur: 'durumKodu', deger: '400-599' }] : [{ tur: 'soapHatasi' }];
  if (mesaj) liste.push({ tur: 'icerir', deger: mesaj });
  return liste;
}
/** Senaryo başarı mı bekliyor (hata kontrolü yok). @param {{ kontroller?: Array<Record<string, any>> }} icerik */
const basariBekler = (icerik) => !(icerik.kontroller ?? []).some((k) => k.tur === 'soapHatasi' || (k.tur === 'durumKodu' && /^\s*[45]/.test(String(k.deger ?? '')))
  || (k.tur === 'veya' && (k.alt ?? []).some((/** @type {any} */ a) => a.tur === 'soapHatasi')));

// ---- Değer okuma / yazma (SOAP gövdesi; REST yol, sorgu, JSON gövde) ----------------------------------------------------------

/** "${…}" içi → alan değeri (tablo başvurusu, akış değeri, satır içi hesap, parametre). @param {string} ic @returns {import('./servis-govdesi.mjs').AlanDegeri} */
function basvuruDegeri(ic) {
  const t = ic.trim();
  if (/^akis:/.test(t)) return { kaynak: 'akis', deger: t.slice(5).trim() };
  if (/^hesap:/.test(t)) return { kaynak: 'hesap', deger: t.slice(6).trim() };
  const b = basvuruCoz(t);
  return b && t.includes('.') ? { kaynak: 'tablo', deger: t } : { kaynak: 'parametre', deger: t };
}
/** Tam "${…}" metni mi. @param {string} s */
const tamBasvuru = (s) => /^\s*\$\{[^{}]+\}\s*$/u.test(s);

/**
 * JSON gövdesindeki tırnaksız ${…} (ör. sayı alanında ${Tablo.Tutar}) okunabilsin diye işaretli metne sarılır; dizgi içindekiler dokunulmaz.
 * @param {string} metin
 */
function hamSar(metin) {
  let s = '';
  let dizgide = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (dizgide) { s += c; if (c === '\\') { s += metin[i + 1] ?? ''; i++; } else if (c === '"') dizgide = false; continue; }
    if (c === '"') { dizgide = true; s += c; continue; }
    if (c === '$' && metin[i + 1] === '{') {
      const son = metin.indexOf('}', i);
      if (son > i) { s += JSON.stringify(`${HAM}${metin.slice(i, son + 1)}${HAM}`); i = son; continue; }
    }
    s += c;
  }
  return s;
}
/** @param {string} metin */
const hamCoz = (metin) => metin.replace(new RegExp(`"${HAM}(.*?)${HAM}"`, 'g'), (_m, ic) => JSON.parse(`"${ic}"`));

/**
 * Metodun değer erişimi: oku(icerik) → { degerler: yol → AlanDegeri, uyumsuz }; yaz(icerik, degisenler, tabloSecimleri?) → yeni içerik
 * (yalnız değişen alanlar yazılır; gövdenin geri kalanı korunur) ya da null (yazılamaz).
 * @param {'soap' | 'rest'} servisTuru @param {import('./servis-onerileri.d.mts').ServisOneriMetodu} m @param {'1.1' | '1.2'} [soapSurumu]
 * @returns {import('./servis-onerileri.d.mts').MetotErisimi}
 */
export function metotErisimi(servisTuru, m, soapSurumu) {
  if (servisTuru !== 'rest') {
    const sema = m.sema;
    return {
      oku(icerik) {
        if (!sema) return { degerler: {}, uyumsuz: ['Metodun alan listesi (WSDL şeması) yok.'] };
        const c = govdeCoz(String(icerik.govde ?? ''), sema);
        return { degerler: c.degerler, uyumsuz: c.uyumsuz };
      },
      yaz(icerik, degisenler) {
        if (!sema) return null;
        const c = govdeCoz(String(icerik.govde ?? ''), sema);
        if (c.uyumsuz.length) return null;
        return { ...icerik, govde: govdeUret(sema, { ...c.degerler, ...degisenler }, soapSurumu ? { soapSurumu } : {}) };
      }
    };
  }
  const uc = m.uc ?? { yol: '' };
  const ucParcalari = String(uc.yol ?? '').split('/');
  const alanTipi = new Map(m.alanlar.map((a) => [a.yol, a.tip]));
  /** @param {string} s */
  const coz = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  /** @param {string} s @returns {import('./servis-govdesi.mjs').AlanDegeri} */
  const metinDegeri = (s) => (tamBasvuru(s) ? basvuruDegeri(s.trim().slice(2, -1)) : s === '' ? { kaynak: 'bos' } : { kaynak: 'sabit', deger: s });
  /** @param {unknown} v @returns {import('./servis-govdesi.mjs').AlanDegeri} */
  const jsonDegeri = (v) => {
    if (v === undefined) return { kaynak: 'gonderme' };
    if (v === null) return { kaynak: 'nil' };
    if (typeof v === 'string') {
      if (v.startsWith(HAM) && v.endsWith(HAM)) return basvuruDegeri(v.slice(HAM.length + 2, -HAM.length - 1));
      return metinDegeri(v);
    }
    if (typeof v === 'number' || typeof v === 'boolean') return { kaynak: 'sabit', deger: String(v) };
    return { kaynak: 'hesap', deger: JSON.stringify(v) };
  };
  /** @param {string} govde @returns {{ obj: unknown; hata: boolean }} */
  const govdeOku = (govde) => {
    if (!govde.trim()) return { obj: undefined, hata: false };
    try { return { obj: JSON.parse(hamSar(govde)), hata: false }; } catch { return { obj: undefined, hata: true }; }
  };
  /** @param {unknown} obj @param {string[]} p */
  const al = (obj, p) => {
    /** @type {any} */
    let d = obj;
    for (const x of p) {
      if (Array.isArray(d)) d = d[0];
      if (!nesneMi(d)) return undefined;
      d = d[x];
    }
    return d;
  };
  /** Yol + sorgu. @param {string} yol */
  const yolAyir = (yol) => { const i = yol.indexOf('?'); return i < 0 ? [yol, ''] : [yol.slice(0, i), yol.slice(i + 1)]; };
  return {
    oku(icerik) {
      /** @type {Record<string, import('./servis-govdesi.mjs').AlanDegeri>} */
      const degerler = {};
      const uyumsuz = [];
      const [yolKismi, sorgu] = yolAyir(String(icerik.http?.yol ?? ''));
      const parcalar = yolKismi.split('/');
      ucParcalari.forEach((p, i) => { const e = /^\{(.+)\}$/.exec(p); if (e) degerler[`yol/${e[1]}`] = parcalar[i] === undefined ? { kaynak: 'gonderme' } : metinDegeri(coz(parcalar[i])); });
      for (const p of sorgu.split('&').filter(Boolean)) {
        const i = p.indexOf('=');
        const ad = coz(i < 0 ? p : p.slice(0, i));
        const d = i < 0 ? '' : p.slice(i + 1);
        degerler[`sorgu/${ad}`] = metinDegeri(d.includes('${') ? d : coz(d));
      }
      const g = govdeOku(String(icerik.govde ?? ''));
      if (g.hata && m.alanlar.some((a) => a.yol.startsWith('govde/'))) uyumsuz.push('Gövde JSON olarak okunamadı.');
      for (const a of m.alanlar) {
        if (a.yol.startsWith('govde/')) degerler[a.yol] = jsonDegeri(al(g.obj, a.yol.split('/').slice(1)));
        else degerler[a.yol] ??= { kaynak: 'gonderme' };
      }
      return { degerler, uyumsuz };
    },
    yaz(icerik, degisenler) {
      const [yolKismi, sorgu] = yolAyir(String(icerik.http?.yol ?? ''));
      const parcalar = yolKismi.split('/');
      /** @param {import('./servis-govdesi.mjs').AlanDegeri} v @param {boolean} url */
      const metin = (v, url) => (v.kaynak === 'tablo' || v.kaynak === 'parametre' ? `\${${v.deger ?? ''}}` : v.kaynak === 'akis' ? `\${akis:${v.deger ?? ''}}`
        : v.kaynak === 'hesap' ? `\${hesap: ${v.deger ?? ''}}` : url ? encodeURIComponent(v.deger ?? '') : v.deger ?? '');
      /** @type {Array<[string, string]>} */
      const sorguListesi = sorgu.split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [i < 0 ? p : p.slice(0, i), i < 0 ? '' : p.slice(i + 1)]; });
      let govdeDegisti = false;
      const g = govdeOku(String(icerik.govde ?? ''));
      let obj = g.obj;
      for (const [yol, v] of Object.entries(degisenler)) {
        if (yol.startsWith('yol/')) {
          const i = ucParcalari.indexOf(`{${yol.slice(4)}}`);
          if (i >= 0 && v.kaynak !== 'gonderme') parcalar[i] = metin(v, true);
        } else if (yol.startsWith('sorgu/')) {
          const ad = encodeURIComponent(yol.slice(6));
          const j = sorguListesi.findIndex(([a]) => a === ad || coz(a) === yol.slice(6));
          if (v.kaynak === 'gonderme') { if (j >= 0) sorguListesi.splice(j, 1); } else if (j >= 0) sorguListesi[j][1] = metin(v, true); else sorguListesi.push([ad, metin(v, true)]);
        } else if (yol.startsWith('govde/')) {
          if (g.hata) return null;
          govdeDegisti = true;
          if (!nesneMi(obj)) obj = {};
          const p = yol.split('/').slice(1);
          /** @type {any} */
          let d = obj;
          for (const x of p.slice(0, -1)) {
            if (Array.isArray(d[x])) { if (!nesneMi(d[x][0])) d[x][0] = {}; d = d[x][0]; continue; }
            if (!nesneMi(d[x])) d[x] = {};
            d = d[x];
          }
          const son = p[p.length - 1];
          const tip = alanTipi.get(yol);
          const eski = d[son];
          if (v.kaynak === 'gonderme') delete d[son];
          else if (v.kaynak === 'nil') d[son] = null;
          else if (v.kaynak === 'bos') d[son] = '';
          else if (v.kaynak === 'sabit') {
            const s = v.deger ?? '';
            d[son] = tip && SAYISAL.has(tip) && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : tip === 'mantiksal' && /^(true|false)$/.test(s) ? s === 'true' : s;
          } else {
            // Başvuru: önceki değer tırnaksızsa (sayı alanı) ya da alan sayısal / evet-hayır ise tırnaksız yazılır.
            const hamMi = (typeof eski === 'string' && eski.startsWith(HAM)) || typeof eski === 'number' || typeof eski === 'boolean' || (tip !== undefined && (SAYISAL.has(tip) || tip === 'mantiksal'));
            d[son] = hamMi ? `${HAM}${metin(v, false)}${HAM}` : metin(v, false);
          }
        }
      }
      const yeniYol = `${parcalar.join('/')}${sorguListesi.length ? `?${sorguListesi.map(([a, d]) => `${a}=${d}`).join('&')}` : ''}`;
      return {
        ...icerik, ...(icerik.http ? { http: { ...icerik.http, yol: yeniYol } } : {}),
        ...(govdeDegisti ? { govde: hamCoz(JSON.stringify(obj, null, 2)) } : {})
      };
    }
  };
}

// ---- Şema kısıtlarından sınır ve negatif ------------------------------------------------------------------------------------

/** @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a */
const sayisalMi = (a) => SAYISAL.has(a.tip) && a.tipSemadan;
/** Kısıt metni ("en az 1, en çok 99, en çok 8 karakter, desen /…/"). @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a */
function kuralMetni(a) {
  const k = a.kisit ?? {};
  return [
    k.enAz !== undefined ? `${k.altHaric ? 'büyük' : 'en az'} ${k.enAz}` : null, k.enCok !== undefined ? `${k.ustHaric ? 'küçük' : 'en çok'} ${k.enCok}` : null,
    k.enAzUzunluk !== undefined && k.enAzUzunluk === k.enCokUzunluk ? `tam ${k.enAzUzunluk} karakter` : null,
    k.enAzUzunluk !== undefined && k.enAzUzunluk !== k.enCokUzunluk ? `en az ${k.enAzUzunluk} karakter` : null,
    k.enCokUzunluk !== undefined && k.enAzUzunluk !== k.enCokUzunluk ? `en çok ${k.enCokUzunluk} karakter` : null,
    k.desen ? `desen /${k.desen}/` : null, k.bicim ? `biçim ${k.bicim}` : null,
    a.secenekler?.length ? `liste: ${a.secenekler.slice(0, 6).join(', ')}${a.secenekler.length > 6 ? '…' : ''}` : null,
    a.tipSemadan && TIPLI.has(a.tip) ? `tip: ${TIP_ADI[/** @type {keyof typeof TIP_ADI} */ (a.tip)]}` : null
  ].filter(Boolean).join(', ');
}
/** @param {string | undefined} desen */
function desenDerle(desen) {
  if (!desen) return null;
  try { return new RegExp(`^(?:${desen})$`, 'u'); } catch { return null; }
}
/**
 * Değer alanın şema kurallarından birini çiğniyor mu (negatif sınıfı kapsandı mı sorusu için).
 * @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a @param {string} d
 */
export function kuralIhlaliMi(a, d) {
  const k = a.kisit ?? {};
  if (sayisalMi(a) || k.enAz !== undefined || k.enCok !== undefined) {
    const n = Number(d);
    if (sayisalMi(a) && (d.trim() === '' || !Number.isFinite(n) || (a.tip === 'tamsayi' && !Number.isInteger(n)))) return true;
    if (Number.isFinite(n) && ((k.enAz !== undefined && (k.altHaric ? n <= k.enAz : n < k.enAz)) || (k.enCok !== undefined && (k.ustHaric ? n >= k.enCok : n > k.enCok)))) return true;
  }
  if ((k.enAzUzunluk !== undefined && d.length < k.enAzUzunluk) || (k.enCokUzunluk !== undefined && d.length > k.enCokUzunluk)) return true;
  if (a.secenekler?.length && !a.secenekler.includes(d)) return true;
  const re = desenDerle(k.desen);
  if (re && !re.test(d)) return true;
  const bicim = k.bicim ? BICIM_DESENLERI[/** @type {keyof typeof BICIM_DESENLERI} */ (k.bicim)] : undefined;
  if (bicim && !bicim.test(d)) return true;
  if (a.tipSemadan && a.tip === 'mantiksal' && !/^(true|false|1|0)$/.test(d)) return true;
  if (a.tipSemadan && a.tip === 'tarih' && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
  return false;
}

/**
 * Alanın geçerli sınır adayı (en çok bir) ve negatif adayları (sınıf sırasıyla). Kuralı olmayan alanda boş.
 * @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a @param {string | undefined} tabanDeger
 * @returns {{ pozitif: { deger: string; etiket: string } | null; negatifler: Array<{ sinif: string; deger: string; etiket: string }>; notlar: string[] }}
 */
export function sinirAdaylari(a, tabanDeger) {
  const k = a.kisit ?? {};
  /** @type {Array<{ sinif: string; deger: string; etiket: string }>} */
  const negatifler = [];
  /** @type {{ deger: string; etiket: string } | null} */
  let pozitif = null;
  const notlar = [];
  const re = desenDerle(k.desen);
  if (k.desen && !re) notlar.push(`"${a.yol}": şemadaki desen okunamadı; desen önerisi üretilmedi.`);
  // Sayı aralığı (tam sayıda adım 1; ondalıkta dışarısı ±1, "hariç" sınırın içi ±0,01).
  if (k.enAz !== undefined || k.enCok !== undefined) {
    const tam = a.tip !== 'ondalik';
    const ic = tam ? 1 : 0.01;
    const yuvarla = (/** @type {number} */ n) => String(Number(n.toFixed(tam ? 0 : 6)));
    if (k.enAz !== undefined) pozitif = { deger: yuvarla(k.altHaric ? k.enAz + ic : k.enAz), etiket: 'alt sınır' };
    else if (k.enCok !== undefined) pozitif = { deger: yuvarla(k.ustHaric ? k.enCok - ic : k.enCok), etiket: 'üst sınır' };
    if (k.enCok !== undefined) negatifler.push({ sinif: 'sinirDisi', deger: yuvarla(k.ustHaric ? k.enCok : k.enCok + 1), etiket: 'üst sınır + 1' });
    else if (k.enAz !== undefined) negatifler.push({ sinif: 'sinirDisi', deger: yuvarla(k.altHaric ? k.enAz : k.enAz - 1), etiket: 'alt sınır − 1' });
  }
  // Uzunluk (desen varsa desene uyan dolgu aranır; bulunamazsa uzunluk önerisi yok).
  if (k.enAzUzunluk !== undefined || k.enCokUzunluk !== undefined) {
    const tohumlar = benzersiz([typeof tabanDeger === 'string' && tabanDeger && !tamBasvuru(tabanDeger) ? tabanDeger : null, 'a', '1', 'A'].filter((x) => x !== null)).map(String);
    const dolgu = (/** @type {string} */ t, /** @type {number} */ n) => t.repeat(Math.ceil(n / t.length)).slice(0, n);
    const hedef = k.enCokUzunluk ?? /** @type {number} */ (k.enAzUzunluk);
    const tohum = tohumlar.find((t) => !re || re.test(dolgu(t, hedef)));
    if (tohum === undefined) notlar.push(`"${a.yol}": geçerli uzunlukta desene uyan örnek üretilemedi; uzunluk sınırı önerilmedi.`);
    else {
      if (!pozitif && hedef > 0) pozitif = { deger: dolgu(tohum, hedef), etiket: k.enCokUzunluk !== undefined ? (k.enAzUzunluk === k.enCokUzunluk ? 'tam uzunluk' : 'en uzun') : 'en kısa' };
      if (k.enCokUzunluk !== undefined) negatifler.push({ sinif: 'uzunlukDisi', deger: dolgu(tohum, k.enCokUzunluk + 1), etiket: 'en uzun + 1' });
      else if (/** @type {number} */ (k.enAzUzunluk) > 1) negatifler.push({ sinif: 'uzunlukDisi', deger: dolgu(tohum, /** @type {number} */ (k.enAzUzunluk) - 1), etiket: 'en kısa − 1' });
    }
  }
  if (a.secenekler?.length) {
    const sayilar = a.secenekler.every((s) => /^-?\d+$/.test(s));
    let d = sayilar ? String(Math.max(...a.secenekler.map(Number)) + 1) : 'X';
    while (a.secenekler.includes(d)) d += 'X';
    negatifler.push({ sinif: 'listeDisi', deger: d, etiket: 'liste dışı' });
  }
  if (re) {
    const d = ['#', 'a', '0', '-'].find((x) => !re.test(x));
    if (d !== undefined) negatifler.push({ sinif: 'desenDisi', deger: d, etiket: 'desene uymayan' });
  }
  if (k.bicim && Object.hasOwn(BICIM_DESENLERI, k.bicim)) negatifler.push({ sinif: 'bicimDisi', deger: 'abc', etiket: `${k.bicim} biçimine uymayan` });
  if (a.tipSemadan && TIPLI.has(a.tip)) negatifler.push({ sinif: 'yanlisTip', deger: 'abc', etiket: 'yanlış tip' });
  // Aynı değer iki sınıfta çıkarsa ilki kalır; negatif değer geçerli olmamalı (ör. desensiz uzunluk).
  const temiz = negatifler.filter((n, i) => negatifler.findIndex((x) => x.deger === n.deger) === i && kuralIhlaliMi(a, n.deger));
  return { pozitif: pozitif && !kuralIhlaliMi(a, pozitif.deger) ? pozitif : null, negatifler: temiz, notlar };
}

// ---- Öneriler ---------------------------------------------------------------------------------------------------------------

/**
 * @param {import('./servis-onerileri.d.mts').ServisOneriGirdisi} g
 * @returns {import('./servis-onerileri.d.mts').ServisOneriSonucu}
 */
export function servisOnerileri(g) {
  const servisTuru = g.servis.tur === 'rest' ? 'rest' : 'soap';
  const simdi = g.simdi instanceof Date ? g.simdi : new Date();
  const ustSinir = typeof g.ustSinir === 'number' && g.ustSinir > 0 ? g.ustSinir : ONERI_UST_SINIRI;
  const tablolar = Array.isArray(g.tablolar) ? g.tablolar : [];
  const ortamId = g.ortamId ?? null;
  const gecmis = g.gecmis ?? { hataGunu: 14, uyariGunu: 90, hatalar: [], mesajlar: [] };
  const hataGunu = gecmis.hataGunu ?? 14;
  const uyariGunu = gecmis.uyariGunu ?? 90;
  const tumKararlar = (g.kararlar ?? []).filter((k) => nesneMi(k) && (!k.servisId || k.servisId === g.servis.id));
  const secilenMetotlar = g.operasyon ? g.metotlar.filter((m) => m.ad === g.operasyon) : g.metotlar;
  const tekMetot = secilenMetotlar.length === 1 ? secilenMetotlar[0] : null;
  /** @type {Array<{ tur: string; mesaj: string }>} */
  const notlar = [];
  const not = (/** @type {string} */ tur, /** @type {string} */ mesaj) => { if (!notlar.some((n) => n.mesaj === mesaj)) notlar.push({ tur, mesaj }); };
  const elenen = { kapsanan: 0, denklik: 0, reddedilen: 0, ertelenen: 0 };
  /** @type {any[]} */
  const adaylar = [];
  /** @type {import('./servis-onerileri.d.mts').ServisOneriSonucu['tabanlar']} */
  const tabanlar = [];
  const olcu = { alanlar: /** @type {Array<{ etiket: string; kapsandi: boolean }>} */ ([]), degerler: /** @type {Array<{ etiket: string; kapsandi: boolean }>} */ ([]), mesajlar: /** @type {Array<{ etiket: string; kapsandi: boolean }>} */ ([]) };
  /** @type {import('./servis-onerileri.d.mts').ServisOneriSonucu['kombinasyon']} */
  const kombinasyon = { operasyon: tekMetot?.ad ?? null, secilebilir: [], secili: [], alanSiniri: KOMBINASYON_ALAN_SINIRI, evren: 0, kapsanan: 0, eksik: 0, gecersiz: 0, satir: 0, kalan: 0 };
  let ikiliOlcusu = { kapsanan: 0, toplam: 0, eksikler: /** @type {string[]} */ ([]) };
  const tabloById = (/** @type {string} */ id) => tablolar.find((t) => t.id === id);

  // Başarısız senaryolar (son hataGunu gün) → senaryo başına sayı.
  const senaryoHatasi = new Map();
  for (const h of gecmis.hatalar ?? []) if (h && h.senaryoId && h.sayi > 0) senaryoHatasi.set(h.senaryoId, (senaryoHatasi.get(h.senaryoId) ?? 0) + h.sayi);

  for (const m of secilenMetotlar) {
    const erisim = metotErisimi(servisTuru, m, g.servis.soapSurumu);
    const coklu = secilenMetotlar.length > 1;
    const on = coklu ? `${m.ad} › ` : '';
    const alanlar = m.alanlar;
    const alanByYol = new Map(alanlar.map((a) => [a.yol, a]));
    const senaryolar = g.senaryolar.filter((s) => s.icerik && s.icerik.tur !== 'akis' && s.icerik.operasyon === m.ad);
    const okunan = senaryolar.map((s) => ({ s, ...erisim.oku(s.icerik) }));
    const alanKapsami = (/** @type {import('../senaryolar/senaryo-onerileri.d.mts').OneriKarari} */ k) => k.servisId === g.servis.id && k.metot === m.ad;
    const agirliklar = kararAgirliklari(tumKararlar, null, alanKapsami);
    const kimlikOn = `${m.ad}|`;

    // ---- Taban: başarı bekleyen, okunabilen senaryo (son sonucu başarılı olan önce); yoksa şemadan ----------------------------
    const tabanSenaryosu = okunan.map((o, i) => ({ o, i })).filter(({ o }) => basariBekler(o.s.icerik) && !o.uyumsuz.length)
      .sort((a, b) => Number(b.o.s.sonDurum === 'basarili') - Number(a.o.s.sonDurum === 'basarili') || a.i - b.i)[0]?.o ?? null;
    /** @type {Record<string, any>} */
    let tabanIcerik;
    /** @type {Record<string, import('./servis-govdesi.mjs').AlanDegeri>} */
    let tabanDegerler;
    /** @type {string[]} */
    const tabanEksik = [];
    if (tabanSenaryosu) {
      const { kontroller: _k, aciklama: _a, kaynak: _ky, kosuOrtamlari: _ko, veriKosulari: _vk, sozlesmeDogrula: _sd, ...kalan } = tabanSenaryosu.s.icerik;
      tabanIcerik = kopya(kalan);
      tabanDegerler = tabanSenaryosu.degerler;
    } else {
      const s = semadanTaban(servisTuru, m, g.servis.soapSurumu);
      tabanIcerik = s.icerik;
      tabanDegerler = erisim.oku(tabanIcerik).degerler;
    }
    const tabanMetni = tabanSenaryosu ? `"${tabanSenaryosu.s.baslik}" senaryosundaki gibi` : 'şemanın ve bağlı tabloların değerleriyle';
    // Değeri olmayan zorunlu alanlar (zorunlu = şemada zorunlu ve üst grupları da gönderilmek zorunda; bkz. servis-oneri-baglami.mjs).
    for (const a of alanlar) {
      const v = tabanDegerler[a.yol];
      if (a.zorunlu && (!v || ['gonderme', 'bos', 'nil'].includes(v.kaynak) || ((v.kaynak === 'sabit' || v.kaynak === 'tablo') && !v.deger))) tabanEksik.push(a.yol);
    }
    const tabanEksikleri = tabanSenaryosu ? [] : tabanEksik;
    tabanlar.push({ operasyon: m.ad, kaynak: tabanSenaryosu ? 'senaryo' : 'sema', senaryoId: tabanSenaryosu?.s.id ?? null, baslik: tabanSenaryosu?.s.baslik ?? null, eksikler: tabanEksikleri });
    if (!tabanSenaryosu && senaryolar.length) not('taban', `${m.ad}: başarı bekleyen ve alan formunda okunabilen senaryo yok; öneriler şemadan kuruldu.`);

    // ---- Senaryoların denedikleri (veri güdümlü satırlar dahil) -----------------------------------------------------------------
    /** Alan değeri → karşılaştırma biçimi: { durum, deger }. Tablo başvurusu seçili satırın değeriyle (yoksa bilinmez). */
    const normal = (/** @type {import('./servis-govdesi.mjs').AlanDegeri | undefined} */ v, /** @type {Record<string, any>} */ icerik, /** @type {import('./servis-onerileri.d.mts').ServisOneriAlani} */ a) => {
      if (!v || v.kaynak === 'gonderme') return { durum: 'yok' };
      if (v.kaynak === 'bos') return { durum: 'bos', deger: '' };
      if (v.kaynak === 'nil') return { durum: 'nil' };
      if (v.kaynak === 'sabit') return { durum: 'deger', deger: v.deger ?? '' };
      if (v.kaynak === 'tablo' && a.bag) {
        const secim = icerik.tabloSecimleri?.[grupAnahtari(a.bag.tabloId, a.bag.etiket)]?.[a.bag.sutun];
        return secim ? { durum: 'deger', deger: String(secim) } : { durum: 'bilinmez' };
      }
      return { durum: 'bilinmez' };
    };
    /** @type {Array<{ s: import('./servis-onerileri.d.mts').ServisOneriSenaryosu; v: Record<string, { durum: string; deger?: string }> }>} */
    const varyantlar = [];
    for (const o of okunan) {
      /** @type {Record<string, { durum: string; deger?: string }>} */
      const temel = {};
      for (const a of alanlar) temel[a.yol] = normal(o.degerler[a.yol], o.s.icerik, a);
      const satirlar = Array.isArray(o.s.degerSatirlari) && o.s.degerSatirlari.length ? o.s.degerSatirlari : [null];
      for (const r of satirlar) {
        const v = { ...temel };
        if (r) for (const [yol, d] of Object.entries(r)) if (v[yol] && d !== undefined && d !== null) v[yol] = { durum: 'deger', deger: String(d) };
        varyantlar.push({ s: o.s, v });
      }
    }
    const denendi = (/** @type {(v: Record<string, { durum: string; deger?: string }>) => boolean} */ f) => varyantlar.some((x) => f(x.v));
    for (const a of alanlar) olcu.alanlar.push({ etiket: `${on}${a.yol}`, kapsandi: denendi((v) => v[a.yol]?.durum !== 'yok') });

    /** Önerinin değişiklik listesi (gizli değer maskeli). @param {Record<string, import('./servis-govdesi.mjs').AlanDegeri>} d */
    const farkListesi = (d) => Object.entries(d).map(([yol, v]) => {
      const a = alanByYol.get(yol);
      const deger = v.kaynak === 'gonderme' ? '(gönderilmez)' : v.kaynak === 'bos' ? '(boş)' : v.kaynak === 'nil' ? '(nil)' : v.kaynak === 'tablo' ? `Tablodan: ${v.deger}`
        : a?.gizli ? MASKE : String(v.deger ?? '');
      return { etiket: yol, deger };
    });
    /**
     * Aday ekler. degisenler: tabana göre değişen alanlar; tabloSecimi: tablo listesi değerleri (grup → sütun → değer).
     * @param {Record<string, any>} o
     */
    const adayEkle = (o) => {
      if (!o.gerekce) return;
      const kimlik = `${kimlikOn}${o.kimlik}`.slice(0, 400);
      if (adaylar.some((x) => x.kimlik === kimlik)) return;
      let icerik = o.icerik ?? erisim.yaz(tabanIcerik, o.degisenler ?? {});
      if (!icerik) { not('yazim', `${m.ad}: taban gövde değiştirilemedi (gövde alan formunda okunamıyor); bazı öneriler üretilemedi.`); return; }
      icerik = kopya(icerik);
      if (o.tabloSecimi) {
        const ts = { ...(icerik.tabloSecimleri ?? {}) };
        for (const [grup, sec] of Object.entries(/** @type {Record<string, Record<string, string>>} */ (o.tabloSecimi))) ts[grup] = { ...(ts[grup] ?? {}), ...sec };
        icerik.tabloSecimleri = ts;
      }
      icerik.operasyon = m.ad;
      icerik.kontroller = o.kontroller;
      adaylar.push({ ...o, kimlik, operasyon: m.ad, icerik, eksikler: benzersiz([...(o.eksikler ?? tabanEksikleri)]), agirliklar, sira: adaylar.length });
    };
    const hata = { tur: 'hata', mesaj: '', mesajEksik: true };

    // ---- 1) Başarılı akış (senaryosu olmayan metot) --------------------------------------------------------------------------
    if (!senaryolar.length) {
      const dolu = Object.fromEntries(Object.entries(tabanDegerler).filter(([, v]) => v.kaynak !== 'gonderme'));
      adayEkle({
        tur: 'basari', neden: 'kapsam', kimlik: 'basari', ic: 60, alanlar: [],
        baslik: `Başarılı akış: ${m.ad}`, gerekce: `“${m.ad}” metodunun hiç senaryosu yok; önce başarılı bir istek kapsanmalı`,
        ozet: `Değerler ${tabanMetni}${tabanEksikleri.length ? `; değeri olmayan zorunlu alanlar önizlemede doldurulur (${tabanEksikleri.join(', ')})` : ''}.`,
        degisiklikler: farkListesi(dolu).slice(0, 30), beklenen: { tur: 'basari' }, kontroller: basariKontrolleri(servisTuru), icerik: tabanIcerik
      });
    }

    // ---- 2) Zorunlu alan eksik ----------------------------------------------------------------------------------------------
    for (const a of alanlar) {
      if (!a.zorunlu || a.gizli || a.grup === 'yol') continue;
      const tv = tabanDegerler[a.yol];
      if (!tv || tv.kaynak === 'gonderme') continue; // tabanda gönderilmiyor: eksikliği zaten tabanın konusu
      if (denendi((v) => ['yok', 'bos', 'nil'].includes(v[a.yol]?.durum ?? ''))) { elenen.kapsanan++; continue; }
      adayEkle({
        tur: 'zorunlu', neden: 'zorunlu', kimlik: `zorunlu:${a.yol}`, ic: 50, alanlar: [a.yol],
        baslik: `Zorunlu alan eksik: ${a.ad}`, gerekce: `“${a.yol}” şemada zorunlu; gönderilmediğinde ne olduğu hiç denenmedi`,
        ozet: `"${a.yol}" gönderilmez; diğer alanlar ${tabanMetni}. Hata beklenir (mesajı siz yazın ya da ilk koşudan alın).`,
        degisiklikler: [{ etiket: a.yol, deger: '(gönderilmez)' }], degisenler: { [a.yol]: { kaynak: 'gonderme' } },
        beklenen: hata, kontroller: hataKontrolleri(servisTuru)
      });
    }

    // ---- 3) Sınır ve negatif (yalnız şema kuralı olan alanlar) ---------------------------------------------------------------
    const kuralsiz = [];
    for (const a of alanlar) {
      const kuralVar = Boolean((a.kisit && Object.keys(a.kisit).length) || a.secenekler?.length || (a.tipSemadan && TIPLI.has(a.tip)));
      if (!kuralVar) { if (!a.gizli && !a.bag) kuralsiz.push(a.yol); continue; }
      if (a.gizli) { not('hassas', `"${a.yol}" hassas bir alan: sınır / negatif değer ve kombinasyon üretilmez.`); continue; }
      const tv = tabanDegerler[a.yol];
      const s = sinirAdaylari(a, tv && tv.kaynak === 'sabit' ? tv.deger : undefined);
      s.notlar.forEach((n) => not('sinir', n));
      const kural = kuralMetni(a);
      if (s.pozitif) {
        const p = s.pozitif;
        if (denendi((v) => v[a.yol]?.durum === 'deger' && v[a.yol].deger === p.deger)) elenen.kapsanan++;
        else {
          const gosterilen = p.deger.length > 40 ? `${p.deger.length} karakter` : p.deger;
          adayEkle({
            tur: 'sinir', neden: 'sinir', kimlik: `sinir:${a.yol}:${p.deger.slice(0, 60)}`, ic: 40, alanlar: [a.yol],
            baslik: `Sınır: ${a.ad} = ${gosterilen} (${p.etiket})`, gerekce: `“${a.yol}” için şemada kural var (${kural}); ${p.etiket} (geçerli) hiç denenmedi`,
            ozet: `"${a.yol}" = ${gosterilen} (${p.etiket}; geçerli); diğer alanlar ${tabanMetni}.`,
            degisiklikler: [{ etiket: a.yol, deger: gosterilen }], degisenler: { [a.yol]: { kaynak: 'sabit', deger: p.deger } },
            beklenen: { tur: 'basari' }, kontroller: basariKontrolleri(servisTuru)
          });
        }
      }
      if (s.negatifler.length) {
        // Aynı etki (şema kuralı çiğnenir → hata): alanda bir negatif yeter. Mevcut senaryo kuralı çiğniyorsa sınıf kapsanmıştır.
        if (denendi((v) => v[a.yol]?.durum === 'deger' && kuralIhlaliMi(a, /** @type {string} */ (v[a.yol].deger)))) { elenen.kapsanan += s.negatifler.length; continue; }
        const n = /** @type {{ sinif: string; deger: string; etiket: string }} */ ([...s.negatifler].sort((x, y) => NEGATIF_SINIFLARI.indexOf(x.sinif) - NEGATIF_SINIFLARI.indexOf(y.sinif))[0]);
        elenen.denklik += s.negatifler.length - 1;
        const digerleri = s.negatifler.filter((x) => x !== n).map((x) => NEGATIF_ETIKETI[/** @type {keyof typeof NEGATIF_ETIKETI} */ (x.sinif)]);
        const gosterilen = n.deger.length > 40 ? `${n.deger.length} karakter` : n.deger;
        adayEkle({
          tur: 'negatif', neden: 'sinir', kimlik: `negatif:${a.yol}:${n.sinif}`, ic: 60, alanlar: [a.yol],
          baslik: `Negatif: ${a.ad} = ${gosterilen} (${n.etiket})`,
          gerekce: `“${a.yol}” için şemada kural var (${kural}); ${NEGATIF_ETIKETI[/** @type {keyof typeof NEGATIF_ETIKETI} */ (n.sinif)]} hiç denenmedi${digerleri.length ? ` (aynı etkideki ${digerleri.join(', ')} önerilmedi)` : ''}`,
          ozet: `"${a.yol}" = ${gosterilen} (${n.etiket}); diğer alanlar ${tabanMetni}. Hata beklenir (mesajı siz yazın ya da ilk koşudan alın).`,
          degisiklikler: [{ etiket: a.yol, deger: gosterilen }], degisenler: { [a.yol]: { kaynak: 'sabit', deger: n.deger } },
          beklenen: hata, kontroller: hataKontrolleri(servisTuru)
        });
      }
    }
    if (kuralsiz.length) not('sinir', `${on}Şemada kuralı olmayan alanlar için sınır / negatif önerilmez (tahmin yok): ${kuralsiz.slice(0, 12).join(', ')}${kuralsiz.length > 12 ? ` (+${kuralsiz.length - 12})` : ''}.`);

    // ---- 4) Liste alanları: hiç denenmemiş değerler ve pairwise ----------------------------------------------------------------
    /** @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a */
    const listeDegerleri = (a) => {
      if (a.gizli) return [];
      if (a.bag) {
        const t = tabloById(a.bag.tabloId);
        if (!t || a.bag.gizli) return [];
        const l = sutunSecenekleri(t, {}, a.bag.sutun, ortamId);
        return l.length > 1 && l.length <= KOMBINASYON_DEGER_SINIRI ? l : [];
      }
      if (a.secenekler && a.secenekler.length > 1) return a.secenekler.slice(0, KOMBINASYON_DEGER_SINIRI);
      if (a.tip === 'mantiksal' && a.tipSemadan) return ['true', 'false'];
      return [];
    };
    const listeAlanlari = alanlar.filter((a) => listeDegerleri(a).length > 1);
    /** Liste değerinin yazımı: tabloya bağlıysa başvuru + satır seçimi, değilse sabit. @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a @param {string} v */
    const listeYazimi = (a, v) => (a.bag
      ? { degisen: { [a.yol]: { kaynak: /** @type {const} */ ('tablo'), deger: basvuru(a.bag.tablo, a.bag.sutun, a.bag.etiket) } }, secim: { [grupAnahtari(a.bag.tabloId, a.bag.etiket)]: { [a.bag.sutun]: v } } }
      : { degisen: { [a.yol]: { kaynak: /** @type {const} */ ('sabit'), deger: v } }, secim: {} });
    // Risk: son dönemde başarısız senaryoların liste değerleri.
    const degerRiski = new Map();
    for (const x of varyantlar) {
      const n = senaryoHatasi.get(x.s.id);
      if (!n) continue;
      for (const a of listeAlanlari) { const d = x.v[a.yol]; if (d?.durum === 'deger') degerRiski.set(`${a.yol}=${d.deger}`, (degerRiski.get(`${a.yol}=${d.deger}`) ?? 0) + n); }
    }
    const riskOf = (/** @type {string} */ a, /** @type {string} */ v) => degerRiski.get(`${a}=${v}`) ?? 0;
    /** @type {Array<{ yol: string; deger: string; kimlik: string; etiket: string }>} */
    const denenmemis = [];
    for (const a of listeAlanlari) {
      for (const v of listeDegerleri(a)) {
        const kapsandi = denendi((x) => x[a.yol]?.durum === 'deger' && x[a.yol].deger === v);
        olcu.degerler.push({ etiket: `${on}${a.yol} = ${v}`, kapsandi });
        if (kapsandi) continue;
        const y = listeYazimi(a, v);
        const kimlik = `deger:${a.yol}=${v}`.slice(0, 200);
        denenmemis.push({ yol: a.yol, deger: v, kimlik: `${kimlikOn}${kimlik}`, etiket: `${a.yol} = ${v}` });
        adayEkle({
          tur: 'deger', neden: 'kapsam', kimlik, ic: 30, alanlar: [a.yol],
          baslik: `Değer: ${a.ad} = ${v}`, gerekce: `“${a.yol} = ${v}” (${a.bag ? `${a.bag.tablo} tablosu` : a.secenekler?.length ? 'şemadaki liste' : 'evet / hayır'}) hiç denenmedi`,
          ozet: `"${a.yol}" = ${v}${a.bag ? ' (tablodan satır seçimi)' : ''}; diğer alanlar ${tabanMetni}.`,
          degisiklikler: [{ etiket: a.yol, deger: v }], degisenler: y.degisen, tabloSecimi: y.secim,
          beklenen: { tur: 'basari' }, kontroller: basariKontrolleri(servisTuru)
        });
      }
    }
    if (tekMetot === m) {
      kombinasyon.secilebilir = listeAlanlari.map((a) => ({ id: a.yol, etiket: a.yol, secenekSayisi: listeDegerleri(a).length, varsayilan: true }));
      const istenen = Array.isArray(g.kombinasyonAlanlari) ? g.kombinasyonAlanlari.filter((y) => listeAlanlari.some((a) => a.yol === y)) : listeAlanlari.map((a) => a.yol);
      if (istenen.length > KOMBINASYON_ALAN_SINIRI) not('kombinasyon', `İkili kombinasyonda en çok ${KOMBINASYON_ALAN_SINIRI} alan kullanılır; ilk ${KOMBINASYON_ALAN_SINIRI} alan alındı.`);
      const secili = listeAlanlari.filter((a) => istenen.slice(0, KOMBINASYON_ALAN_SINIRI).includes(a.yol));
      kombinasyon.secilebilir = kombinasyon.secilebilir.map((x) => ({ ...x, varsayilan: listeAlanlari.slice(0, KOMBINASYON_ALAN_SINIRI).some((a) => a.yol === x.id) }));
      kombinasyon.secili = secili.map((a) => a.yol);
      if (secili.length >= 2) {
        /** Aynı tablo grubundaki (tablo + etiket) önceki seçili alanlar. @param {import('./servis-onerileri.d.mts').ServisOneriAlani} a */
        const oncekiGrup = (a) => (a.bag ? secili.slice(0, secili.indexOf(a)).filter((b) => b.bag && b.bag.tabloId === a.bag?.tabloId && b.bag.etiket === a.bag?.etiket) : []);
        const secenekler = (/** @type {Record<string, string>} */ satir, /** @type {string} */ yol) => {
          const a = /** @type {import('./servis-onerileri.d.mts').ServisOneriAlani} */ (alanByYol.get(yol));
          if (!a.bag) return listeDegerleri(a);
          const t = tabloById(a.bag.tabloId);
          if (!t) return [];
          const secim = Object.fromEntries(oncekiGrup(a).filter((b) => satir[b.yol]).map((b) => [/** @type {any} */ (b.bag).sutun, satir[b.yol]]));
          return sutunSecenekleri(t, secim, a.bag.sutun, ortamId).slice(0, KOMBINASYON_DEGER_SINIRI);
        };
        const ata = (/** @type {Record<string, string>} */ satir, /** @type {string} */ yol, /** @type {string} */ v, /** @type {Set<string>} */ sabit) => {
          if (!secenekler(satir, yol).includes(v)) return null;
          const r = { ...satir, [yol]: v };
          const a = /** @type {import('./servis-onerileri.d.mts').ServisOneriAlani} */ (alanByYol.get(yol));
          if (!a.bag) return r;
          for (const b of secili.slice(secili.indexOf(a) + 1)) {
            if (!b.bag || b.bag.tabloId !== a.bag.tabloId || b.bag.etiket !== a.bag.etiket) continue;
            const l = secenekler(r, b.yol);
            if (!l.includes(r[b.yol])) { if (sabit.has(b.yol)) return null; r[b.yol] = l[0] ?? ''; }
          }
          return r;
        };
        const tabanSatiri = Object.fromEntries(secili.map((a) => {
          const n = normal(tabanDegerler[a.yol], tabanIcerik, a);
          return [a.yol, n.durum === 'deger' ? String(n.deger) : ''];
        }));
        const kapsanan = varyantlar.flatMap(({ v }) => {
          const l = [];
          for (let i = 0; i < secili.length; i++) {
            const x = v[secili[i].yol];
            if (x?.durum !== 'deger') continue;
            for (let j = i + 1; j < secili.length; j++) { const y = v[secili[j].yol]; if (y?.durum === 'deger') l.push(ikiliAnahtari(secili[i].yol, String(x.deger), secili[j].yol, String(y.deger))); }
          }
          return l;
        });
        const p = pairwiseUret({
          alanlar: secili.map((a) => ({ anahtar: a.yol, degerler: listeDegerleri(a) })), taban: tabanSatiri, secenekler, ata,
          kontrolculer: (yol) => { const a = alanByYol.get(yol); return a ? oncekiGrup(a).map((b) => b.yol) : []; },
          agirlik: (k) => ikiliCoz(k).reduce((t, [a, v]) => t + riskOf(a, v), 0), kapsanan
        });
        Object.assign(kombinasyon, { evren: p.evren.length, kapsanan: p.kapsanan.length, eksik: p.evren.length - p.kapsanan.length, gecersiz: p.gecersiz.length, satir: p.satirlar.length, kalan: p.kalan.length });
        ikiliOlcusu = { kapsanan: p.kapsanan.length, toplam: p.evren.length, eksikler: p.evren.filter((k) => !p.kapsanan.includes(k)).slice(0, 50).map((k) => ikiliCoz(k).map(([a, v]) => `${a}: ${v}`).join(' + ')) };
        if (p.kalan.length) not('kombinasyon', `${p.kalan.length} eksik ikili hesap sınırı (${PAIRWISE_SATIR_SINIRI} satır) nedeniyle önerilmedi; daha az alan seçin.`);
        if (p.gecersiz.length) not('kombinasyon', `${p.gecersiz.length} ikili tablodaki satırlarla kurulamadığı için (aynı satırda birlikte yok) sayılmadı.`);
        for (const { satir, yeniIkililer } of p.satirlar) {
          /** @type {Record<string, import('./servis-govdesi.mjs').AlanDegeri>} */
          const degisen = {};
          /** @type {Record<string, Record<string, string>>} */
          const secim = {};
          const degisiklikler = [];
          for (const a of secili) {
            const v = satir[a.yol];
            if (!v || v === tabanSatiri[a.yol]) continue;
            const y = listeYazimi(a, v);
            Object.assign(degisen, y.degisen);
            for (const [gr, sc] of Object.entries(y.secim)) secim[gr] = { ...(secim[gr] ?? {}), ...sc };
            degisiklikler.push({ etiket: a.yol, deger: v });
          }
          const etiketler = yeniIkililer.map((k) => ikiliCoz(k).map(([a, v]) => `${a}: ${v}`));
          const ilk = etiketler.slice(0, 2).map(([x, y]) => `“${x}” ile “${y}”`);
          let gerekce = `${ilk.join('; ')} hiç birlikte denenmedi${yeniIkililer.length > 2 ? ` (+${yeniIkililer.length - 2} ikili daha)` : ''}`;
          let neden = 'pairwise';
          let ic = Math.min(99, 3 * yeniIkililer.length);
          const riskli = yeniIkililer.map((k) => ({ k, w: ikiliCoz(k).reduce((t, [a, v]) => t + riskOf(a, v), 0) })).filter((x) => x.w > 0).sort((x, y) => y.w - x.w)[0];
          if (riskli) {
            const [[ra, rv], [rb, rbv]] = ikiliCoz(riskli.k);
            const [ad, v] = riskOf(ra, rv) >= riskOf(rb, rbv) ? [ra, rv] : [rb, rbv];
            gerekce = `“${ad}: ${v}” son ${hataGunu} günde ${riskOf(ad, v)} başarısız koşuda yer aldı; ${gerekce}`;
            neden = 'risk';
            ic = Math.min(99, 10 * riskli.w);
          }
          adayEkle({
            tur: 'kombinasyon', neden, ic, kimlik: `kombinasyon:${secili.map((a) => `${a.yol}=${satir[a.yol] ?? ''}`).join('|')}`.slice(0, 380),
            alanlar: benzersiz(yeniIkililer.flatMap((k) => ikiliCoz(k).map(([a]) => a))), ikililer: etiketler.map((x) => x.join(' + ')), satir,
            baslik: `Kombinasyon: ${degisiklikler.map((d) => `${d.etiket} = ${d.deger}`).join(', ') || 'taban değerleri'}`, gerekce,
            ozet: `${yeniIkililer.length} eksik ikiliyi kapatır; diğer alanlar ${tabanMetni}.`, degisiklikler, degisenler: degisen, tabloSecimi: secim,
            beklenen: { tur: 'basari' }, kontroller: basariKontrolleri(servisTuru)
          });
        }
      }
    }
    // Hiç denenmemiş değer bir pairwise satırında zaten varsa ayrı öneri kalmaz (satır onu da kapsar; gerekçeye eklenir).
    for (const d of denenmemis) {
      const satirOnerisi = adaylar.find((o) => o.tur === 'kombinasyon' && o.operasyon === m.ad && o.satir && o.satir[d.yol] === d.deger);
      const i = adaylar.findIndex((o) => o.kimlik === d.kimlik);
      if (!satirOnerisi || i < 0) continue;
      adaylar.splice(i, 1);
      elenen.denklik++;
      if (satirOnerisi.neden !== 'risk') { satirOnerisi.neden = 'kapsam'; satirOnerisi.ic = Math.max(satirOnerisi.ic, 30); }
      satirOnerisi.degerler = [...(satirOnerisi.degerler ?? []), d.etiket];
    }
    for (const o of adaylar) {
      if (!o.degerler || o.gerekceGuncel) continue;
      o.gerekce = `${o.degerler.map((/** @type {string} */ x) => `“${x}”`).join(', ')} hiç denenmedi; ${o.gerekce}`;
      o.gerekceGuncel = true;
    }

    // ---- 5) Görülen hata mesajları (son uyariGunu gün) ------------------------------------------------------------------------
    /** Senaryoların beklenen olarak taşıdığı mesajlar (Yanıtta geçer / XPath / JSON / yanıt alanı değerleri). */
    const beklenenler = senaryolar.flatMap((s) => (s.icerik.kontroller ?? []).flatMap(function metinler(/** @type {any} */ k) {
      if (k.tur === 'veya') return (k.alt ?? []).flatMap(metinler);
      return ['icerir', 'xpathEsit', 'jsonEsit', 'yanitAlani'].includes(k.tur) && typeof k.deger === 'string' && k.deger.trim() ? [normalMetin(k.deger)] : [];
    }));
    for (const u of gecmis.mesajlar ?? []) {
      if (!u || !u.metin || (u.operasyon && u.operasyon !== m.ad)) continue;
      const tetikleyenler = (u.senaryoIdleri ?? []).map((id) => senaryolar.find((s) => s.id === id)).filter(Boolean);
      if (!u.operasyon && !tetikleyenler.length) continue;
      const n = normalMetin(u.metin);
      const test = beklenenler.some((b) => b && (n.includes(b) || b.includes(n)));
      olcu.mesajlar.push({ etiket: `${on}${kisalt(u.metin, 80)}`, kapsandi: test });
      if (test) { elenen.kapsanan++; continue; }
      const tetikleyen = /** @type {import('./servis-onerileri.d.mts').ServisOneriSenaryosu | undefined} */ (tetikleyenler[0]);
      const maskeli = maskeliMi(u.metin);
      const { kontroller: _k, aciklama: _a, kaynak: _ky, kosuOrtamlari: _ko, sozlesmeDogrula: _sd, veriKosulari: _vk, ...kalan } = tetikleyen ? tetikleyen.icerik : tabanIcerik;
      adayEkle({
        tur: 'uyari', neden: 'risk', kimlik: `uyari:${n.slice(0, 120)}`, ic: Math.min(99, 10 * (Number(u.sayi) || 1)), alanlar: [],
        baslik: `Hata beklenir: ${kisalt(u.metin, 50)}`,
        gerekce: `“${kisalt(u.metin)}” mesajını beklenen sonuç olarak taşıyan senaryo yok (son ${uyariGunu} günde ${u.sayi ?? 1} kez görüldü)`,
        ozet: tetikleyen ? `"${tetikleyen.baslik}" senaryosunun değerleriyle; bu mesaj beklenir.` : `Taban değerleriyle; bu mesaj beklenir.`,
        degisiklikler: [], icerik: kopya(kalan), eksikler: tetikleyen ? [] : tabanEksikleri,
        beklenen: { tur: 'hata', mesaj: String(u.metin).trim(), mesajEksik: false }, kontroller: hataKontrolleri(servisTuru, String(u.metin).trim(), u.hataTuru),
        engel: maskeli ? 'Mesajda maskelenmiş bir parça var; önizlemede beklenen mesajı düzeltin.'
          : !tetikleyen ? 'Mesajı üreten senaryo bu metotta yok; değerleri önizlemede mesajı üretecek şekilde girin.' : null
      });
    }
  }

  // ---- Puan, kararlar, tekilleştirme, sıralama -------------------------------------------------------------------------------
  const simdiMs = simdi.getTime();
  /** @type {any[]} */
  let tumu = [];
  const icerikler = new Map();
  for (const o of adaylar) {
    const puan = oneriPuani(o.neden, o.ic, o.agirliklar.carpan(o.tur, o.alanlar));
    const red = oneriRedDurumu(tumKararlar, o.kimlik, simdiMs);
    if (red && !g.reddedilenleriGoster) { elenen[red]++; continue; }
    const beklenenMetni = o.beklenen.tur === 'basari' ? 'Başarılı yanıt'
      : o.beklenen.mesajEksik ? `Hata beklenir (${servisTuru === 'rest' ? 'HTTP 4xx / 5xx' : 'SOAP Fault'}) — mesajı siz yazın` : `Hata beklenir: “${kisalt(o.beklenen.mesaj, 60)}”`;
    const oneri = {
      kimlik: o.kimlik, tur: o.tur, neden: o.neden, gerekce: o.gerekce, puan, baslik: kisalt(o.baslik, 200), ozet: o.ozet, operasyon: o.operasyon,
      degisiklikler: o.degisiklikler ?? [], beklenen: o.beklenen, beklenenMetni, icerik: o.icerik, eksikler: o.eksikler, engel: o.engel ?? null, alanlar: o.alanlar,
      ...(o.ikililer ? { ikililer: o.ikililer } : {}), ...(o.degerler ? { degerler: o.degerler } : {}),
      eklenebilir: !o.eksikler.length && !o.engel, reddedildi: Boolean(red), sira: o.sira
    };
    // Aynı istek + beklenen birden çok türden geldiyse yüksek puanlı kalır (denklik).
    const imza = JSON.stringify([oneri.icerik.govde ?? '', oneri.icerik.http ?? null, oneri.icerik.tabloSecimleri ?? null, oneri.icerik.kontroller]);
    const onceki = icerikler.get(imza);
    if (onceki) {
      elenen.denklik++;
      if (onceki.puan >= oneri.puan) continue;
      tumu = tumu.filter((x) => x !== onceki);
    }
    icerikler.set(imza, oneri);
    tumu.push(oneri);
  }
  tumu.sort((a, b) => b.puan - a.puan || a.sira - b.sira);
  const oneriler = tumu.slice(0, ustSinir).map(({ sira: _s, ...o }) => o);
  const olc = (/** @type {Array<{ etiket: string; kapsandi: boolean }>} */ l) => ({ kapsanan: l.filter((x) => x.kapsandi).length, toplam: l.length, eksikler: l.filter((x) => !x.kapsandi).slice(0, 50).map((x) => x.etiket) });
  const metotOlcusu = g.metotlar.map((m) => ({ etiket: m.ad, kapsandi: g.senaryolar.some((s) => s.icerik?.operasyon === m.ad) }));
  if (elenen.kapsanan) not('elenen', `${elenen.kapsanan} öneri mevcut senaryolarca zaten denendiği için gösterilmedi.`);
  return {
    oneriler, toplam: tumu.length, kalan: Math.max(0, tumu.length - oneriler.length), ustSinir, notlar, kombinasyon, tabanlar, elenen,
    kapsam: { metotlar: olc(metotOlcusu), alanlar: olc(olcu.alanlar), degerler: olc(olcu.degerler), ikililer: ikiliOlcusu, mesajlar: olc(olcu.mesajlar) }
  };
}

/**
 * Senaryosu olmayan metodun şemadan tabanı: SOAP'ta servis varsayılanı → bağlı tablo sütunu / hesaplama kuralı → şemadaki varsayılan /
 * örnek → listedeki ilk değer; REST'te ucun şablonu (bağlı alan ${Tablo.Sütun}, gizli alanın örneği yazılmaz). Hassas alana düz değer
 * yazılmaz (bağlıysa tablo başvurusu; koşuda seçilen satırdan gelir).
 * @param {'soap' | 'rest'} servisTuru @param {import('./servis-onerileri.d.mts').ServisOneriMetodu} m @param {'1.1' | '1.2'} [soapSurumu]
 */
export function semadanTaban(servisTuru, m, soapSurumu) {
  const alanByYol = new Map(m.alanlar.map((a) => [a.yol, a]));
  if (servisTuru === 'rest') {
    const uc = m.uc ?? { yol: '' };
    const ref = (/** @type {string} */ yol) => { const a = alanByYol.get(yol); return a?.bag ? basvuru(a.bag.tablo, a.bag.sutun, a.bag.etiket) : a?.kural ?? undefined; };
    const gizli = new Set(m.alanlar.filter((a) => a.gizli).map((a) => a.yol));
    const s = baslangicSablonu(uc, { ref, gizli });
    return { icerik: { operasyon: m.ad, govde: s.govde, http: { metot: uc.metot ?? 'GET', yol: s.yol, ...(uc.icerikTuru ? { icerikTuru: uc.icerikTuru } : {}) } } };
  }
  if (!m.sema) return { icerik: { operasyon: m.ad, govde: '' } };
  const d = baslangicDegerleri(m.sema, m.varsayilanlar ?? {});
  for (const sat of alanSatirlari(m.sema.alanlar)) {
    if (sat.grup || (m.varsayilanlar ?? {})[sat.yol]) continue;
    const a = alanByYol.get(sat.yol);
    if (!a) continue;
    if (a.bag) { d[sat.yol] = { kaynak: 'tablo', deger: basvuru(a.bag.tablo, a.bag.sutun, a.bag.etiket) }; continue; }
    if (a.kural) { d[sat.yol] = { kaynak: 'parametre', deger: a.kural }; continue; }
    if (!a.zorunlu || a.gizli) continue;
    const ornek = a.varsayilan ?? a.secenekler?.[0];
    if (ornek !== undefined) d[sat.yol] = { kaynak: 'sabit', deger: ornek };
  }
  return { icerik: { operasyon: m.ad, govde: govdeUret(m.sema, d, soapSurumu ? { soapSurumu } : {}) } };
}
