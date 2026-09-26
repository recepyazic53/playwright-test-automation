// KODLU SENARYOLARI AKIŞA TAŞIMA (scripts/platform/senaryolar/akis-tasima.mjs + projeler/galaksi/akis-tasima.mjs): örnek
// eski dosyalar (SAHTE veri) aktarılır, ödeme ortak akışı ve "JetDASK (akış)" paketi yüklenir; kodlu JetDASK matrisinden
// (3 kimlik tipi × 2 sıfat) taslaklar önizlenir (senaryo kaydıyla aynı doğrulama, hiçbir şey yazılmaz), seçilenler yazılır,
// tekrar önizlemede "zaten var" olur. Veritabanı geçicidir; şirket sitesine istek yoktur.
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranlariListele, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { senaryoDetayi, senaryoGecmisiniSil } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { akisTasimaOnizle, akisTasimaUygula } from '../../scripts/platform/senaryolar/akis-tasima.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import { jetDaskAkisPaketi } from '../../projeler/galaksi/jetdask-akis.mjs';
import { odemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Akis-Tasima-Kasa-Parolasi-7';

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; medya: string; temizle: () => void };

async function kur(): Promise<Ortam> {
  const k = geciciKlasor('akis-tasima');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const adaptor = adaptorBul('galaksi');
  if (!adaptor) throw new Error('galaksi adaptörü yok');
  const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
  const { projeId } = aktarimiUygula(vt, paket);
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  return { vt, projeId, ortamId, medya: join(k.yol, 'medya'), temizle: () => { vt.kapat(); k.temizle(); } };
}

test('JetDASK: kodlu matris (3 kimlik × 2 sıfat) önizlenir, yazılır; tekrar önizlemede "zaten var"; ürün verisi olmayan ekranda açık hata', async () => {
  const o = await kur();
  try {
    const adaptor = adaptorBul('galaksi') ?? null;
    const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: o.medya };
    await sayfaEkle(o.vt, o.projeId, odemeAkisPaketi(), secenek);
    await sayfaEkle(o.vt, o.projeId, jetDaskAkisPaketi({ odeme: true }), secenek);
    const ekran = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'jet-dask-akis');
    if (!ekran) throw new Error('jet-dask-akis yok');
    expect(adaptor?.akisTasimaEkranlari?.()).toContain('jet-dask-akis');

    const on = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, adaptor);
    expect(on.kaynakEkran).toBe('JetDASK');
    expect(on.taslaklar.map((x) => x.baslik)).toEqual([
      'Sigortalı Özel / Sigorta Ettiren Sıfatı Mal Sahibi / Yeni İş Testi', 'Sigortalı Özel / Sigorta Ettiren Sıfatı Kiracı / Yeni İş Testi',
      'Sigortalı Tüzel / Sigorta Ettiren Sıfatı Mal Sahibi / Yeni İş Testi', 'Sigortalı Tüzel / Sigorta Ettiren Sıfatı Kiracı / Yeni İş Testi',
      'Sigortalı Pasaport / Sigorta Ettiren Sıfatı Mal Sahibi / Yeni İş Testi', 'Sigortalı Pasaport / Sigorta Ettiren Sıfatı Kiracı / Yeni İş Testi'
    ]);
    expect(on.taslaklar.map((x) => [x.durum, x.hatalar])).toEqual(on.taslaklar.map(() => ['yeni', []]));
    expect(on.taslaklar[1].veri).toMatchObject({ sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaEttirenSifati: '2', adresKodu: '1000000001', bulunduguKat: '3', odemeAdimiDahil: true });
    expect(on.notlar.join(' ')).toContain('Bulunduğu kat');
    expect(on.notlar.join(' ')).toContain('Kodlu testin kabul ettiği ödeme sonuçları');
    // Önizleme hiçbir şey yazmaz.
    expect(o.vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [ekran.id])?.n).toBe(0);

    const y = akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, adaptor, on.taslaklar.slice(0, 4).map((x) => x.baslik));
    expect(y).toEqual({ eklenen: 4, atlanan: 0 });
    const kayitlar = o.vt.tumu('SELECT id, baslik FROM senaryolar WHERE ekran_id = ?', [ekran.id]);
    expect(kayitlar).toHaveLength(4);
    const d = senaryoDetayi(o.vt, String(kayitlar[0].id), o.ortamId);
    expect(d).toMatchObject({ kosuyaDahil: false, ortamlar: [o.ortamId] });
    expect(d.veri).toMatchObject({ sigortaliTipi: 'ozel', adresKodu: '1000000001' });

    const tekrar = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, adaptor);
    expect(tekrar.taslaklar.map((x) => x.durum)).toEqual(['var', 'var', 'var', 'var', 'yeni', 'yeni']);
    // "var" olan seçilse de yazılmaz.
    expect(akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, adaptor, [tekrar.taslaklar[0].baslik])).toEqual({ eklenen: 0, atlanan: 1 });
    expect(() => akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, adaptor, [])).toThrow(/En az bir senaryo/);

    // Taşıması tanımlı olmayan ekran: açık hata.
    const odeme = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'odeme-kredi-karti-akis');
    expect(() => akisTasimaOnizle(o.vt, o.projeId, String(odeme?.id), o.ortamId, adaptor)).toThrow(/taşıması tanımlı değil/);
  } finally {
    o.temizle();
  }
});

test('senaryo geçmişini sil: onaysız yalnızca sayar; onayla seçilen senaryoların geçmişi silinir, senaryolar ve diğerlerinin geçmişi kalır', async () => {
  const o = await kur();
  try {
    const adaptor = adaptorBul('galaksi') ?? null;
    const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: o.medya };
    await sayfaEkle(o.vt, o.projeId, odemeAkisPaketi(), secenek);
    await sayfaEkle(o.vt, o.projeId, jetDaskAkisPaketi({ odeme: true }), secenek);
    const ekran = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'jet-dask-akis');
    if (!ekran) throw new Error('jet-dask-akis yok');
    const on = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, adaptor);
    akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, adaptor, on.taslaklar.map((x) => x.baslik));
    const idler = o.vt.tumu('SELECT id FROM senaryolar WHERE ekran_id = ? ORDER BY baslik', [ekran.id]).map((s) => String(s.id));
    const gecmis = (id: string) => Number(o.vt.tek("SELECT COUNT(*) AS n FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id = ?", [id])?.n);
    expect(idler.every((id) => gecmis(id) >= 1)).toBe(true);
    const secilen = idler.slice(0, 2);
    expect(senaryoGecmisiniSil(o.vt, o.projeId, secilen)).toEqual({ senaryo: 2, kayit: 2, silindi: false });
    expect(gecmis(secilen[0])).toBe(1);
    expect(senaryoGecmisiniSil(o.vt, o.projeId, secilen, { onay: true })).toEqual({ senaryo: 2, kayit: 2, silindi: true });
    expect(secilen.map(gecmis)).toEqual([0, 0]);
    expect(gecmis(idler[2])).toBe(1);
    expect(o.vt.tumu('SELECT id FROM senaryolar WHERE ekran_id = ?', [ekran.id])).toHaveLength(6);
    expect(() => senaryoGecmisiniSil(o.vt, o.projeId, ['00000000-0000-4000-8000-000000000000'], { onay: true })).toThrow(/bulunamadı/);
  } finally {
    o.temizle();
  }
});
