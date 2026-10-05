// BÜYÜK PROJE FİKSTÜRÜ (spec DEĞİL) — gerçek bir kurulum büyüklüğünde SAHTE veri üretir: 9 ekran (2'si genel senaryo), 23 servis,
// ~37 ekran senaryosu, 43 tablo (birinde ~2264 satır), koşu sonuçları ve servis koşuları. Uç hızı ölçümü ve performans koruma
// testi (uc-hizi.spec.ts) bunu kullanır. Değerlerin hepsi SAHTEDİR; hiçbir dış adrese istek atılmaz (ortam adresleri 127.0.0.1).
// Üretim kasası açık bir veritabanında, kayıt servisleriyle (doğrulamalar çalışır) yapılır. Bellekteki (yolsuz) veritabanı her
// yazmada dosyaya yazmadığı için hızlıdır; dosyaya bir kez dışa aktarılır (buyukProjeDosyasiOlustur).
import { writeFileSync } from 'node:fs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglariniKaydet } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { izinDegistir } from '../../scripts/platform/guvenlik/izinler.mjs';
import { IZIN_ANAHTARLARI } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';

/** Tekrarlanabilir sözde rastgele (aynı tohum → aynı veri). @param {number} tohum */
function rastgele(tohum) {
  let s = tohum >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADLAR = ['Ali', 'Ayşe', 'Mehmet', 'Fatma', 'Can', 'Elif', 'Deniz', 'Ece', 'Murat', 'Zeynep', 'Kerem', 'Selin', 'Emre', 'Burcu', 'Okan'];
const SOYADLAR = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Koç', 'Kurt'];
const SEHIRLER = Array.from({ length: 81 }, (_, i) => `Şehir ${String(i + 1).padStart(2, '0')}`);

/**
 * Büyük proje verisini açık kasalı veritabanına yazar.
 * @param {import('../../scripts/platform/veritabani/baglanti.mjs').Veritabani} vt
 * @param {{ tohum?: number; olcek?: number }} [secenekler] olcek: satır / senaryo / koşu sayılarının çarpanı (testte küçültülebilir)
 */
export async function buyukProjeUret(vt, secenekler = {}) {
  const r = rastgele(secenekler.tohum ?? 7);
  const olcek = secenekler.olcek ?? 1;
  const sec = (/** @type {any[]} */ l) => l[Math.floor(r() * l.length)];
  const sayi = (/** @type {number} */ n) => Math.max(1, Math.round(n * olcek));
  for (const a of IZIN_ANAHTARLARI) izinDegistir(vt, a, true, { onay: true });

  const projeId = projeKaydet(vt, { ad: 'Büyük Proje' });
  const testId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true });
  const canliId = ortamKaydet(vt, { projeId, ad: 'ÖN CANLI', tabanUrl: 'http://127.0.0.1:9' });
  const ortamlar = [testId, canliId];

  // ---------------------------------------------------------------------------------------------------------------------------
  // Tablolar: 1 büyük kişi tablosu (~2264 satır), 11 kayıt tablosu, 31 ekran listesi = 43
  // ---------------------------------------------------------------------------------------------------------------------------
  /** @type {Map<string, { id: string; ad: string; sutunlar: string[]; degerler: string[][] }>} */
  const tablolar = new Map();
  const tabloEkle = (/** @type {string} */ ad, /** @type {Array<{ ad: string; gizli?: boolean }>} */ sutunlar, /** @type {Array<{ ad?: string; ortamId?: string | null; degerler: Record<string, string> }>} */ satirlar, /** @type {'kayit' | 'liste'} */ tur) => {
    const id = tabloKaydet(vt, { projeId, ad, sutunlar, satirlar, tur, ortamVar: () => true });
    tablolar.set(ad, { id, ad, sutunlar: sutunlar.map((s) => s.ad), degerler: satirlar.map((s) => sutunlar.map((x) => s.degerler[x.ad] ?? '')) });
    return id;
  };
  const kisiSutunlari = [{ ad: 'Ad' }, { ad: 'Soyad' }, { ad: 'Kimlik no' }, { ad: 'Telefon' }, { ad: 'E-posta' }, { ad: 'Şehir' }, { ad: 'İlçe' },
    { ad: 'Doğum tarihi' }, { ad: 'Segment' }, { ad: 'Müşteri no' }, { ad: 'Parola', gizli: true }, { ad: 'Not' }];
  tabloEkle('Müşteriler', kisiSutunlari, Array.from({ length: sayi(2264) }, (_, i) => ({
    ad: `Müşteri ${i + 1}`, ortamId: i % 3 === 0 ? canliId : i % 3 === 1 ? testId : null,
    degerler: {
      Ad: sec(ADLAR), Soyad: sec(SOYADLAR), 'Kimlik no': String(10000000000 + i * 7919).slice(0, 11), Telefon: `555${String(1000000 + i).slice(-7)}`,
      'E-posta': `kisi${i}@ornek.test`, Şehir: sec(SEHIRLER), İlçe: `İlçe ${1 + Math.floor(r() * 30)}`, 'Doğum tarihi': `${String(1 + (i % 28)).padStart(2, '0')}.0${1 + (i % 9)}.19${60 + (i % 40)}`,
      Segment: sec(['Bireysel', 'Kurumsal', 'KOBİ']), 'Müşteri no': `M${100000 + i}`, Parola: `Sahte-${i}`, Not: i % 5 ? '' : 'Sahte not'
    }
  })), 'kayit');
  for (let t = 1; t <= 11; t++) {
    const sutunlar = Array.from({ length: 6 + (t % 5) }, (_, i) => ({ ad: `Alan ${i + 1}`, ...(i === 5 ? { gizli: true } : {}) }));
    tabloEkle(`Kayıt tablosu ${t}`, sutunlar, Array.from({ length: sayi(20 + t * 9) }, (_, i) => ({
      ad: `Kayıt ${i + 1}`, ortamId: i % 2 ? testId : null, degerler: Object.fromEntries(sutunlar.map((s, j) => [s.ad, `Değer ${t}-${i}-${j}`]))
    })), 'kayit');
  }
  tabloEkle('Şehirler', [{ ad: 'Şehir' }], SEHIRLER.map((s) => ({ degerler: { Şehir: s } })), 'liste');
  for (let t = 1; t <= 30; t++) {
    const sutunlar = Array.from({ length: 1 + (t % 3) }, (_, i) => ({ ad: i ? `Kolon ${i}` : `Liste ${t}` }));
    tabloEkle(`Liste ${t}`, sutunlar, Array.from({ length: 4 + ((t * 7) % 37) }, (_, i) => ({
      degerler: Object.fromEntries(sutunlar.map((s, j) => [s.ad, `Seçenek ${t}.${i}${j ? `.${j}` : ''}`]))
    })), 'liste');
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // Ekranlar: 2 genel senaryo + 7 ekran (2'si iki akışlı); ~100 alan / ekran
  // ---------------------------------------------------------------------------------------------------------------------------
  const listeTablolari = [...tablolar.values()].filter((t) => t.ad.startsWith('Liste '));
  /** @type {Map<string, { id: string; alanlar: any[]; baglar: Record<string, { tablo: string; sutun: string }>; ortak?: string }>} */
  const ekranlar = new Map();
  const paket = (/** @type {any} */ model, /** @type {any} */ ekran) => ({
    tur: 'sayfa-paketi', surum: 1, meta: { ekran, olusturan: 'fikstür', olusturulma: '2026-10-01T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  });
  /** Bir adımın alanları (önek: alan kimliklerinin ekran içinde benzersizliği). @param {string} onEk @param {number} adet */
  const alanlarUret = (onEk, adet) => Array.from({ length: adet }, (_, i) => {
    const id = `${onEk}${i}`;
    const tur = i % 4 === 0 ? 'secim' : i % 7 === 0 ? 'tarih' : i % 9 === 0 ? 'sayi' : i % 11 === 0 ? 'onayKutusu' : 'metin';
    const temel = { id, tip: tur, etiket: { ekran: `Alan ${onEk} ${i}` }, zorunlu: i % 3 === 0, yapilandirma: 'senaryo', eslesme: { senaryo: id },
      konum: { secici: `#${id}`, kirilganlik: 'dusuk' } };
    if (tur === 'secim') {
      const n = 3 + ((i * 5) % 30);
      return { ...temel, secenekler: Array.from({ length: n }, (_, j) => ({ deger: `d${j}`, metin: `Seçenek ${j}` })), seceneklerDurumu: 'tam',
        ...(i % 8 === 4 ? { gorunurluk: { kosul: 'ekGorunur' } } : {}) };
    }
    if (tur === 'tarih') return { ...temel, bicim: 'gg.aa.yyyy' };
    return temel;
  });
  const adimUret = (/** @type {string} */ onEk, /** @type {number} */ sira, /** @type {number} */ alanSayisi) => ({
    id: `adim${onEk}`, sira, baslik: `Adım ${onEk}`,
    bolumler: [0, 1, 2].map((b) => ({ id: `b${onEk}x${b}`, baslik: `Bölüm ${b + 1}`, alanlar: alanlarUret(`${onEk}x${b}x`, Math.ceil(alanSayisi / 3)) })),
    kosu: { aksiyonlar: [{ tur: 'tikla', secici: `#devam${onEk}`, aciklama: 'Devam' }], basariGostergesi: { tur: 'metin', deger: 'Tamam', secici: '#sonuc' } }
  });
  const ortakAnahtarlari = ['ortak-giris', 'ortak-odeme'];
  for (const [k, anahtar] of ortakAnahtarlari.entries()) {
    const model = {
      semaSurumu: 2, tur: 'ortakAkis', id: anahtar, ad: `Genel ${k + 1}`, aciklama: 'Genel senaryo (sahte).', kosullar: {},
      adimlar: [adimUret(`G${k}a`, 1, 12), adimUret(`G${k}b`, 2, 9)],
      senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    };
    const sonuc = await sayfaEkle(vt, projeId, paket(model, { anahtar, ad: `Genel ${k + 1}` }), { medyaKlasoru: '' });
    ekranlar.set(anahtar, { id: sonuc.ekranId, alanlar: model.adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar)), baglar: {} });
  }
  for (let e = 1; e <= 7; e++) {
    const anahtar = `ekran-${e}`;
    const adimlar = [1, 2, 3, 4, 5].map((n) => adimUret(`E${e}s${n}`, n, 21));
    const ortak = { id: `ortakAdim${e}`, sira: 6, baslik: 'Genel adım', ortakAkis: { dosya: `${ortakAnahtarlari[e % 2]}.model.json` } };
    const tumAdimlar = [...adimlar, ortak];
    const model = {
      semaSurumu: 2, tur: 'ekran', id: anahtar, ad: `Ekran ${e}`, aciklama: 'Sahte ekran.', ekranUrl: `/${anahtar}/`, girisGerekmez: true,
      specDosyasi: `tests/scenarios/${anahtar}/${anahtar}.spec.ts`, pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: `Nöbetçi > Senaryolar (${anahtar})` },
      kosullar: { ekGorunur: { aciklama: 'ek alanlar', ifade: { alan: `E${e}s1x0x0`, esit: 'd1' } } },
      adimlar: tumAdimlar,
      ...(e <= 2 ? { akislar: [{ id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: tumAdimlar }, { id: 'kisa', ad: 'Kısa akış', adimlar: [adimlar[0], adimlar[1], { ...ortak, sira: 3 }] }] } : {}),
      senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
      urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    };
    const sonuc = await sayfaEkle(vt, projeId, paket(model, { anahtar, ad: `Ekran ${e}`, urlYolu: `/${anahtar}/` }), { medyaKlasoru: '' });
    ekranlar.set(anahtar, { id: sonuc.ekranId, alanlar: adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar)), baglar: {}, ortak: ortakAnahtarlari[e % 2] });
  }
  // Bağlar: seçimlerin yarısı liste tablolarına, bazı metin alanları kişi tablosuna.
  const kisi = /** @type {{ id: string }} */ (tablolar.get('Müşteriler'));
  for (const [, ek] of ekranlar) {
    /** @type {Record<string, { tablo: string; sutun: string }>} */
    const baglar = {};
    let m = 0;
    for (const a of ek.alanlar) {
      if (a.tip === 'secim' && r() < 0.5) { const t = sec(listeTablolari); baglar[a.id] = { tablo: t.id, sutun: t.sutunlar[0] }; }
      else if (a.tip === 'metin' && m < 6 && r() < 0.2) { baglar[a.id] = { tablo: kisi.id, sutun: kisiSutunlari[m++ % 10].ad }; }
    }
    ekranAlanBaglariniKaydet(vt, projeId, ek.id, baglar);
    ek.baglar = baglar;
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // Ekran senaryoları (~37) + koşu sonuçları
  // ---------------------------------------------------------------------------------------------------------------------------
  /** @type {string[]} */
  const senaryoIdleri = [];
  const ekranListesi = [...ekranlar.entries()].filter(([a]) => a.startsWith('ekran-'));
  const senaryoSayisi = sayi(37);
  for (let i = 0; i < senaryoSayisi; i++) {
    const [anahtar, ek] = ekranListesi[i % ekranListesi.length];
    /** @type {Record<string, unknown>} */
    const veri = {};
    const ortak = /** @type {{ alanlar: any[]; baglar: Record<string, { tablo: string; sutun: string }> }} */ (ekranlar.get(String(ek.ortak)));
    for (const a of [...ek.alanlar, ...ortak.alanlar]) {
      const bag = ek.baglar[a.id] ?? ortak.baglar[a.id];
      if (bag && bag.tablo === kisi.id) { veri[a.id] = `\${Müşteriler.${bag.sutun}}`; continue; }
      if (a.gorunurluk) continue;
      if (a.tip === 'secim') { if (!bag) veri[a.id] = sec(a.secenekler).deger; else { const t = /** @type {any} */ ([...tablolar.values()].find((x) => x.id === bag.tablo)); veri[a.id] = sec(t.degerler)[0]; } }
      else if (a.tip === 'tarih') veri[a.id] = '01.02.2030';
      else if (a.tip === 'sayi') veri[a.id] = String(1 + Math.floor(r() * 100));
      else if (a.tip === 'onayKutusu') veri[a.id] = r() < 0.5;
      else if (a.zorunlu || r() < 0.7) veri[a.id] = `Sahte değer ${i}-${a.id}`;
    }
    const sonuc = senaryoKaydet(vt, {
      projeId, ekranId: ek.id, baslik: `Senaryo ${String(i + 1).padStart(2, '0')} ${anahtar}`, veri, ortamIdleri: i % 4 ? ortamlar : [testId],
      ...(anahtar === 'ekran-1' && i % 2 ? { akisId: 'kisa' } : {})
    });
    senaryoIdleri.push(String(/** @type {any} */ (sonuc).id ?? /** @type {any} */ (sonuc).senaryo?.id));
  }
  const kosuSayisi = sayi(40);
  for (let k = 0; k < kosuSayisi; k++) {
    const kosuId = `buyuk-kosu-${k}`;
    const ortamId = k % 3 ? testId : canliId;
    kosuKaydet(vt, { id: kosuId, projeId, ortamId, tur: 'tam', baslangic: `2026-09-${String(1 + (k % 28)).padStart(2, '0')}T08:00:00.000Z` });
    for (const [j, id] of senaryoIdleri.entries()) {
      if ((j + k) % 3 === 0) continue;
      sonucKaydet(vt, {
        kosuId, projeId, senaryoId: id, senaryoBaslik: `Senaryo ${j + 1}`, durum: r() < 0.8 ? 'basarili' : 'basarisiz', sureMs: 4000 + Math.floor(r() * 9000),
        bitis: `2026-09-${String(1 + (k % 28)).padStart(2, '0')}T08:${String(j % 60).padStart(2, '0')}:00.000Z`,
        adimlar: [1, 2, 3, 4, 5].map((n) => ({ ad: `Adım ${n}`, durum: 'basarili', sureMs: 800 }))
      });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // Servisler (23): operasyonlar, şemalar, örnek istekler, alan bağları; ~8 senaryo / servis; koşu geçmişi
  // ---------------------------------------------------------------------------------------------------------------------------
  const servisSayisi = 23;
  for (let s = 1; s <= servisSayisi; s++) {
    const opAdlari = Array.from({ length: 4 + (s % 6) }, (_, i) => `Islem${s}_${i}`);
    const alanYollari = (/** @type {string} */ op) => Array.from({ length: 40 }, (_, i) => `${op}/Istek/Alan${i}`);
    /** @type {Record<string, any>} */
    const ayarlar = {
      yol: `/servis${s}.asmx`, tabanlar: { [testId]: 'http://127.0.0.1:9', [canliId]: '' }, soapSurumu: '1.1',
      operasyonlar: opAdlari.map((ad) => ({ ad, eylem: `urn:ornek:${ad}` })),
      operasyonSemalari: Object.fromEntries(opAdlari.map((ad) => [ad, {
        alanlar: alanYollari(ad).map((yol, i) => ({ yol, tip: i % 3 ? 'metin' : 'sayi', zorunlu: i % 2 === 0, aciklama: `Sahte açıklama ${i} `.repeat(4) }))
      }])),
      ornekIstekler: Object.fromEntries(opAdlari.slice(0, 3).map((ad) => [ad, [1, 2, 3].map((n) => ({ ad: `Örnek ${n}`, kaynak: 'elle', durum: 'basarili',
        govde: `<soap:Envelope><soap:Body><${ad}>${alanYollari(ad).map((y, i) => `<A${i}>sahte-${n}-${i}</A${i}>`).join('')}</${ad}></soap:Body></soap:Envelope>` }))])),
      alanBaglari: Object.fromEntries(opAdlari.slice(0, 2).map((ad) => [ad, { [`${ad}/Istek/Alan1`]: { tablo: kisi.id, sutun: 'Kimlik no' }, [`${ad}/Istek/Alan2`]: { tablo: sec(listeTablolari).id, sutun: 'Kolon 1' } }])),
      tarihKurallari: { BASLANGIC: 'bugun', BITIS: 'bugun+1y' },
      sozlesmeler: Object.fromEntries(opAdlari.map((ad) => [ad, { yapi: alanYollari(ad).map((y) => y.replace('Istek', 'Yanit')), olusturulma: '2026-09-01T00:00:00Z' }]))
    };
    const servisId = servisKaydet(vt, { projeId, anahtar: `servis-${s}`, ad: `Servis ${s}`, tur: 'soap', ayarlar });
    const senaryolar = [];
    for (let n = 0; n < sayi(12); n++) {
      const op = opAdlari[n % opAdlari.length];
      senaryolar.push(servisSenaryosuKaydet(vt, {
        projeId, servisId, baslik: `Servis ${s} senaryo ${n + 1}`, kapsam: n % 3 ? 'test' : 'ikisi', kosuyaDahil: n % 4 !== 0,
        icerik: {
          operasyon: op, kontroller: [{ tur: 'soapYaniti' }, { tur: 'icerir', deger: 'Basarili' }],
          govde: `<soap:Envelope><soap:Body><${op}>${Array.from({ length: 120 }, (_, i) => `<A${i}>${i === 1 ? '${Müşteriler.Kimlik no}' : `sahte-${n}-${i}`}</A${i}>`).join('')}<Parola>gizli-${n}</Parola></${op}></soap:Body></soap:Envelope>`
        }
      }));
    }
    for (let k = 0; k < sayi(120); k++) {
      const senaryoId = senaryolar[k % senaryolar.length];
      servisKosusuKaydet(vt, {
        projeId, servisId, senaryoId, ortamId: k % 5 ? testId : canliId, tur: 'kosu', durum: r() < 0.85 ? 'basarili' : 'basarisiz',
        baslangic: `2026-09-${String(1 + (k % 28)).padStart(2, '0')}T${String(k % 24).padStart(2, '0')}:00:00.000Z`, sureMs: 120 + k, baslik: `Servis ${s} senaryo`,
        sonuc: { istek: `<Istek>${'x'.repeat(600)}</Istek>`, yanit: `<Yanit>${'y'.repeat(900)}</Yanit>`, kontroller: [{ tur: 'soapYaniti', basarili: true }] }
      });
    }
  }
  return { projeId, testId, canliId, senaryoIdleri };
}

/**
 * Geçici dosyaya büyük proje veritabanı yazar (kasa parolası verilen). Veritabanı bellekte üretilip tek seferde dosyaya aktarılır.
 * @param {string} yol @param {string} parola @param {{ kdf?: { N: number; r: number; p: number }; tohum?: number; olcek?: number }} [secenekler]
 */
export async function buyukProjeDosyasiOlustur(yol, parola, secenekler = {}) {
  const vt = await veritabaniniHazirla(null);
  await kasaOlustur(vt, parola, secenekler.kdf ? { kdf: secenekler.kdf } : {});
  const bilgi = await buyukProjeUret(vt, secenekler);
  writeFileSync(yol, Buffer.from(vt.db.export()));
  vt.kapat();
  return bilgi;
}
