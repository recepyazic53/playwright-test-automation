// KORUMA TESTLERİ — yedekten içe aktarmada başka projeye eşlenen KAYNAK PROJE (A → B) bu bilgisayarda yeniden oluşmamalı ve
// kimliği yeni yazılan hiçbir kayıtta kalmamalı (ice-aktarma.mjs + ice-aktarma-esleme.mjs); proje silme projeye bağlı HER
// tabloyu siler (proje-yonetimi.mjs). Olay: A daha önce içe aktarılmış ve silinmiş; silmeden servis ailesi (servisler, servis
// senaryoları, servis koşuları) öksüz kalmış; aynı yedek A → B eşlemesiyle aktarılınca B'ye ikinci kopyalar yazılmış, A'nın
// kalıntıları durmuş. Dış istek yok: yalnız bellek içi / geçici veritabanları.
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, kosuOlustur, kosuSonucuEkle, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { eslemeOnizlemesi, iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { projeSilmeOnizlemesi, projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA_A = 'Kaynak-Proje-Parola-1';
const PAROLA_B = 'Kaynak-Proje-Yerel-Parola-2';

async function kaynakOlustur() {
  const vt = await veritabaniniHazirla(null);
  await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'Galaksi' });
  const test_ = ortamKaydet(vt, { projeId: proje, ad: 'TEST', tabanUrl: 'https://a-test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  const canli = ortamKaydet(vt, { projeId: proje, ad: 'CANLI', tabanUrl: 'https://a-canli.ornek.test', ayarlar: { riskli: true } });
  const servisler: string[] = [];
  const servisSenaryolari: string[] = [];
  for (const anahtar of ['odeme', 'iade', 'sorgu']) {
    const s = servisKaydet(vt, { projeId: proje, anahtar, ad: anahtar, tur: 'rest', ayarlar: { tabanlar: { [test_]: 'https://s.ornek.test' } } });
    servisler.push(s);
    for (const baslik of ['bir', 'iki']) {
      servisSenaryolari.push(servisSenaryosuKaydet(vt, { projeId: proje, servisId: s, baslik: `${anahtar} ${baslik}`, icerik: { operasyon: 'GET /x', govde: '{}', kontroller: [] } }));
    }
  }
  const servisKosusu = servisKosusuKaydet(vt, {
    projeId: proje, servisId: servisler[0], senaryoId: servisSenaryolari[0], ortamId: test_, tur: 'kosu', durum: 'basarili',
    baslangic: '2026-09-01T00:00:00.000Z', sureMs: 5, baslik: 'odeme bir', sonuc: {}
  });
  const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'sepet', ad: 'Sepet' });
  ekranModeliEkle(vt, { ekranId: ekran, model: { alanlar: [] } });
  const senaryo = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Sepete ekle', icerik: { adim: 1 } });
  const kosu = kosuOlustur(vt, { projeId: proje, ortamId: test_, tur: 'tam' });
  const sonuc = kosuSonucuEkle(vt, { kosuId: kosu, senaryoId: senaryo, senaryoBaslik: 'Sepete ekle', durum: 'passed' });
  return { vt, proje, test: test_, canli, servisler, servisSenaryolari, servisKosusu, ekran, senaryo, kosu, sonuc };
}

async function yerelOlustur() {
  const vt = await veritabaniniHazirla(null);
  await kasaOlustur(vt, PAROLA_B, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'NİPPON' });
  const test_ = ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://b-test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  const canli = ortamKaydet(vt, { projeId: proje, ad: 'Üretim', tabanUrl: 'https://b-canli.ornek.test', ayarlar: { riskli: true } });
  return { vt, proje, test: test_, canli };
}

const say = (vt: Veritabani, sql: string, p: unknown[] = []): number => Number(vt.tek(sql, p)?.n ?? 0);
/** sql.js bağlantısına doğrudan komut (FK'yi kapatmak / tetikleyici kurmak için; yalnız testte). */
const hamSql = (vt: Veritabani, sql: string): void => { (vt as unknown as { db: { run(s: string): void } }).db.run(sql); };

/** Arayüzün yaptığı gibi: önizlemedeki (eşlenmiş) yeni + değişen kayıtların hepsi seçilir. */
function arayuzSecimi(o: Awaited<ReturnType<typeof eslemeOnizlemesi>>): Record<string, string[]> {
  const secimler: Record<string, string[]> = {};
  for (const [t, v] of Object.entries(o.varliklar)) {
    const idler = [...v.yeni, ...v.degisen].map((x) => x.id);
    if (idler.length) secimler[t] = idler;
  }
  return secimler;
}

/** Şemadaki proje_id taşıyan HER tabloda (ve projeler'de) verilen proje kimliğine bağlı kayıt sayıları. */
function projeyeBagli(vt: Veritabani, proje: string): Record<string, number> {
  const sonuc: Record<string, number> = {};
  if (say(vt, 'SELECT COUNT(*) AS n FROM projeler WHERE id = ?', [proje])) sonuc.projeler = 1;
  for (const r of vt.tumu("SELECT name FROM sqlite_master WHERE type = 'table'")) {
    const t = String(r.name);
    if (!vt.tumu(`PRAGMA table_info(${t})`).some((s) => s.name === 'proje_id')) continue;
    const n = say(vt, `SELECT COUNT(*) AS n FROM ${t} WHERE proje_id = ?`, [proje]);
    if (n) sonuc[t] = n;
  }
  return sonuc;
}

/** Eski içe aktarma (eşlemesiz) → A bu bilgisayarda kendi kimlikleriyle. */
async function eskiAktarim(b: { vt: Veritabani }, yedek: Buffer): Promise<void> {
  iceAktarmaUygula(b.vt, await iceAktarmaHazirla(b.vt, yedek, PAROLA_A), { tumu: true }, { yapan: 'birim-test' });
}

/** FK'si çalışmayan eski bir silme: proje kaydı ve ekran ailesi gider, servis ailesi öksüz kalır (kullanıcının durumu). */
function eksikSil(vt: Veritabani, proje: string): void {
  hamSql(vt, 'PRAGMA foreign_keys = OFF');
  vt.islem(() => {
    vt.calistir('DELETE FROM kosu_sonuclari WHERE kosu_id IN (SELECT id FROM kosular WHERE proje_id = ?)', [proje]);
    vt.calistir('DELETE FROM ekran_modelleri WHERE ekran_id IN (SELECT id FROM ekranlar WHERE proje_id = ?)', [proje]);
    for (const t of ['kosular', 'senaryolar', 'ekranlar', 'ortamlar']) vt.calistir(`DELETE FROM ${t} WHERE proje_id = ?`, [proje]);
    vt.calistir('DELETE FROM projeler WHERE id = ?', [proje]);
  });
  hamSql(vt, 'PRAGMA foreign_keys = ON');
}

test('önceden aktarılıp silinmiş A: A→B eşlemesiyle "tümü" → A oluşmaz, hiçbir tabloda A kalmaz, servisler B\'de tek kopya; koşu/sonuç B\'ye eşlenir', async () => {
  const klasor = geciciKlasor('kaynak-proje-silinmis');
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const yedek = yedekOlustur(a.vt).veri;
    await eskiAktarim(b, yedek);
    // Silme önizlemesi servis ailesini de sayar; silme projeye bağlı her şeyi kaldırır.
    expect(projeSilmeOnizlemesi(b.vt, a.proje).sayilar).toMatchObject({ ortam: 2, ekran: 1, senaryo: 1, kosu: 1, sonuc: 1, servis: 3, servisSenaryosu: 6, servisKosusu: 1 });
    projeyiSil(b.vt, a.proje, { medyaKlasoru: klasor.yol, yapan: 'birim-test' });
    expect(projeyeBagli(b.vt, a.proje)).toEqual({});

    const h = await iceAktarmaHazirla(b.vt, yedek, PAROLA_A);
    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } };
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    expect(o.varliklar.projeler.yeni).toEqual([]);
    const sonuc = iceAktarmaUygula(b.vt, h, { tumu: true, esleme }, { yapan: 'birim-test' });
    expect(sonuc.otomatikEklenenUstKayitlar).toEqual([]);
    expect(sonuc.kalintilar).toEqual({});
    expect(projeyeBagli(b.vt, a.proje)).toEqual({});
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM projeler')).toBe(1);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(3);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servis_senaryolari WHERE proje_id = ?', [b.proje])).toBe(6);
    // Önizlemeye girmeyen kayıtlar (koşu, servis koşusu) da B'ye; ortamları B'nin ortamı; sonuç koşusuna bağlı.
    expect(b.vt.tek('SELECT proje_id, ortam_id FROM kosular WHERE id = ?', [a.kosu])).toEqual({ proje_id: b.proje, ortam_id: b.test });
    expect(b.vt.tek('SELECT proje_id, ortam_id FROM servis_kosulari WHERE id = ?', [a.servisKosusu])).toEqual({ proje_id: b.proje, ortam_id: b.test });
    expect(b.vt.tek('SELECT kosu_id FROM kosu_sonuclari WHERE id = ?', [a.sonuc])?.kosu_id).toBe(a.kosu);

    // B'de servisler ZATEN varken aynı yedek yeniden: aynı anahtarlı servislere eşlenir, çift servis oluşmaz.
    const tekrar = await eslemeOnizlemesi(b.vt, await iceAktarmaHazirla(b.vt, yedek, PAROLA_A), esleme);
    expect(tekrar.varliklar.servisler.yeni).toEqual([]);
    expect(tekrar.varliklar.servis_senaryolari.yeni).toEqual([]);
  } finally {
    a.vt.kapat(); b.vt.kapat(); klasor.temizle();
  }
});

test('KULLANICININ DURUMU: silinmiş A\'dan öksüz servis ailesi kalmış → A→B eşlemesi ikinci kopya üretmez, öksüzler B\'ye taşınır', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const yedek = yedekOlustur(a.vt).veri;
    await eskiAktarim(b, yedek);
    eksikSil(b.vt, a.proje);
    expect(projeyeBagli(b.vt, a.proje)).toEqual({ servisler: 3, servis_senaryolari: 6, servis_kosulari: 1 });

    const h = await iceAktarmaHazirla(b.vt, yedek, PAROLA_A);
    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } };
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    // Önizleme kalıntıyı bildirir; kalıntılar "yeni" değil aynı kayıt (değişen: proje) olarak görünür.
    expect(o.projeEslemesi?.ozet?.[0].kalinti).toEqual({ servisler: 3, servis_senaryolari: 6, servis_kosulari: 1 });
    expect(o.varliklar.servisler.yeni).toEqual([]);
    expect(o.varliklar.servisler.degisen.map((x) => x.id).sort()).toEqual([...a.servisler].sort());
    const sonuc = iceAktarmaUygula(b.vt, h, { secimler: arayuzSecimi(o), esleme }, { yapan: 'birim-test' });
    expect(sonuc.otomatikEklenenUstKayitlar).toEqual([]);
    expect(sonuc.kalintiTasinan).toBe(1); // öksüz servis koşusu
    expect(sonuc.kalintilar).toEqual({});
    expect(projeyeBagli(b.vt, a.proje)).toEqual({});
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(3);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler WHERE proje_id = ?', [b.proje])).toBe(3);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servis_senaryolari WHERE proje_id = ?', [b.proje])).toBe(6);
    expect(b.vt.tek('SELECT proje_id, ortam_id FROM servis_kosulari WHERE id = ?', [a.servisKosusu])).toEqual({ proje_id: b.proje, ortam_id: b.test });
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('yalnız servisler seçilince seçilmeyen öksüzler sessiz kalmaz: sonuçta kalıntı olarak raporlanır; A proje kaydı oluşmaz', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const yedek = yedekOlustur(a.vt).veri;
    await eskiAktarim(b, yedek);
    eksikSil(b.vt, a.proje);
    const h = await iceAktarmaHazirla(b.vt, yedek, PAROLA_A);
    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } };
    const o = await eslemeOnizlemesi(b.vt, h, esleme);
    const sonuc = iceAktarmaUygula(b.vt, h, { secimler: { servisler: arayuzSecimi(o).servisler }, esleme }, { yapan: 'birim-test' });
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler WHERE proje_id = ?', [b.proje])).toBe(3);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(3);
    expect(sonuc.kalintilar).toEqual({ [a.proje]: { servis_senaryolari: 6 } });
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM projeler WHERE id = ?', [a.proje])).toBe(0);
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('uygulama sonu denetimi: kaynak proje kimliği bir kayda yazılırsa her şey geri alınır ve anlaşılır hata verilir', async () => {
  const a = await kaynakOlustur();
  const b = await yerelOlustur();
  try {
    const h = await iceAktarmaHazirla(b.vt, yedekOlustur(a.vt).veri, PAROLA_A);
    const esleme = { projeler: { [a.proje]: { hedef: b.proje } } };
    // Hata benzetimi: servis yazılınca kaynak projeyi yeniden oluşturan ve servisi ona bağlayan bir tetikleyici.
    hamSql(b.vt, `CREATE TEMP TRIGGER hata_benzetimi AFTER INSERT ON servisler BEGIN
      INSERT OR IGNORE INTO projeler (id, ad, ayarlar_json, olusturulma, guncellenme) VALUES ('${a.proje}', 'Galaksi', '{}', 'z', 'z');
      UPDATE servisler SET proje_id = '${a.proje}' WHERE id = NEW.id; END`);
    const onceki = say(b.vt, 'SELECT COUNT(*) AS n FROM ortamlar');
    expect(() => iceAktarmaUygula(b.vt, h, { tumu: true, esleme }, { yapan: 'birim-test' }))
      .toThrow(/İçe aktarma geri alındı: "Galaksi" projesi başka projeye aktarılırken kimliği şu kayıtlarda kaldı — projeler: 1, servisler: 3/);
    hamSql(b.vt, 'DROP TRIGGER hata_benzetimi');
    expect(projeyeBagli(b.vt, a.proje)).toEqual({});
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM servisler')).toBe(0);
    expect(say(b.vt, 'SELECT COUNT(*) AS n FROM ortamlar')).toBe(onceki);
  } finally {
    a.vt.kapat(); b.vt.kapat();
  }
});

test('proje silme FK\'ye güvenmez: FK kapalıyken de projeye bağlı her tablo silinir (öksüz servis kalmaz)', async () => {
  const klasor = geciciKlasor('kaynak-proje-fk');
  const a = await kaynakOlustur();
  try {
    hamSql(a.vt, 'PRAGMA foreign_keys = OFF');
    const r = projeyiSil(a.vt, a.proje, { medyaKlasoru: klasor.yol, yapan: 'birim-test' });
    expect(r.silinen).toMatchObject({ servis: 3, servisSenaryosu: 6, servisKosusu: 1, ekran: 1, senaryo: 1, kosu: 1 });
    expect(projeyeBagli(a.vt, a.proje)).toEqual({});
    for (const t of ['ekran_modelleri', 'kosu_sonuclari']) expect(say(a.vt, `SELECT COUNT(*) AS n FROM ${t}`), t).toBe(0);
  } finally {
    a.vt.kapat(); klasor.temizle();
  }
});
