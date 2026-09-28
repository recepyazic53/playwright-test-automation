// KORUMA TESTLERİ — PDF raporu A4: raporlar için yeni veriler (Ayarlar > Raporlar ve koşuya bağlı uygulama sürümü).
// Denetlenenler: göç 17 (ekipler, rapor_isaretleri, servis_kosulari.uygulama_surumu; eski şemadan göç), kayıt ve doğrulama (ekip,
// öğe işareti; boşalınca satır silinir; metot eşikleri şifreli), uygulama sürümünün koşu kaydına yazılması (ekran: ozet_json,
// servis: sütun; koşu anındaki değer > ortam ayarı), boşken raporların A3 ile aynı olması, kritik işaretinin öncelik / rozet / kart
// etkisi, ekip eşlemesinin sahip önerisi, süre eşiği aşımları (ek aksiyon, eşik çizgisi), sürüme göre başarı ve sorunun başladığı
// sürüm, kararsızlıkta "aynı sürüm", maskeleme (HTML ve PDF), içe aktarma (yeni proje / mevcut projeye eşleme, tekrar aktarma) ve
// proje silme. Yalnız geçici veritabanları; dış istek ve gerçek koşu YOK.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc, type Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { GUNCEL_SEMA_SURUMU, gocleriUygula, mevcutSemaSurumu } from '../../scripts/platform/veritabani/gocler.mjs';
import { kosuKaydet, kosuyuBitir, uygulamaSurumuOku } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisAkisiKaydet, servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import {
  UYGULAMA_SURUMU_DEGISKENI, ekipKaydet, ekipSil, ekipleriListele, kosuUygulamaSurumu, raporIsaretiKaydet, raporIsaretleriniListele, raporVerileriniOku,
  uygulamaSurumuTemizle
} from '../../scripts/platform/ayarlar/rapor-verileri.mjs';
import { calistirmaIsteginiHazirla } from '../../scripts/platform/senaryolar/calistirma.mjs';
import { kararlilikHesapla } from '../../scripts/platform/sonuclar/sorun-modeli.mjs';
import { sahipOnerisi } from '../../scripts/platform/sonuclar/oncelik.mjs';
import { raporGirdisiDogrula, raporHazirla, raporPdf, raporVerileriEkrani } from '../../scripts/platform/sonuclar/rapor-uclari.mjs';
import { pdfTarayicisiniKapat } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { projeKalintilari, projeSilmeOnizlemesi, projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { ornekBasvuruModeli } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import {
  GIZLI_PAROLA, RAPOR_SIMDI, SIZINTILAR, SURUM_ILK, SURUM_SON, a4VeriKur, cokluVeriKur, genelGirdi, genelVeriKur, raporGirdisi, raporVerisiKur, type GenelFikstur
} from './pdf-rapor-fikstur';

test.describe.configure({ mode: 'serial' });

const say = (vt: Veritabani, sql: string, p: unknown[] = []): number => Number(vt.tek(sql, p)?.n ?? 0);

/** Genel fikstürlü geçici veritabanı (kasası açık). */
async function genelKur(yol: string | null = null): Promise<{ vt: Veritabani; f: GenelFikstur }> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
  return { vt, f: genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt))) };
}

let klasor = '';
let medya = '';
const b = () => ({ medyaKlasoru: medya, simdi: RAPOR_SIMDI });

test.beforeAll(() => {
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-a4-'));
  medya = join(klasor, 'medya');
});

test.afterAll(async () => {
  await pdfTarayicisiniKapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('göç 17: sürüm 16 veritabanına ekipler, rapor_isaretleri ve servis_kosulari.uygulama_surumu eklenir; mevcut satırlar korunur', async () => {
  const vt = await veritabaniAc(null);
  try {
    gocleriUygula(vt, { hedefSurum: 16 });
    expect(mevcutSemaSurumu(vt)).toBe(16);
    const z = '2026-09-01T00:00:00.000Z';
    vt.calistir('INSERT INTO projeler (id, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?)', ['p1', 'Eski', z, z]);
    vt.calistir(`INSERT INTO servisler (id, proje_id, anahtar, ad, tur, olusturulma, guncellenme) VALUES ('s1', 'p1', 'a', 'A', 'rest', ?, ?)`, [z, z]);
    vt.calistir(`INSERT INTO servis_kosulari (id, proje_id, servis_id, tur, durum, baslangic) VALUES ('k1', 'p1', 's1', 'kosu', 'basarili', ?)`, [z]);
    const r = gocleriUygula(vt);
    expect(r.uygulananlar).toEqual([17]);
    expect(GUNCEL_SEMA_SURUMU).toBe(17);
    expect(vt.tek('SELECT ad FROM sema_surumu WHERE surum = 17')?.ad).toBe('rapor_verileri');
    const tablolar = vt.tumu("SELECT name FROM sqlite_master WHERE type = 'table'").map((x) => String(x.name));
    expect(tablolar).toEqual(expect.arrayContaining(['ekipler', 'rapor_isaretleri']));
    expect(vt.tek('SELECT id, uygulama_surumu FROM servis_kosulari')).toEqual({ id: 'k1', uygulama_surumu: null });
    // Aynı öğeye ikinci satır yazılamaz (proje + tür + öğe tekil); tür denetimi.
    vt.calistir(`INSERT INTO rapor_isaretleri (id, proje_id, oge_turu, oge_id, olusturulma, guncellenme) VALUES ('r1', 'p1', 'servis', 's1', ?, ?)`, [z, z]);
    expect(() => vt.calistir(`INSERT INTO rapor_isaretleri (id, proje_id, oge_turu, oge_id, olusturulma, guncellenme) VALUES ('r2', 'p1', 'servis', 's1', ?, ?)`, [z, z])).toThrow();
    expect(() => vt.calistir(`INSERT INTO rapor_isaretleri (id, proje_id, oge_turu, oge_id, olusturulma, guncellenme) VALUES ('r3', 'p1', 'baska', 's1', ?, ?)`, [z, z])).toThrow();
  } finally { vt.kapat(); }
});

test('kayıt: ekip ve öğe işareti doğrulaması, birleştirme, boşalınca silme, şifreli metot eşikleri, ekip silme', async () => {
  const { vt, f } = await genelKur();
  try {
    const p = f.projeId;
    expect(() => ekipKaydet(vt, { projeId: p, ad: '  ' })).toThrow('boş olamaz');
    expect(() => ekipKaydet(vt, { projeId: p, ad: 'x'.repeat(81) })).toThrow('en çok 80');
    const e1 = ekipKaydet(vt, { projeId: p, ad: ' Kayıt   ekibi ' });
    expect(ekipleriListele(vt, p)).toEqual([{ id: e1, ad: 'Kayıt ekibi' }]);
    expect(() => ekipKaydet(vt, { projeId: p, ad: 'KAYIT EKİBİ' })).toThrow('zaten var');
    expect(ekipKaydet(vt, { projeId: p, id: e1, ad: 'Kayıt takımı' })).toBe(e1);
    expect(() => ekipKaydet(vt, { projeId: f.baskaProjeId, id: e1, ad: 'Başka' })).toThrow('Ekip bulunamadı');
    const e2 = ekipKaydet(vt, { projeId: p, ad: 'Altyapı ekibi' });

    // Doğrulama: tür, başka projedeki öğe, akışta ekip / eşik, ekranda metot eşiği, eşik sınırları, başka projenin ekibi.
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ortam', ogeId: f.ekranId, kritik: true })).toThrow('ogeTuru');
    const baskaEkran = ekranKaydet(vt, { projeId: f.baskaProjeId, anahtar: 'baska', ad: 'Başka ekran' });
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: baskaEkran, kritik: true })).toThrow('bulunamadı');
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'akis', ogeId: f.akisId, sureEsigiMs: 100 })).toThrow('yalnız kritik');
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, metotEsikleri: { a: 5 } })).toThrow('yalnız servislerde');
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, sureEsigiMs: 0 })).toThrow('1–3600000');
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'servis', ogeId: f.servisId, metotEsikleri: { 'GET /a': 1.5 } })).toThrow('tam sayı');
    const baskaEkip = ekipKaydet(vt, { projeId: f.baskaProjeId, ad: 'Dış ekip' });
    expect(() => raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, ekipId: baskaEkip })).toThrow('Ekip bulunamadı');

    // Verilmeyen alan korunur; null / boş temizler; hepsi boşalınca satır silinir.
    expect(raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, kritik: true })).toMatchObject({ kritik: true, ekipId: null, sureEsigiMs: null });
    expect(raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, ekipId: e1, sureEsigiMs: '1200' })).toMatchObject({ kritik: true, ekipId: e1, sureEsigiMs: 1200 });
    expect(raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'ekran', ogeId: f.ekranId, kritik: false, sureEsigiMs: '' })).toMatchObject({ kritik: false, ekipId: e1, sureEsigiMs: null });
    const servis = raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'servis', ogeId: f.servisId, metotEsikleri: { 'POST /kayit': 400, 'GET /x': '' } });
    expect(servis?.metotEsikleri).toEqual({ 'POST /kayit': 400 });
    // Metot adları şifreli saklanır (kasa zarfı).
    const ham = String(vt.tek('SELECT metot_esikleri_json FROM rapor_isaretleri WHERE oge_id = ?', [f.servisId])?.metot_esikleri_json);
    expect(ham).toMatch(/^kasa:v1:/);
    expect(ham).not.toContain('kayit');
    expect(raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'akis', ogeId: f.akisId, kritik: true })).toMatchObject({ ogeTuru: 'akis', kritik: true });
    expect(raporIsaretleriniListele(vt, p).map((x) => x.ogeTuru).sort()).toEqual(['akis', 'ekran', 'servis']);
    expect(raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'akis', ogeId: f.akisId, kritik: false })).toBeNull();
    expect(say(vt, 'SELECT COUNT(*) AS n FROM rapor_isaretleri WHERE oge_turu = ?', ['akis'])).toBe(0);

    // Rapor hesabının okuduğu biçim.
    raporIsaretiKaydet(vt, { projeId: p, ogeTuru: 'servis', ogeId: f.servis2Id, kritik: true, ekipId: e2 });
    const rv = raporVerileriniOku(vt, p);
    expect([...rv.kritik]).toEqual([`servis:${f.servis2Id}`]);
    expect(Object.fromEntries(rv.ekip)).toEqual({ [`ekran:${f.ekranId}`]: 'Kayıt takımı', [`servis:${f.servis2Id}`]: 'Altyapı ekibi' });
    expect(rv.esik.get(`servis:${f.servisId}`)).toEqual({ ms: null, metotlar: { 'POST /kayit': 400 } });
    expect(rv.sayilar).toEqual({ kritik: 1, ekip: 2, esik: 1, ekipListesi: 2 });

    // Ayarlar > Raporlar ekranının verisi: öğe listeleri ve metotlar (rapordaki metot adıyla aynı kural).
    const ekranVerisi = raporVerileriEkrani(vt, p);
    expect(ekranVerisi.ekipler.map((x) => x.ad)).toEqual(['Altyapı ekibi', 'Kayıt takımı']);
    expect(ekranVerisi.ekranlar.find((x) => x.id === f.ekranId)).toMatchObject({ ad: 'Başvuru', kritik: false, ekipId: e1, ortakAkis: false });
    expect(ekranVerisi.ekranlar.find((x) => x.id === f.ortakAkisId)?.ortakAkis).toBe(true);
    expect(ekranVerisi.servisler.find((x) => x.id === f.servisId)?.metotlar).toEqual(['GET /kayit/${id}', 'POST /kayit']);
    expect(ekranVerisi.akislar.map((x) => [x.ad, x.tur])).toEqual(expect.arrayContaining([['Kayıt akışı', 'Servis akışı'], ['Uçtan uca kayıt', 'Uçtan uca akış']]));

    // Ekip silinince atandığı öğeler sahipsiz kalır; yalnız ekibi olan satır silinir.
    expect(ekipSil(vt, p, e1)).toEqual({ etkilenen: 1 });
    expect(say(vt, 'SELECT COUNT(*) AS n FROM rapor_isaretleri WHERE oge_id = ?', [f.ekranId])).toBe(0);
    expect(raporIsaretleriniListele(vt, p).find((x) => x.ogeId === f.servis2Id)).toMatchObject({ kritik: true, ekipId: e2 });
    expect(() => ekipSil(vt, p, e1)).toThrow('Ekip bulunamadı');
  } finally { vt.kapat(); }
});

test('uygulama sürümü: temizleme, koşu anındaki değer > ortam ayarı; ekran koşusu özetine ve servis koşusuna yazılır; sunucu koşu sürecine taşır', async () => {
  expect(uygulamaSurumuTemizle('  2.4.1\n rc ')).toBe('2.4.1 rc');
  expect(uygulamaSurumuTemizle('')).toBeNull();
  expect(uygulamaSurumuTemizle(42)).toBeNull();
  expect(uygulamaSurumuTemizle('x'.repeat(100))).toHaveLength(60);
  expect(kosuUygulamaSurumu(' 3.0 ', { ayarlar: { uygulamaSurumu: '2.9' } })).toBe('3.0');
  expect(kosuUygulamaSurumu('', { ayarlar: { uygulamaSurumu: '2.9' } })).toBe('2.9');
  expect(kosuUygulamaSurumu(undefined, { ayarlar: {} })).toBeNull();

  const k = geciciKlasor('a4-surum');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Sürüm Projesi' });
    const surumlu = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false, uygulamaSurumu: '5.1' } });
    const surumsuz = ortamKaydet(vt, { projeId, ad: 'Diğer', tabanUrl: 'http://127.0.0.1:9/', ayarlar: { riskli: false } });

    // Ekran koşusu: sürüm özet JSON'unda; aynı kimlikle sonraki parça ilk sürümü değiştirmez; bitirince (özet yeniden hesaplanınca) korunur.
    kosuKaydet(vt, { id: 'kosu-1', projeId, ortamId: surumlu, tur: 'tam', uygulamaSurumu: ' 5.1 ' });
    kosuKaydet(vt, { id: 'kosu-1', projeId, ortamId: surumlu, tur: 'tam', uygulamaSurumu: '9.9' });
    kosuyuBitir(vt, 'kosu-1', { durum: 'tamamlandi' });
    expect(uygulamaSurumuOku(vt.tek('SELECT ozet_json FROM kosular WHERE id = ?', ['kosu-1'])?.ozet_json)).toBe('5.1');
    kosuKaydet(vt, { id: 'kosu-2', projeId, ortamId: surumlu, tur: 'tam' });
    kosuKaydet(vt, { id: 'kosu-2', projeId, ortamId: surumlu, tur: 'tam', uygulamaSurumu: '5.2' });
    expect(uygulamaSurumuOku(vt.tek('SELECT ozet_json FROM kosular WHERE id = ?', ['kosu-2'])?.ozet_json)).toBe('5.2');
    kosuKaydet(vt, { id: 'kosu-3', projeId, tur: 'tekil' });
    expect(vt.tek('SELECT ozet_json FROM kosular WHERE id = ?', ['kosu-3'])?.ozet_json).toBe('{}');

    // Servis koşusu: sütun.
    const servisId = servisKaydet(vt, { projeId, anahtar: 'a', ad: 'A', tur: 'rest' });
    const s1 = servisKosusuKaydet(vt, { projeId, servisId, tur: 'kosu', durum: 'basarili', baslangic: new Date().toISOString(), sureMs: 5, sonuc: {}, uygulamaSurumu: '5.1' });
    const s2 = servisKosusuKaydet(vt, { projeId, servisId, tur: 'dene', durum: 'basarili', baslangic: new Date().toISOString(), sureMs: 5, sonuc: {} });
    expect(vt.tek('SELECT uygulama_surumu AS s FROM servis_kosulari WHERE id = ?', [s1])?.s).toBe('5.1');
    expect(vt.tek('SELECT uygulama_surumu AS s FROM servis_kosulari WHERE id = ?', [s2])?.s).toBeNull();

    // Ekran koşusu isteği: sunucu sürümü koşu sürecine ortam değişkeniyle verir (gövdedeki > ortam ayarı; yoksa hiç).
    const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
    ekranModeliEkle(vt, { ekranId, model: ornekBasvuruModeli() });
    const senaryoId = senaryoKaydet(vt, { projeId, ekranId, baslik: 'Ürün A başvurusu', icerik: { kosucu: 'model', ortamlar: { [surumlu]: {}, [surumsuz]: {} }, veri: { baslik: 'Ürün A başvurusu' } } });
    const govde = { projeId, ortamId: surumlu, senaryoId, kosuId: 'k1', kosuTuru: 'tam', kosuKimligi: 'toplu-1' };
    expect(calistirmaIsteginiHazirla(vt, govde).ekOrtam[UYGULAMA_SURUMU_DEGISKENI]).toBe('5.1');
    expect(calistirmaIsteginiHazirla(vt, { ...govde, uygulamaSurumu: '5.2-rc' }).ekOrtam[UYGULAMA_SURUMU_DEGISKENI]).toBe('5.2-rc');
    expect(UYGULAMA_SURUMU_DEGISKENI in calistirmaIsteginiHazirla(vt, { ...govde, ortamId: surumsuz }).ekOrtam).toBe(false);
  } finally { vt.kapat(); k.temizle(); }
});

test('kararlılık: uygulama sürümü kayıtlıysa aynı sürümdeki koşular (farklı günler) karşılaştırılır; yoksa aynı gün', () => {
  const gun = (g: number, saat = 9) => new Date(2026, 8, 15 + g, saat).getTime();
  const dizi = ['basarili', 'basarisiz', 'basarili', 'basarisiz', 'basarili', 'basarisiz'];
  const gozlem = (i: number, surum: string | null) => ({ zaman: gun(i), durum: dizi[i], senaryo: 's', maruz: 's', ortam: 'o', surum: 1, uygulamaSurumu: surum });
  // Sürümsüz: her gün tek koşu → karşılaştırılabilir koşu yok.
  expect(kararlilikHesapla(dizi.map((_, i) => gozlem(i, null))).get('s')).toMatchObject({ kosu: 0, durum: 'kararli' });
  // Aynı sürüm, altı gün: 5 değişim / 5 → kararsız.
  expect(kararlilikHesapla(dizi.map((_, i) => gozlem(i, '2.4'))).get('s')).toMatchObject({ kosu: 6, degisim: 5, durum: 'kararsiz' });
  // Her gün farklı sürüm: karşılaştırılamaz.
  expect(kararlilikHesapla(dizi.map((_, i) => gozlem(i, `2.${i}`))).get('s')).toMatchObject({ kosu: 0 });
});

test('boşken: raporlar A3 ile aynı (kritiklik 0, sahip = sınıf varsayılanı, sürüm / eşik / kritik bölümü yok); işaretler temizlenince yine aynı', async () => {
  test.setTimeout(120_000);
  const { vt, f } = await genelKur();
  try {
    const hazirla = (g: Record<string, unknown>) => raporHazirla(vt, raporGirdisiDogrula(g), b());
    const girdiler = [genelGirdi(f), raporGirdisi(f, 'ekran'), raporGirdisi(f, 'servis')];
    const ozu = (v: Awaited<ReturnType<typeof hazirla>>['veri']) => ({
      rozet: v.rozet, maddeler: v.maddeler, bantSayim: v.bantSayim, aksiyonlar: v.aksiyonlar,
      sorunlar: v.sorunlar.map((s) => [s.imza, s.puan, s.bant, s.sahip, s.kritik, s.ilkSurum])
    });
    const once = [];
    for (const g of girdiler) {
      const { veri: v, html } = await hazirla(g);
      expect(v.kritik).toBeNull();
      expect(v.surumler).toBeNull();
      expect(v.esikAsimlari).toBeNull();
      expect(v.raporVerileri).toEqual({ kritik: 0, ekip: 0, esik: 0, surumluSonuc: 0 });
      for (const s of v.sorunlar) {
        expect(s.kritik).toBe(false);
        expect(s.ilkSurum).toBeNull();
        expect(s.sahip).toBe(sahipOnerisi(s.sinif));
      }
      expect(html).not.toContain('Uygulama sürümlerine göre');
      expect(html).not.toContain('Süre eşiği aşımları');
      expect(html).not.toContain('★ kritik');
      expect(html).toContain('Kritik işareti yok: kritiklik 0 alınır.');
      expect(html).toContain('Uygulama sürümü kayıtlı değil');
      once.push(ozu(v));
    }
    // İşaretler yazılıp hepsi temizlenince (satırlar silinir) sonuç aynıdır.
    const f4 = a4VeriKur(vt, f, { surumler: false });
    for (const [tur, id] of [['ekran', f.ekranId], ['servis', f.servisId], ['servis', f.servis2Id], ['akis', f.akisId]] as const) {
      expect(raporIsaretiKaydet(vt, { projeId: f.projeId, ogeTuru: tur, ogeId: id, kritik: false, ekipId: null, sureEsigiMs: null, ...(tur === 'servis' ? { metotEsikleri: {} } : {}) })).toBeNull();
    }
    ekipSil(vt, f.projeId, f4.kayitEkibi);
    ekipSil(vt, f.projeId, f4.altyapiEkibi);
    expect(say(vt, 'SELECT COUNT(*) AS n FROM rapor_isaretleri')).toBe(0);
    for (const [i, g] of girdiler.entries()) expect(ozu((await hazirla(g)).veri)).toEqual(once[i]);
  } finally { vt.kapat(); }
});

test.describe('rapor verileri dolu (A4 fikstürü)', () => {
  let vt: Veritabani;
  let f: GenelFikstur;
  /** İşaretler yazılmadan (yalnız sürümler varken) sorun puanları (imza → puan). */
  let oncekiPuan = new Map<string, number>();
  const hazirla = (g: Record<string, unknown>) => raporHazirla(vt, raporGirdisiDogrula(g), b());

  test.beforeAll(async () => {
    ({ vt, f } = await genelKur(join(klasor, 'a4.db')));
    a4VeriKur(vt, f, { isaretler: false });
    oncekiPuan = new Map((await hazirla(genelGirdi(f))).veri.sorunlar.map((s) => [s.imza, s.puan]));
    a4VeriKur(vt, f, { surumler: false });
  });
  test.afterAll(() => { vt?.kapat(); });

  test('kritik işareti: öncelikte kritiklik 1, kritik akış son koşusunda kaldı → rozet Kritik, "Kritik akış" kartı', async () => {
    // Tek servis: Kayıt Servisi %91 başarı; onu kullanan kritik "Kayıt akışı" son koşusunda kaldı → Kritik.
    const { veri: s, html: sHtml } = await hazirla(raporGirdisi(f, 'servis'));
    expect(s.rozet).toEqual({ durum: 'kritik', gerekce: 'Kapsamdaki kritik akış son koşusunda kaldı.' });
    expect(s.kritik).toEqual({ toplam: 1, kalan: 1, ogeler: [{ tur: 'Servis akışı', ad: 'Kayıt akışı', son: 'K' }] });
    expect(s.maddeler[0]).toEqual(['kotu', 'Kritik işaretli öğe son koşusunda kaldı: Kayıt akışı.']);
    expect(s.servis!.akislar.find((a) => a.ad === 'Kayıt akışı')?.kritik).toBe(true);
    expect(sHtml).toContain('Kritik işaretli akış son koşusunda kaldıysa durum rozeti Kritik olur');
    // Genel: Başvuru (ekran, son tam koşu geçti), Bildirim Servisi (son çağrı geçti), Kayıt akışı (kaldı).
    const { veri: v, html } = await hazirla(genelGirdi(f));
    expect(v.kritik).toMatchObject({ toplam: 3, kalan: 1 });
    expect(v.kritik!.ogeler.map((o) => [o.tur, o.ad, o.son])).toEqual([['Ekran', 'Başvuru', 'G'], ['Servis', 'Bildirim Servisi', 'G'], ['Servis akışı', 'Kayıt akışı', 'K']]);
    expect(html).toContain('>Kritik akış</div>');
    expect(html).toContain('★ kritik');
    // Kritik öğelerin (Başvuru, Bildirim Servisi) açık sorunlarının puanı arttı (kritiklik 0,15 × sınıf katsayısı), diğerlerininki aynı.
    const kritikOgeler = new Set([f.ekranId, f.servis2Id]);
    let artan = 0;
    for (const x of v.sorunlar) {
      const once = oncekiPuan.get(x.imza) ?? 0;
      expect(x.kritik).toBe(kritikOgeler.has(x.ogeId));
      if (!kritikOgeler.has(x.ogeId) || x.durum === 'cozulen' || x.durum === 'dogrulanamadi') expect(x.puan).toBe(once);
      else { expect(x.puan).toBeGreaterThan(once); artan++; }
    }
    expect(artan).toBeGreaterThan(0);
    // Çoklu ekran: Başvuru satırı kritik işaretli; öğe rozeti son koşu geçtiği için Kritik değil (başarıya göre).
    const { veri: c } = await hazirla({ ...genelGirdi(f), kapsam: 'coklu-ekran', ekranIdleri: [f.ekranId, f.ekran2Id] });
    expect(c.coklu!.ekranTarafi!.ogeler.find((o) => o.id === f.ekranId)).toMatchObject({ kritik: true, kritikKaldi: false });
  });

  test('ekip eşlemesi: sahip önerisi öğenin ekibi; eşlenmeyen öğede sınıfın varsayılanı', async () => {
    const { veri: v, html } = await hazirla(genelGirdi(f));
    for (const s of v.sorunlar) {
      if (s.ogeId === f.ekranId) expect([s.sahip, s.ekipEslemesi]).toEqual(['Kayıt ekibi', true]);
      else if (s.ogeId === f.servisId) expect([s.sahip, s.ekipEslemesi]).toEqual(['Altyapı ekibi', true]);
      else expect([s.sahip, s.ekipEslemesi]).toEqual([sahipOnerisi(s.sinif), false]);
    }
    // Ek aksiyon ("her koşuda atlandı") da ekranın ekibine gider.
    expect(v.aksiyonlar.concat().find((a) => a.baslik.includes('her koşuda atlandı'))?.sahip ?? 'Kayıt ekibi').toBe('Kayıt ekibi');
    expect(html).toContain('Kayıt ekibi');
    expect(html).toContain('Ekip eşlemesi: 2 öğe');
  });

  test('süre eşiği: eşik aşımları listesi, P2 ek aksiyon, metot tablosunda ve süre grafiğinde eşik', async () => {
    const { veri: v, html } = await hazirla(genelGirdi(f, { aksiyonSayisi: 20 }));
    const esik = v.esikAsimlari!;
    expect(esik.map((x) => [x.tur, x.oge, x.metot, x.esik, x.asti, x.kaynak ?? null])).toEqual([
      ['ekran', 'Başvuru', null, 1200, true, null],
      ['servis', 'Kayıt Servisi', 'POST /kayit', 400, true, 'servis'],
      ['servis', 'Kayıt Servisi', 'GET /kayit/${id}', 500, false, 'metot']
    ]);
    // POST: 14 gün × 2 çağrı, hepsi 450 ms; yanıtsız ("hata") çağrı süreye girmez.
    expect(esik[1]).toMatchObject({ p95: 450, olculen: 28, asan: 28, oncekiAsan: 0 });
    expect(esik[2]).toMatchObject({ p95: 300, asan: 0 });
    const aksiyonlar = v.aksiyonlar.filter((a) => a.esikAsimi);
    expect(aksiyonlar.map((a) => [a.baslik, a.bant, a.puan, a.sahip])).toEqual([
      ['Süre eşiği aşıldı: Başvuru', 'P2', 40, 'Kayıt ekibi'], ['Süre eşiği aşıldı: Kayıt Servisi › POST /kayit', 'P2', 40, 'Altyapı ekibi']
    ]);
    expect(html).toContain('Süre eşiği aşımları (2 / 3)');
    // Tek servis: süre grafiğinde servis eşiği çizgisi; metot tablosunda eşik üstü.
    const { veri: s, html: sHtml } = await hazirla(raporGirdisi(f, 'servis'));
    expect(s.servis!.sureEgilimi.esik).toBe(400);
    expect(s.servis!.metotlar.find((m) => m.ad === 'POST /kayit')?.esik).toMatchObject({ esik: 400, asti: true, kaynak: 'servis' });
    expect(sHtml).toContain('süre eşiği 400 ms');
    expect(sHtml).toContain('eşik 400 ms üstü');
    // Tek ekran: senaryo özetinde eşik üstü p95.
    const { veri: e, html: eHtml } = await hazirla(raporGirdisi(f, 'ekran'));
    expect(e.ekran!.esik).toMatchObject({ esik: 1200, asti: true });
    expect(e.ekran!.senaryolar.some((x) => x.esikAsti)).toBe(true);
    expect(eHtml).toContain('eşik üstü');
  });

  test('uygulama sürümü: sürüme göre başarı, sorunun başladığı sürüm, yöntem notu', async () => {
    const { veri: v, html } = await hazirla(genelGirdi(f));
    const s = v.surumler!;
    expect(s.toplam).toBe(2);
    expect(s.liste.map((x) => x.surum)).toEqual([SURUM_ILK, SURUM_SON]);
    expect(s.liste.reduce((t, x) => t + x.ekranTest, 0)).toBe(v.coklu!.ekranTarafi!.ozet.test);
    expect(s.liste.reduce((t, x) => t + x.cagri, 0)).toBe(v.coklu!.servisTarafi!.ozet.cagri);
    // "Kaydet" doğrulaması (yeni) bu dönemin 2. gününde başladı → ilk sürüm; önceki dönemden gelen sorun etiketsiz.
    const kaydet = v.sorunlar.find((x) => x.baslik.includes('"Kaydet"'));
    expect(kaydet?.ilkSurum).toBe(SURUM_ILK);
    const onay = v.sorunlar.find((x) => x.baslik.includes('"Onayla"'));
    expect(onay?.ilkSurum).toBeNull();
    expect(s.liste[0].baslayanSorun).toBeGreaterThan(0);
    expect(html).toContain('Uygulama sürümlerine göre');
    expect(html).toContain(`Başladığı uygulama sürümü: ${SURUM_ILK}`);
    expect(html).toContain('sonuç sürüm etiketli');
    expect(v.raporVerileri.surumluSonuc).toBe(s.liste.reduce((t, x) => t + x.ekranTest + x.cagri, 0));
    // Yöntem notu: "sonraki aşama" artık bu dört veriyi saymaz.
    expect(html).toContain('Kalıcı tetikleme kaydı');
    expect(html).not.toContain('Kritik akış işareti, uygulama sürümü, ekip eşlemesi, metot süre eşiği ve kalıcı tetikleme kaydı henüz yok');
  });

  test('maskeleme: ekip adındaki ve sürümdeki gizli değer HTML ve PDF\'te yok; PDF yerel, dış istek yok; örnek PDF', async () => {
    test.setTimeout(180_000);
    const gizliEkip = ekipKaydet(vt, { projeId: f.projeId, ad: `Ekip ${GIZLI_PAROLA}` });
    raporIsaretiKaydet(vt, { projeId: f.projeId, ogeTuru: 'ekran', ogeId: f.ekran2Id, ekipId: gizliEkip });
    const sonKosu = vt.tek("SELECT id, ozet_json FROM kosular WHERE id LIKE 't%' ORDER BY baslangic DESC LIMIT 1");
    vt.calistir('UPDATE kosular SET ozet_json = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(sonKosu?.ozet_json)), uygulamaSurumu: `rc-${GIZLI_PAROLA}` }), sonKosu?.id]);
    try {
      const { html, veri } = await hazirla(genelGirdi(f, { aksiyonSayisi: 20 }));
      expect(veri.aksiyonlar.some((s) => s.sahip === `Ekip ${GIZLI_PAROLA}`)).toBe(true);
      expect(veri.surumler!.liste.some((s) => s.surum === `rc-${GIZLI_PAROLA}`)).toBe(true);
      for (const x of SIZINTILAR) expect(html).not.toContain(x);
      // Ad alanı maskesi (bilinen gizli değer yer tutucuya döner): aksiyon tablosunda sahip, sürüm tablosunda sürüm.
      expect(html).toContain('Ekip •••');
      expect(html).toContain('rc-•••');
      const r = await raporPdf(vt, genelGirdi(f), b());
      expect(r.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(r.sayfa).toBeGreaterThan(1);
      expect(r.engellenenIstek).toBe(0);
      for (const x of SIZINTILAR) expect(r.pdf.toString('latin1')).not.toContain(x);
    } finally {
      raporIsaretiKaydet(vt, { projeId: f.projeId, ogeTuru: 'ekran', ogeId: f.ekran2Id, ekipId: null });
      ekipSil(vt, f.projeId, gizliEkip);
      vt.calistir('UPDATE kosular SET ozet_json = ? WHERE id = ?', [String(sonKosu?.ozet_json), sonKosu?.id]);
    }
    // Görsel inceleme için örnek PDF + HTML (yalnız ortam değişkeni verilince; dört veri dolu genel rapor).
    const ornek = process.env.PDF_RAPOR_A4_ORNEK_KLASORU;
    if (ornek) {
      const r = await raporPdf(vt, genelGirdi(f), b());
      mkdirSync(ornek, { recursive: true });
      writeFileSync(join(ornek, r.dosyaAdi), r.pdf);
      writeFileSync(join(ornek, 'genel-a4.html'), (await hazirla(genelGirdi(f))).html);
    }
  });
});

test('içe aktarma: rapor verileri yeni projeye ve mevcut projeye (öğe / ekip eşlemesiyle) aktarılır; tekrar aktarmada kopya olmaz', async () => {
  const kaynakParola = `Kaynak-${randomBytes(6).toString('hex')}`;
  const a = await veritabaniniHazirla(null);
  await kasaOlustur(a, kaynakParola, { kdf: HIZLI_KDF });
  const hedefParola = `Hedef-${randomBytes(6).toString('hex')}`;
  const bvt = await veritabaniniHazirla(null);
  await kasaOlustur(bvt, hedefParola, { kdf: HIZLI_KDF });
  try {
    const ap = projeKaydet(a, { ad: 'Kaynak' });
    const ae = ekranKaydet(a, { projeId: ap, anahtar: 'basvuru', ad: 'Başvuru' });
    const as = servisKaydet(a, { projeId: ap, anahtar: 'kayit', ad: 'Kayıt', tur: 'rest' });
    const ass = servisSenaryosuKaydet(a, { projeId: ap, servisId: as, baslik: 'Kayıt oluştur', icerik: { operasyon: 'kayit', govde: '{}', kontroller: [], http: { metot: 'POST', yol: '/kayit' } } });
    const aa = servisAkisiKaydet(a, { projeId: ap, baslik: 'Akış', icerik: { adimlar: [{ ad: 'Oluştur', servisId: as, senaryoId: ass }] } });
    const ekip = ekipKaydet(a, { projeId: ap, ad: 'Kayıt ekibi' });
    raporIsaretiKaydet(a, { projeId: ap, ogeTuru: 'ekran', ogeId: ae, kritik: true, ekipId: ekip, sureEsigiMs: 900 });
    raporIsaretiKaydet(a, { projeId: ap, ogeTuru: 'servis', ogeId: as, metotEsikleri: { 'POST /kayit': 300 } });
    raporIsaretiKaydet(a, { projeId: ap, ogeTuru: 'akis', ogeId: aa, kritik: true });

    // 1) Yeni proje olarak: satırlar gelir, metot eşikleri hedef kasanın anahtarıyla okunur.
    const h1 = await iceAktarmaHazirla(bvt, yedekOlustur(a).veri, kaynakParola);
    iceAktarmaUygula(bvt, h1, { tumu: true }, { yapan: 'birim-test' });
    expect(ekipleriListele(bvt, ap).map((x) => x.ad)).toEqual(['Kayıt ekibi']);
    const rv = raporVerileriniOku(bvt, ap);
    expect([...rv.kritik].sort()).toEqual([`akis:${aa}`, `ekran:${ae}`].sort());
    expect(rv.esik.get(`servis:${as}`)).toEqual({ ms: null, metotlar: { 'POST /kayit': 300 } });
    expect(rv.ekip.get(`ekran:${ae}`)).toBe('Kayıt ekibi');

    // 2) Mevcut projeye: yerelde aynı anahtarlı ekran (farklı kimlik) ve aynı adlı ekip → işaret yerel ekrana ve ekibe bağlanır.
    const cp = projeKaydet(bvt, { ad: 'Yerel' });
    const ce = ekranKaydet(bvt, { projeId: cp, anahtar: 'basvuru', ad: 'Başvuru (yerel)' });
    const cekip = ekipKaydet(bvt, { projeId: cp, ad: 'Kayıt ekibi' });
    const esleme = { projeler: { [ap]: { hedef: cp } } };
    for (let tekrar = 0; tekrar < 2; tekrar++) {
      const h = await iceAktarmaHazirla(bvt, yedekOlustur(a).veri, kaynakParola);
      iceAktarmaUygula(bvt, h, { tumu: true, esleme }, { yapan: 'birim-test' });
      const liste = raporIsaretleriniListele(bvt, cp);
      expect(liste.filter((x) => x.ogeTuru === 'ekran')).toEqual([{ ogeTuru: 'ekran', ogeId: ce, kritik: true, ekipId: cekip, sureEsigiMs: 900, metotEsikleri: {} }]);
      expect(liste).toHaveLength(3);
      expect(ekipleriListele(bvt, cp)).toEqual([{ id: cekip, ad: 'Kayıt ekibi' }]);
      expect(say(bvt, 'SELECT COUNT(*) AS n FROM rapor_isaretleri WHERE proje_id = ? AND oge_id = ?', [cp, ae])).toBe(0);
    }
  } finally { a.kapat(); bvt.kapat(); }
});

test('proje silme: önizlemede ekip ve rapor işareti sayıları; silince rapor verileri kalmaz', async () => {
  const { vt, f } = await genelKur();
  try {
    a4VeriKur(vt, f, { surumler: false });
    const o = projeSilmeOnizlemesi(vt, f.projeId);
    expect(o.sayilar).toMatchObject({ ekip: 2, raporIsareti: 4 });
    // Başka projenin rapor verisi korunur.
    const baskaEkip = ekipKaydet(vt, { projeId: f.baskaProjeId, ad: 'Başka ekip' });
    const r = projeyiSil(vt, f.projeId, { medyaKlasoru: medya, yapan: 'birim-test' });
    expect(r.silinen).toMatchObject({ ekip: 2, raporIsareti: 4 });
    expect(projeKalintilari(vt, f.projeId)).toEqual({});
    expect(say(vt, 'SELECT COUNT(*) AS n FROM rapor_isaretleri')).toBe(0);
    expect(ekipleriListele(vt, f.baskaProjeId)).toEqual([{ id: baskaEkip, ad: 'Başka ekip' }]);
  } finally { vt.kapat(); }
});

