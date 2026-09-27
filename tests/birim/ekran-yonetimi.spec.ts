// KORUMA TESTLERİ — Ekranlar > ⋯ (ekran yönetimi; scripts/platform/ekranlar/ekran-yonetimi.mjs):
//   yeniden adlandır (anahtar sabit, geçmiş), düzenle (URL yolu → yeni model sürümü), sıralama, devre dışı bırak /
//   etkinleştir (Senaryolar listesi, toplu koşu reddi, ▷ tek başına çalışır), silme önizlemesi sayıları, kalıcı sil
//   (sonuçlar korunur → mezar taşı; sonuçlar da silinir → satır tamamen gider; sonucu olmayan ekran → mezar taşı kalmaz)
//   ve geri yükleme.
// Veri: GEÇİCİ veritabanı; nötr proje (örnek başvuru modeli — model-fikstur.ts) depo fonksiyonlarıyla kurulur.
// Tarayıcı açmaz, siteye bağlanmaz.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, medyaAnahtariniHazirla } from '../../scripts/platform/kasa.mjs';
import { medyaSifrele } from '../../scripts/platform/medya.mjs';
import {
  ekranKaydet, ekranModeliEkle, ekranModeliGetir, ekranlariListele, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet, sonucOzeti } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { senaryoListesi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { calistirmaIsteginiHazirla } from '../../scripts/platform/senaryolar/calistirma.mjs';
import {
  ekranDurumunuAyarla, ekranDuzenle, ekranGeriYukle, ekranlariSirala, ekranSil, ekranSilmeOnizlemesi, ekranYenidenAdlandir, urlYoluDogrula
} from '../../scripts/platform/ekranlar/ekran-yonetimi.mjs';
import { ekranListesi } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { ornekBasvuruModeli } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA = 'Ekran-Yonetimi-Kasa-Parolasi-5';
const BASVURU = 'Örnek Başvuru';
const MUSTERI = 'Müşteri Kaydı';

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; medya: string; temizle: () => void };

/** Nötr proje: model senaryolu başvuru ekranı (2 senaryo), modelsiz müşteri ekranı (1 senaryo), alt model, modelsiz liste. */
async function kur(): Promise<Ortam> {
  const k = geciciKlasor('ekran-yonetimi');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true });
  const ekran = (anahtar: string, ad: string, model?: Record<string, unknown>) => {
    const id = ekranKaydet(vt, { projeId, anahtar, ad });
    if (model) ekranModeliEkle(vt, { ekranId: id, model });
    return id;
  };
  const basvuru = ekran('ornek-basvuru', BASVURU, ornekBasvuruModeli());
  const musteri = ekran('musteri-kaydi', MUSTERI);
  ekran('adres-alt', 'Adres Alt Modeli', { semaSurumu: 2, tur: 'altModel', id: 'adres-alt', ad: 'Adres', bolumler: [] });
  ekran('urun-listesi', 'Ürün Listesi');
  const senaryo = (ekranId: string, baslik: string) => senaryoKaydet(vt, {
    projeId, ekranId, baslik, icerik: { kosucu: 'model', ortamlar: { [ortamId]: {} }, veri: { baslik } }
  });
  senaryo(basvuru, 'Ürün A başvurusu');
  senaryo(basvuru, 'Ürün B başvurusu');
  senaryo(musteri, 'Yeni müşteri');
  return { vt, projeId, ortamId, medya: join(k.yol, 'medya'), temizle: () => { vt.kapat(); k.temizle(); } };
}

const ekranBul = (o: Ortam, anahtar: string) => {
  const e = ekranlariListele(o.vt, o.projeId, { silinenlerDahil: true }).find((x) => x.anahtar === anahtar);
  if (!e) throw new Error(`${anahtar} yok`);
  return e;
};
const senaryolar = (o: Ortam, ekranId: string) => o.vt.tumu('SELECT id, baslik FROM senaryolar WHERE ekran_id = ? ORDER BY baslik', [ekranId]).map((s) => ({ id: String(s.id), baslik: String(s.baslik) }));
const gecmis = (o: Ortam, id: string) => o.vt.tumu("SELECT islem, aciklama FROM degisiklik_gecmisi WHERE varlik_turu = 'ekran' AND varlik_id = ? ORDER BY rowid", [id]);

/** Şifreli medyalı bir sonuç (ekranın senaryosu için). */
async function sonucEkle(o: Ortam, senaryoId: string, kosuId: string) {
  const anahtar = medyaAnahtariniHazirla(o.vt);
  const { dosya, boyut } = await medyaSifrele(anahtar, o.medya, Buffer.from('sahte ekran görüntüsü'));
  anahtar.fill(0);
  kosuKaydet(o.vt, { id: kosuId, projeId: o.projeId, ortamId: o.ortamId, tur: 'tekil' });
  sonucKaydet(o.vt, {
    kosuId, projeId: o.projeId, senaryoId, senaryoBaslik: 'x', durum: 'basarisiz', hataMesaji: 'sahte hata',
    adimlar: [{ ad: 'adım', durum: 'basarisiz' }], medya: [{ tur: 'ekran_goruntusu', ad: 'g', icerikTuru: 'image/png', boyut, dosya }]
  });
  return dosya;
}

test.describe('Ekran yönetimi — ad, yol, sıra, durum', () => {
  test('yeniden adlandır: anahtar ve senaryo bağları sabit; çakışan ad reddedilir; geçmişe yazılır', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      const onceki = senaryolar(o, b.id);
      expect(onceki.length).toBe(2);
      expect(() => ekranYenidenAdlandir(o.vt, o.projeId, b.id, { ad: '  ' })).toThrow(/boş olamaz/);
      expect(() => ekranYenidenAdlandir(o.vt, o.projeId, b.id, { ad: 'müşteri  kaydı' })).toThrow(/başka bir ekran var/);
      const r = ekranYenidenAdlandir(o.vt, o.projeId, b.id, { ad: '  Başvuru   Ekranı ', aciklama: 'Açıklama' });
      expect(r).toEqual({ degisti: true, ad: 'Başvuru Ekranı', aciklama: 'Açıklama' });
      expect(ekranBul(o, 'ornek-basvuru')).toMatchObject({ id: b.id, anahtar: 'ornek-basvuru', ad: 'Başvuru Ekranı', aciklama: 'Açıklama' });
      expect(senaryolar(o, b.id)).toEqual(onceki);
      expect(gecmis(o, b.id)).toEqual([{ islem: 'guncelle', aciklama: `Yeniden adlandırıldı: "${BASVURU}" → "Başvuru Ekranı"` }]);
      expect(ekranYenidenAdlandir(o.vt, o.projeId, b.id, { ad: 'Başvuru Ekranı', aciklama: 'Açıklama' }).degisti).toBe(false);
    } finally { o.temizle(); }
  });

  test('düzenle: URL yolu doğrulanır ve yalnızca ekranUrl değişen yeni model sürümü oluşur; modelsiz / alt modelde reddedilir', async () => {
    const o = await kur();
    try {
      for (const kotu of ['', 'satis', 'https://ornek.invalid/x', '//ornek.invalid/x', '/a b', '/a\\b']) expect(() => urlYoluDogrula(kotu)).toThrow();
      expect(urlYoluDogrula(' /satis/odeme/ ')).toBe('/satis/odeme/');
      const b = ekranBul(o, 'ornek-basvuru');
      const v1 = ekranModeliGetir(o.vt, b.id);
      const r = ekranDuzenle(o.vt, o.projeId, b.id, { urlYolu: '/yeni/basvuru/' });
      expect(r).toMatchObject({ degisti: true, surum: (v1?.surum ?? 0) + 1, urlYolu: '/yeni/basvuru/' });
      const v2 = ekranModeliGetir(o.vt, b.id);
      expect({ ...v2?.model, ekranUrl: v1?.model.ekranUrl }).toEqual(v1?.model);
      expect(v2?.model.ekranUrl).toBe('/yeni/basvuru/');
      expect(ekranDuzenle(o.vt, o.projeId, b.id, { urlYolu: '/yeni/basvuru/' }).degisti).toBe(false);
      expect(() => ekranDuzenle(o.vt, o.projeId, ekranBul(o, 'musteri-kaydi').id, { urlYolu: '/x/' })).toThrow(/modeli yok/);
      expect(() => ekranDuzenle(o.vt, o.projeId, ekranBul(o, 'adres-alt').id, { urlYolu: '/x/' })).toThrow(/Alt modellerin/);
    } finally { o.temizle(); }
  });

  test('sıralama: tüm ekranlar istenen sırada; eksik/bilinmeyen kimlik reddedilir', async () => {
    const o = await kur();
    try {
      const idler = ekranlariListele(o.vt, o.projeId).map((e) => e.id);
      expect(() => ekranlariSirala(o.vt, o.projeId, idler.slice(1))).toThrow(/tüm ekranların/);
      expect(() => ekranlariSirala(o.vt, o.projeId, [...idler.slice(1), 'yok'])).toThrow(/bilinmeyen/);
      const ters = idler.slice().reverse();
      expect(ekranlariSirala(o.vt, o.projeId, ters).degisti).toBe(true);
      expect(ekranlariListele(o.vt, o.projeId).map((e) => e.id)).toEqual(ters);
      expect(ekranListesi(o.vt, o.projeId).ekranlar.map((e) => e.id)).toEqual(ters);
    } finally { o.temizle(); }
  });

  test('devre dışı: Senaryolar\'da işaretli, toplu koşu reddedilir (▷ tek başına çalışır); etkinleştirince geri döner', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      const m = ekranBul(o, 'musteri-kaydi');
      const senaryoId = senaryolar(o, b.id)[0].id;
      const govde = { projeId: o.projeId, ortamId: o.ortamId, senaryoId, kosuId: 'k1', kosuTuru: 'tam', kosuKimligi: 'toplu-1' };
      expect(() => calistirmaIsteginiHazirla(o.vt, govde)).not.toThrow();

      expect(ekranDurumunuAyarla(o.vt, o.projeId, b.id, false)).toEqual({ durum: 'devre_disi', degisti: true });
      expect(ekranDurumunuAyarla(o.vt, o.projeId, b.id, false).degisti).toBe(false);
      const liste = senaryoListesi(o.vt, o.projeId, o.ortamId);
      expect(liste.ekranlar.find((e) => e.id === b.id)?.durum).toBe('devre_disi');
      expect(liste.senaryolar.filter((s) => s.ekranId === b.id).map((s) => s.ekranEtkin)).toEqual([false, false]);
      expect(liste.senaryolar.filter((s) => s.ekranId === m.id).every((s) => s.ekranEtkin)).toBe(true);
      expect(() => calistirmaIsteginiHazirla(o.vt, govde)).toThrow(/devre dışı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { ...govde, kosuTuru: 'tekil' })).toThrow(/devre dışı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { ...govde, tekBasina: true })).toThrow(/devre dışı/);
      const tek = calistirmaIsteginiHazirla(o.vt, { ...govde, kosuTuru: 'tekil', tekBasina: true });
      expect(tek.hedef).toMatchObject({ senaryoId, model: true, genel: { projeId: o.projeId, ortamId: o.ortamId } });

      expect(ekranDurumunuAyarla(o.vt, o.projeId, b.id, true).durum).toBe('etkin');
      expect(() => calistirmaIsteginiHazirla(o.vt, govde)).not.toThrow();
      expect(gecmis(o, b.id).map((g) => g.aciklama)).toEqual(['Devre dışı bırakıldı (senaryoları koşulara girmez)', 'Etkinleştirildi']);
    } finally { o.temizle(); }
  });
});

test.describe('Ekran yönetimi — kalıcı sil', () => {
  test('önizleme sayıları; onay adı; sonuç yoksa mezar taşı kalmaz (satır tamamen silinir)', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      ekranDuzenle(o.vt, o.projeId, b.id, { urlYolu: '/ikinci/' });
      const on = ekranSilmeOnizlemesi(o.vt, o.projeId, b.id);
      expect(on).toEqual({
        ekran: { id: b.id, ad: BASVURU, anahtar: 'ornek-basvuru', durum: 'etkin' },
        sayilar: { modelSurumu: 2, senaryo: 2, sonuc: 0, medya: 0, sonucMedyasi: 0, ekranMedyasi: 0 }
      });
      expect(() => ekranSil(o.vt, o.projeId, b.id, { onayAdi: 'örnek başvuru', medyaKlasoru: o.medya })).toThrow(/adını aynen/);
      const r = ekranSil(o.vt, o.projeId, b.id, { onayAdi: ` ${BASVURU} `, medyaKlasoru: o.medya });
      expect(r).toEqual({ tamamenSilindi: true, mezarTasi: false, korunanSonuc: 0, silinen: { modelSurumu: 2, senaryo: 2, sonuc: 0, kosu: 0, medya: 0, medyaDosyasi: 0 } });
      expect(o.vt.tek('SELECT id FROM ekranlar WHERE id = ?', [b.id])).toBeUndefined();
      expect(o.vt.tek('SELECT COUNT(*) AS n FROM ekran_modelleri WHERE ekran_id = ?', [b.id])?.n).toBe(0);
      expect(senaryolar(o, b.id)).toEqual([]);
      expect(ekranListesi(o.vt, o.projeId).silinmisEkranlar).toEqual([]);
      expect(gecmis(o, b.id).at(-1)).toMatchObject({ islem: 'sil' });
      // Diğer ekranlara dokunulmadı.
      expect(senaryolar(o, ekranBul(o, 'musteri-kaydi').id).length).toBe(1);
    } finally { o.temizle(); }
  });

  test('sonuçlar korunur → mezar taşı (senaryolar/modeller gider, geçmiş kalır); sonra sonuçlar da silinince satır tamamen gider', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      const ids = senaryolar(o, b.id).map((s) => s.id);
      const medyaDosyasi = await sonucEkle(o, ids[0], 'kosu-1');
      const onizleme = ekranSilmeOnizlemesi(o.vt, o.projeId, b.id);
      expect(onizleme.sayilar).toMatchObject({ modelSurumu: 1, senaryo: 2, sonuc: 1, sonucMedyasi: 1, medya: 1 });

      const r = ekranSil(o.vt, o.projeId, b.id, { onayAdi: BASVURU, medyaKlasoru: o.medya });
      expect(r).toMatchObject({ tamamenSilindi: false, mezarTasi: true, korunanSonuc: 1, silinen: { senaryo: 2, sonuc: 0, modelSurumu: 1 } });
      expect(existsSync(join(o.medya, medyaDosyasi))).toBe(true);
      expect(senaryolar(o, b.id)).toEqual([]);
      expect(o.vt.tek('SELECT COUNT(*) AS n FROM ekran_modelleri WHERE ekran_id = ?', [b.id])?.n).toBe(0);
      // Senaryoların değişiklik geçmişi korunur.
      expect(o.vt.tumu("SELECT islem FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id = ? ORDER BY rowid", [ids[0]]).map((g) => g.islem)).toContain('sil');
      expect(gecmis(o, b.id).at(-1)).toMatchObject({ islem: 'sil' });
      // Listelerden çıkar; silinmiş ekranlar bölümünde görünür; Sonuçlar "silinmiş ekran" der.
      expect(ekranlariListele(o.vt, o.projeId).some((e) => e.id === b.id)).toBe(false);
      expect(ekranListesi(o.vt, o.projeId).silinmisEkranlar).toEqual([expect.objectContaining({ id: b.id, anahtar: 'ornek-basvuru', ad: BASVURU, sonucSayisi: 1 })]);
      expect(sonucOzeti(o.vt, o.projeId).ekranlar.find((e) => e.anahtar === b.id)?.ekranDurumu).toBe('silindi');
      // Silinmiş ekranın durumu değiştirilemez, yeniden adlandırılamaz.
      expect(() => ekranDurumunuAyarla(o.vt, o.projeId, b.id, false)).toThrow(/bulunamadı/);
      expect(() => ekranYenidenAdlandir(o.vt, o.projeId, b.id, { ad: 'Yeni' })).toThrow(/bulunamadı/);

      // Mezar taşının önizlemesi ve temizliği: sonuçlar da silinir → satır tamamen gider; medya güvenle silinir.
      expect(ekranSilmeOnizlemesi(o.vt, o.projeId, b.id)).toMatchObject({ ekran: { durum: 'silindi' }, sayilar: { modelSurumu: 0, senaryo: 0, sonuc: 1, sonucMedyasi: 1 } });
      const t = ekranSil(o.vt, o.projeId, b.id, { onayAdi: BASVURU, sonuclariSil: true, medyaKlasoru: o.medya });
      expect(t).toMatchObject({ tamamenSilindi: true, mezarTasi: false, korunanSonuc: 0, silinen: { sonuc: 1, kosu: 1, medya: 1, medyaDosyasi: 1 } });
      expect(existsSync(join(o.medya, medyaDosyasi))).toBe(false);
      expect(o.vt.tek('SELECT COUNT(*) AS n FROM kosu_sonuclari')?.n).toBe(0);
      expect(o.vt.tek('SELECT id FROM ekranlar WHERE id = ?', [b.id])).toBeUndefined();
      expect(ekranListesi(o.vt, o.projeId).silinmisEkranlar).toEqual([]);
    } finally { o.temizle(); }
  });

  test('sonuçlarla birlikte ilk seferde sil: mezar taşı kalmaz, başka ekranın sonucu korunur', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      const m = ekranBul(o, 'musteri-kaydi');
      const bDosya = await sonucEkle(o, senaryolar(o, b.id)[0].id, 'kosu-b');
      const mDosya = await sonucEkle(o, senaryolar(o, m.id)[0].id, 'kosu-m');
      const r = ekranSil(o.vt, o.projeId, b.id, { onayAdi: BASVURU, sonuclariSil: true, medyaKlasoru: o.medya });
      expect(r).toMatchObject({ tamamenSilindi: true, korunanSonuc: 0, silinen: { senaryo: 2, sonuc: 1, kosu: 1, medyaDosyasi: 1 } });
      expect(existsSync(join(o.medya, bDosya))).toBe(false);
      expect(existsSync(join(o.medya, mDosya))).toBe(true);
      expect(o.vt.tumu('SELECT kosu_id FROM kosu_sonuclari').map((x) => x.kosu_id)).toEqual(['kosu-m']);
    } finally { o.temizle(); }
  });

  test('geri yükle: mezar taşı etkin (boş) ekran olur; ad çakışırsa reddedilir; silinmemiş ekran geri yüklenemez', async () => {
    const o = await kur();
    try {
      const b = ekranBul(o, 'ornek-basvuru');
      await sonucEkle(o, senaryolar(o, b.id)[0].id, 'kosu-1');
      expect(() => ekranGeriYukle(o.vt, o.projeId, b.id)).toThrow(/silinmiş değil/);
      ekranSil(o.vt, o.projeId, b.id, { onayAdi: BASVURU, medyaKlasoru: o.medya });
      const liste = ekranBul(o, 'urun-listesi');
      ekranYenidenAdlandir(o.vt, o.projeId, liste.id, { ad: BASVURU });
      expect(() => ekranGeriYukle(o.vt, o.projeId, b.id)).toThrow(/etkin bir ekran var/);
      ekranYenidenAdlandir(o.vt, o.projeId, liste.id, { ad: 'Ürün Listesi' });
      expect(ekranGeriYukle(o.vt, o.projeId, b.id)).toEqual({ durum: 'etkin' });
      expect(ekranBul(o, 'ornek-basvuru')).toMatchObject({ durum: 'etkin' });
      expect(ekranModeliGetir(o.vt, b.id)).toBeUndefined();
      expect(senaryolar(o, b.id)).toEqual([]);
      expect(ekranListesi(o.vt, o.projeId).silinmisEkranlar).toEqual([]);
      expect(o.vt.tek('SELECT silinme_json FROM ekranlar WHERE id = ?', [b.id])?.silinme_json).toBeNull();
      expect(gecmis(o, b.id).map((g) => g.islem)).toEqual(['sil', 'guncelle']);
    } finally { o.temizle(); }
  });
});
