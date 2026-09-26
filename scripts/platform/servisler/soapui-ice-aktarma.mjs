// SERVİS TESTLERİ — SoapUI proje dosyasından (XML) servis ve senaryo taslakları çıkarır. Ağ isteği YOKTUR; dosya yalnızca okunur.
// - Arayüz (interface) → servis: yol (endpoint'in yolu; ana makine ortamdan gelir), SOAP sürümü, operasyonlar (SOAPAction ile).
// - İstek adımı → senaryo: başlık = adım adı, gövde = istek, kontroller = SoapUI doğrulamaları.
// - Gövdede parametreler SoapUI'deki adıyla kalır, yalnız yazımı sadeleşir: ${#TestCase#SIGORTALI_TC} → ${SIGORTALI_TC}.
//   Değerler gövdeye YAZILMAZ; nereden geldikleri parametre türüne göre ayrı döner:
//   · giriş bilgisi (USERNAME / PASSWORD / CHANNEL) → giriş bilgisi profili adayları (kullanıcı onayıyla kasaya),
//   · Groovy ile üretilen tarihler (şimdi, +1 yıl, +60 gün) → servis parametre kuralı ("tarih"),
//   · diğerleri (kişi verileri vb.) → test verisi türlerinde eşlenmesi gereken parametre adları (değerleri dönmez).
// - Gövdeye düz yazılmış giriş bilgisi öğeleri (<Username>…</Username>) durumda en çok geçen değerse ${USERNAME} olur;
//   farklı değer (adım bilerek başka kanal / kullanıcı deniyor) gövdede kalır ve not düşülür.
import { xmlKacisCoz } from './soap-istemcisi.mjs';

/** Giriş bilgisi sayılan özellik / öğe adları (küçük harf, yalnız harfler) → gövdedeki ortak parametre adı. */
export const KIMLIK_PARAMETRELERI = Object.freeze(/** @type {Record<string, string>} */ ({
  username: 'USERNAME', user: 'USERNAME', kullaniciadi: 'USERNAME', kullanici: 'USERNAME',
  password: 'PASSWORD', pass: 'PASSWORD', parola: 'PASSWORD', sifre: 'PASSWORD',
  channel: 'CHANNEL', kanal: 'CHANNEL'
}));

/** @param {string} s @param {string} a */
const oznitelik = (s, a) => xmlKacisCoz((s.match(new RegExp(`\\b${a}="([^"]*)"`)) ?? [])[1] ?? '');
/** @param {string} s @param {string} etiket */
const icMetin = (s, etiket) => {
  const m = s.match(new RegExp(`<con:${etiket}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</con:${etiket}>`));
  return m ? (m[1] ?? xmlKacisCoz(m[2] ?? '')) : '';
};
/**
 * İstek gövdesi. Bazı SoapUI dosyalarında satır sonlarında DÜZ METİN "\r" (ters bölü + r) kalıntısı bulunur; zarfın içinde
 * metin olarak kaldığında sunucu gövdeyi okuyamaz ("Missing required soap:Body element"). Satır sonundaki kalıntı atılır.
 * @param {string} s
 */
const istekGovdesi = (s) => icMetin(s, 'request').replace(/\\r(?=\r?\n|$)/g, '');

/**
 * @typedef {{ ad: string; eylem?: string }} Operasyon
 * @typedef {{ ad: string; soapSurumu: '1.1' | '1.2'; wsdl: string; operasyonlar: Operasyon[] }} Arayuz
 * @typedef {{ tur: 'deger'; deger: string } | { tur: 'tarih'; ifade: string }} OzellikCozumu
 * @typedef {import('./servis-deposu.mjs').ServisKontrolu} ServisKontrolu
 * @typedef {{ ad: string; etkin: boolean; arayuz: string; operasyon: string; eylem?: string; adres: string; yol: string; govde: string;
 *   kontroller: ServisKontrolu[]; uyarilar: string[] }} IstekAdimi
 * @typedef {{ takim: string; ad: string; adimlar: IstekAdimi[]; kimlik: Record<string, string>; tarihKurallari: Record<string, string>;
 *   veriParametreleri: string[]; uyarilar: string[] }} TestDurumu
 */

/**
 * Groovy betiğindeki basit atamaları çözer: setPropertyValue("AD", degisken) ile verilen özellikler.
 * Anlaşılan ifadeler: "metin", now.format(f), now.plusYears(n)/plusMonths(n)/plusDays(n)/minus…(n).format(f),
 * new Date().format('kalıp'), now.getYear().toString().
 * @param {string} betik @returns {{ ozellikler: Record<string, OzellikCozumu>; anlasilmayanlar: string[] }}
 */
export function groovyOzellikleri(betik) {
  const kod = xmlKacisCoz(betik).replace(/\r/g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  /** @type {Record<string, string>} */
  const kaliplar = {};
  // Kalıp tırnak içerebilir ("yyyy-MM-dd'T'HH:mm:ss"): dış tırnak türüne göre eşlenir.
  for (const m of kod.matchAll(/def\s+(\w+)\s*=\s*DateTimeFormatter\.ofPattern\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g)) kaliplar[m[1]] = m[2] ?? m[3];
  /** @type {Set<string>} */
  const simdiler = new Set();
  for (const m of kod.matchAll(/def\s+(\w+)\s*=\s*Local(?:Date)?(?:Time)?\.now\(\)\s*$/gm)) simdiler.add(m[1]);
  /** @type {Record<string, OzellikCozumu | null>} */
  const degiskenler = {};
  for (const m of kod.matchAll(/def\s+(\w+)\s*=\s*(.+)$/gm)) {
    const [ad, ifade] = [m[1], m[2].trim()];
    const metin = /^["']([^"']*)["']$/.exec(ifade);
    if (metin) { degiskenler[ad] = { tur: 'deger', deger: metin[1] }; continue; }
    const tarih = /^(\w+)((?:\.(?:plus|minus)(?:Years|Months|Days)\(\s*\d+\s*\))*)\.format\(\s*(\w+|"[^"]+"|'[^']+')\s*\)$/.exec(ifade);
    if (tarih && simdiler.has(tarih[1])) {
      const kalip = /^["']/.test(tarih[3]) ? tarih[3].slice(1, -1) : kaliplar[tarih[3]];
      const kaydirmalar = [...tarih[2].matchAll(/(plus|minus)(Years|Months|Days)\(\s*(\d+)\s*\)/g)];
      if (kalip && kaydirmalar.length <= 1) {
        const k = kaydirmalar[0];
        const ek = k ? `${k[1] === 'plus' ? '+' : '-'}${k[3]}${{ Years: 'y', Months: 'a', Days: 'g' }[/** @type {'Years' | 'Months' | 'Days'} */ (k[2])]}` : '';
        degiskenler[ad] = { tur: 'tarih', ifade: `bugun${ek}|${kalip}` };
        continue;
      }
    }
    const tarihJava = /^new\s+Date\(\)\.format\(\s*["']([^"']+)["']\s*\)$/.exec(ifade);
    if (tarihJava) { degiskenler[ad] = { tur: 'tarih', ifade: `bugun|${tarihJava[1]}` }; continue; }
    const yil = /^(\w+)\.getYear\(\)\.toString\(\)$/.exec(ifade);
    if (yil && simdiler.has(yil[1])) { degiskenler[ad] = { tur: 'tarih', ifade: 'bugun|yyyy' }; continue; }
    if (!simdiler.has(ad) && !(ad in kaliplar)) degiskenler[ad] = null;
  }
  /** @type {Record<string, OzellikCozumu>} */
  const ozellikler = {};
  /** @type {string[]} */
  const anlasilmayanlar = [];
  for (const m of kod.matchAll(/setPropertyValue\(\s*["']([^"']+)["']\s*,\s*(\w+|["'][^"']*["'])\s*\)/g)) {
    const c = /^["']/.test(m[2]) ? { tur: /** @type {const} */ ('deger'), deger: m[2].slice(1, -1) } : degiskenler[m[2]];
    if (c) ozellikler[m[1]] = c;
    else anlasilmayanlar.push(m[1]);
  }
  return { ozellikler, anlasilmayanlar };
}

/**
 * SoapUI doğrulaması → kontrol (desteklenmeyen tür null + uyarı).
 * @param {string} tur @param {string} ayar @returns {ServisKontrolu | null}
 */
function kontrolCevir(tur, ayar) {
  const token = xmlKacisCoz(icMetinDuz(ayar, 'token'));
  const ek = { ...(/<ignoreCase>true</.test(ayar) ? { buyukKucukDuyarsiz: true } : {}), ...(/<useRegEx>true</.test(ayar) ? { duzenliIfade: true } : {}) };
  switch (tur) {
    case 'SOAP Response': return { tur: 'soapYaniti' };
    case 'Not SOAP Fault': return { tur: 'soapHatasiYok' };
    case 'SOAP Fault': return { tur: 'soapHatasi' };
    case 'Simple Contains': return token ? { tur: 'icerir', deger: token, ...ek } : null;
    case 'Simple NotContains': return token ? { tur: 'icermez', deger: token, ...ek } : null;
    case 'Valid HTTP Status Codes': {
      const kodlar = xmlKacisCoz(icMetinDuz(ayar, 'codes')).trim();
      return kodlar ? { tur: 'durumKodu', deger: kodlar } : null;
    }
    default: return null;
  }
}

/** Groovy adımının betiği (<script> ya da <con:script>; CDATA olabilir; kaçışlar groovyOzellikleri'nde çözülür). @param {string} s */
const betikMetni = (s) => {
  const m = s.match(/<(?:con:)?script>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:con:)?script>/);
  return m ? (m[1] ?? m[2] ?? '') : '';
};

/** @param {string} s @param {string} etiket */
const icMetinDuz = (s, etiket) => (s.match(new RegExp(`<${etiket}>([\\s\\S]*?)</${etiket}>`)) ?? [])[1] ?? '';

/** Özellik / öğe adı giriş bilgisiyse ortak parametre adı (USERNAME / PASSWORD / CHANNEL). @param {string} ad */
const kimlikParametresi = (ad) => KIMLIK_PARAMETRELERI[ad.toLowerCase().replace(/[^a-z]/g, '')];

/** SoapUI özellik başvurusu: ${#TestCase#AD}, ${#Project#AD}, ${AD}. */
const SOAPUI_OZELLIGI = /\$\{(?:#(?:TestCase|TestSuite|Project|Global)#)?([A-Za-z_][\w.-]*)\}/g;

/**
 * Gövdedeki SoapUI özellik başvurularını sade yazıma çevirir (${AD}); giriş bilgisi özellikleri ortak ada (${USERNAME}).
 * @param {string} govde @param {Set<string>} kullanilan (doldurulur: gövdede geçen özgün özellik adları)
 */
function ozellikleriSadelestir(govde, kullanilan) {
  return govde.replace(SOAPUI_OZELLIGI, (_m, ad) => {
    kullanilan.add(ad);
    return `\${${kimlikParametresi(ad) ?? ad}}`;
  });
}

const DUZ_OGE = /<((?:\w+:)?(\w+))(\s[^>]*)?>([^<]*)<\/\1>/g;

/** Gövdede düz yazılmış giriş bilgisi öğelerinin değerleri (parametre adına göre). @param {string} govde @returns {Record<string, string>} */
function duzKimlikDegerleri(govde) {
  /** @type {Record<string, string>} */
  const d = {};
  for (const m of govde.matchAll(DUZ_OGE)) {
    const p = kimlikParametresi(m[2]);
    if (p && m[4].trim() && !m[4].includes('${') && d[p] === undefined) d[p] = xmlKacisCoz(m[4].trim());
  }
  return d;
}

/**
 * Düz yazılmış giriş bilgisi öğelerinden değeri profildekiyle AYNI olanları ${PARAMETRE} yapar; farklı olan gövdede kalır.
 * @param {string} govde @param {Record<string, string>} kimlik @param {string[]} uyarilar (doldurulur)
 */
function kimlikleriParametreYap(govde, kimlik, uyarilar) {
  /** @type {Set<string>} */
  const farkli = new Set();
  const g = govde.replace(DUZ_OGE, (m, etiket, yerel, oz, deger) => {
    const p = kimlikParametresi(yerel);
    if (!p || !deger.trim() || deger.includes('${')) return m;
    if (kimlik[p] !== xmlKacisCoz(deger.trim())) { farkli.add(p); return m; }
    return `<${etiket}${oz ?? ''}>\${${p}}</${etiket}>`;
  });
  if (farkli.size) uyarilar.push(`Bu adım kendi ${[...farkli].join(' / ')} değerini gönderiyor (gövdede kaldı; giriş profili kullanılmaz).`);
  return g;
}

/**
 * @param {string} xml SoapUI proje dosyası içeriği
 * @returns {{ proje: string; arayuzler: Arayuz[]; durumlar: TestDurumu[] }}
 */
export function soapuiCozumle(xml) {
  if (!/<con:soapui-project\b/.test(xml)) throw new Error('Bu bir SoapUI proje dosyası değil (<con:soapui-project> bulunamadı).');
  const temiz = xml.replace(/<con:definitionCache[\s\S]*?<\/con:definitionCache>/g, '');
  const proje = oznitelik((temiz.match(/<con:soapui-project\b([^>]*)>/) ?? ['', ''])[1], 'name');
  /** @type {Arayuz[]} */
  const arayuzler = [];
  for (const m of temiz.matchAll(/<con:interface\b([^>]*)>([\s\S]*?)<\/con:interface>/g)) {
    const ad = oznitelik(m[1], 'name');
    if (!ad) continue;
    const operasyonlar = [...m[2].matchAll(/<con:operation\b([^>]*)>/g)].map((o) => {
      const eylem = oznitelik(o[1], 'action');
      return eylem ? { ad: oznitelik(o[1], 'name'), eylem } : { ad: oznitelik(o[1], 'name') };
    });
    arayuzler.push({ ad, soapSurumu: oznitelik(m[1], 'soapVersion') === '1_2' ? '1.2' : '1.1', wsdl: oznitelik(m[1], 'definition'), operasyonlar });
  }
  /** @type {TestDurumu[]} */
  const durumlar = [];
  for (const t of temiz.matchAll(/<con:testSuite\b([^>]*)>([\s\S]*?)<\/con:testSuite>/g)) {
    const takim = oznitelik(t[1], 'name');
    for (const c of t[2].matchAll(/<con:testCase\b([^>]*)>([\s\S]*?)<\/con:testCase>/g)) {
      /** @type {string[]} */
      const uyarilar = [];
      /** @type {Record<string, OzellikCozumu>} */
      const ozellikler = {};
      // Test durumu özellikleri (son kaydedilen değerler) — Groovy ile üretilenler aşağıda ezilir.
      const ozellikBolumu = c[2].replace(/<con:testStep\b[\s\S]*?<\/con:testStep>/g, '');
      for (const p of ozellikBolumu.matchAll(/<con:property><con:name>([^<]*)<\/con:name><con:value>([^<]*)<\/con:value><\/con:property>/g)) {
        ozellikler[p[1]] = { tur: 'deger', deger: xmlKacisCoz(p[2]) };
      }
      const adimlar = [...c[2].matchAll(/<con:testStep\b([^>]*)>([\s\S]*?)<\/con:testStep>/g)];
      for (const a of adimlar) {
        const tur = oznitelik(a[1], 'type');
        if (tur === 'groovy') {
          const g = groovyOzellikleri(betikMetni(a[2]));
          Object.assign(ozellikler, g.ozellikler);
          if (g.anlasilmayanlar.length) uyarilar.push(`Groovy adımı "${oznitelik(a[1], 'name')}": anlaşılamayan özellik(ler) ${g.anlasilmayanlar.join(', ')}.`);
          if (/runTestStepByName|testRunner\.(?:gotoStep|fail)/.test(betikMetni(a[2]))) uyarilar.push(`Groovy adımı "${oznitelik(a[1], 'name')}" başka adım çalıştırıyor / akışı değiştiriyor — bu kısmı aktarılmadı.`);
        } else if (tur !== 'request') {
          uyarilar.push(`"${oznitelik(a[1], 'name')}" (${tur}) adımı desteklenmiyor — aktarılmadı.`);
        }
      }
      /** @type {Record<string, string>} */
      const kimlik = {};
      for (const [ad, oc] of Object.entries(ozellikler)) {
        const p = kimlikParametresi(ad);
        if (p && oc.tur === 'deger' && oc.deger) kimlik[p] = oc.deger;
      }
      /** @type {Set<string>} */
      const kullanilan = new Set();
      const istekAdimlari = adimlar.filter((a) => oznitelik(a[1], 'type') === 'request')
        .map((a) => ({ a, adimUyarilari: /** @type {string[]} */ ([]), govde: ozellikleriSadelestir(istekGovdesi(a[2]), kullanilan) }));
      // Düz yazılmış giriş bilgileri: her parametre için adımlarda EN ÇOK geçen değer profil değeri olur.
      /** @type {Record<string, Map<string, number>>} */
      const sayac = {};
      for (const x of istekAdimlari) {
        for (const [p, d] of Object.entries(duzKimlikDegerleri(x.govde))) {
          sayac[p] ??= new Map();
          sayac[p].set(d, (sayac[p].get(d) ?? 0) + 1);
        }
      }
      for (const [p, m] of Object.entries(sayac)) if (kimlik[p] === undefined) kimlik[p] = [...m].sort((x, y) => y[1] - x[1])[0][0];
      /** @type {IstekAdimi[]} */
      const istekler = [];
      for (const { a, adimUyarilari, govde: sade } of istekAdimlari) {
        const ic = a[2];
        const adres = icMetin(ic, 'endpoint');
        let yol = '';
        try { yol = new URL(adres).pathname; } catch { adimUyarilari.push('Adımın adresi okunamadı.'); }
        const arayuz = icMetin(ic, 'interface');
        const operasyon = icMetin(ic, 'operation');
        const eylem = arayuzler.find((x) => x.ad === arayuz)?.operasyonlar.find((o) => o.ad === operasyon)?.eylem;
        const govde = kimlikleriParametreYap(sade, kimlik, adimUyarilari);
        /** @type {ServisKontrolu[]} */
        const kontroller = [];
        // Kendiliğinden kapanan doğrulama önce denenir (yoksa sonraki doğrulamanın gövdesini yutar).
        for (const k of ic.matchAll(/<con:assertion\b([^>]*?)\/>|<con:assertion\b([^>]*)>([\s\S]*?)<\/con:assertion>/g)) {
          const oz = k[1] ?? k[2];
          const ktur = oznitelik(oz, 'type');
          if (oznitelik(oz, 'disabled') === 'true') continue;
          const cevrilen = kontrolCevir(ktur, k[3] ?? '');
          if (cevrilen) kontroller.push(cevrilen);
          else adimUyarilari.push(`"${ktur}" doğrulaması desteklenmiyor — aktarılmadı.`);
        }
        istekler.push({ ad: oznitelik(a[1], 'name'), etkin: oznitelik(a[1], 'disabled') !== 'true', arayuz, operasyon, ...(eylem ? { eylem } : {}), adres, yol, govde, kontroller, uyarilar: adimUyarilari });
      }
      /** @type {Record<string, string>} */
      const tarihKurallari = {};
      /** @type {string[]} */
      const veriParametreleri = [];
      for (const ad of [...kullanilan].sort()) {
        if (kimlikParametresi(ad)) continue;
        const oc = ozellikler[ad];
        if (oc?.tur === 'tarih') tarihKurallari[ad] = oc.ifade;
        else veriParametreleri.push(ad);
        if (!oc) uyarilar.push(`"${ad}" özelliği dosyada tanımlı değil; test verisinde eşlenmeli.`);
      }
      durumlar.push({ takim, ad: oznitelik(c[1], 'name'), adimlar: istekler, kimlik, tarihKurallari, veriParametreleri, uyarilar });
    }
  }
  return { proje, arayuzler, durumlar };
}

/** "TravelServiceSoap" → "travel-service". @param {string} ad */
export function servisAnahtariUret(ad) {
  return ad.replace(/(?:Soap12|Soap|PortBinding|Binding)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'servis';
}

/**
 * Bir test durumundan servis taslakları (adımlar arayüze göre gruplanır). Hiçbir şey yazılmaz; çağıran (sunucu)
 * kullanıcı onayıyla kaydeder. kimlikAdaylari DEĞER içerir — arayüze gönderilmez.
 * @param {{ arayuzler: Arayuz[]; durumlar: TestDurumu[] }} cozum @param {{ takim: string; durum: string }} secim
 */
export function servisTaslaklari(cozum, secim) {
  const durum = cozum.durumlar.find((d) => d.takim === secim.takim && d.ad === secim.durum);
  if (!durum) throw new Error(`Test durumu bulunamadı: ${secim.takim} / ${secim.durum}`);
  /** @type {Map<string, { anahtar: string; ad: string; yol: string; soapSurumu: '1.1' | '1.2'; operasyonlar: Operasyon[]; adresler: string[];
   *   senaryolar: { baslik: string; operasyon: string; govde: string; kontroller: ServisKontrolu[]; kosuyaDahil: boolean; uyarilar: string[]; kaynak: Record<string, string> }[] }>} */
  const servisler = new Map();
  for (const a of durum.adimlar) {
    const ar = cozum.arayuzler.find((x) => x.ad === a.arayuz);
    let s = servisler.get(a.arayuz);
    if (!s) {
      s = { anahtar: servisAnahtariUret(a.arayuz), ad: a.arayuz.replace(/Soap$/, ''), yol: a.yol, soapSurumu: ar?.soapSurumu ?? '1.1',
        operasyonlar: ar?.operasyonlar ?? [], adresler: [], senaryolar: [] };
      servisler.set(a.arayuz, s);
    }
    if (!s.yol && a.yol) s.yol = a.yol;
    try { const h = new URL(a.adres).origin; if (!s.adresler.includes(h)) s.adresler.push(h); } catch { /* yok */ }
    s.senaryolar.push({ baslik: a.ad, operasyon: a.operasyon, govde: a.govde, kontroller: a.kontroller, kosuyaDahil: a.etkin,
      uyarilar: [...a.uyarilar, ...(a.yol && s.yol && a.yol.toLowerCase() !== s.yol.toLowerCase() ? [`Bu adım farklı bir yola gidiyor (${a.yol}).`] : [])],
      kaynak: { arac: 'SoapUI', takim: durum.takim, durum: durum.ad, adim: a.ad } });
  }
  return {
    durum: { takim: durum.takim, ad: durum.ad, uyarilar: durum.uyarilar },
    kimlikParametreleri: Object.keys(durum.kimlik).sort(), kimlikAdaylari: durum.kimlik,
    tarihKurallari: durum.tarihKurallari, veriParametreleri: durum.veriParametreleri,
    servisler: [...servisler.values()]
  };
}

/**
 * Dosyanın özeti (arayüzde test durumu seçimi için): takım / durum / istek sayısı / kullanılan arayüzler. Değer içermez.
 * @param {{ arayuzler: Arayuz[]; durumlar: TestDurumu[] }} cozum
 */
export function soapuiOzeti(cozum) {
  return cozum.durumlar.map((d) => ({
    takim: d.takim, durum: d.ad, istekSayisi: d.adimlar.length, arayuzler: [...new Set(d.adimlar.map((a) => a.arayuz))],
    kimlikParametreleri: Object.keys(d.kimlik).sort(), veriParametreleri: d.veriParametreleri,
    uyariSayisi: d.uyarilar.length + d.adimlar.reduce((n, a) => n + a.uyarilar.length, 0)
  }));
}
