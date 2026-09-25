// KODLU SENARYOLARI AKIŞA TAŞIMA — JetSağlık ve JetKOBİ taşıyıcıları (projeler/galaksi/tasima-saglik-kobi.mjs). Örnek eski
// dosyalar (SAHTE veri) aktarılır, ödeme ortak akışı + akış paketi yüklenir; kodlu matristen taslaklar önizlenir (senaryo
// kaydıyla aynı doğrulama), seçilenler yazılır. Taşıyıcılar henüz adaptöre kayıtlı değil: adaptörü saran bir nesneyle verilir.
// Veritabanı geçicidir; şirket sitesine istek yoktur.
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranlariListele, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { senaryoDetayi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { akisTasimaOnizle, akisTasimaUygula } from '../../scripts/platform/senaryolar/akis-tasima.mjs';
import { adaptorBul, type AktarimAdaptoru } from '../../projeler/index.mjs';
import { jetSaglikAkisPaketi } from '../../projeler/galaksi/jetsaglik-akis.mjs';
import { jetKobiAkisPaketi } from '../../projeler/galaksi/jetkobi-akis.mjs';
import { dogrudanKartOdemeAkisPaketi, teklifKaydetOdemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Akis-Tasima-Kasa-Parolasi-8';

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; medya: string; adaptor: AktarimAdaptoru; temizle: () => void };

async function kur(): Promise<Ortam> {
  const k = geciciKlasor('akis-tasima-saglik-kobi');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const galaksi = adaptorBul('galaksi');
  if (!galaksi) throw new Error('galaksi adaptörü yok');
  const paket = await galaksi.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
  const { projeId } = aktarimiUygula(vt, paket);
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  // Taşıyıcılar Galaksi adaptörüne kayıtlı (projeler/galaksi/akis-tasima.mjs > AKIS_TASIYICILARI).
  const adaptor: AktarimAdaptoru = galaksi;
  return { vt, projeId, ortamId, medya: join(k.yol, 'medya'), adaptor, temizle: () => { vt.kapat(); k.temizle(); } };
}

const SAGLIK_BASLIKLARI = ['Yabancı Kimlik', 'Pasaport'].flatMap((s) =>
  ['Kendisi', 'Farklı Özel', 'Farklı Tüzel', 'Pasaport'].map((e) => `Sigortalı ${s} / Sigorta Ettiren ${e} / Yeni İş Testi`));

async function saglikEkrani(o: Ortam): Promise<string> {
  const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: o.medya };
  await sayfaEkle(o.vt, o.projeId, dogrudanKartOdemeAkisPaketi(), secenek);
  await sayfaEkle(o.vt, o.projeId, jetSaglikAkisPaketi({ odeme: true }), secenek);
  const ekran = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'jet-saglik-akis');
  if (!ekran) throw new Error('jet-saglik-akis yok');
  return ekran.id;
}

test('JetSağlık: kodlu matris (2 sigortalı × 4 ettiren) önizlenir, hepsi geçerli; yazılır (indirim oranı 0)', async () => {
  const o = await kur();
  try {
    const ekran = { id: await saglikEkrani(o) };
    const on = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor);
    expect(on.kaynakEkran).toBe('JetSağlık');
    const basliklar = SAGLIK_BASLIKLARI;
    expect(on.taslaklar.map((x) => x.baslik)).toEqual(basliklar);
    expect(on.taslaklar.map((x) => [x.baslik, x.durum, x.hatalar])).toEqual(on.taslaklar.map((x) => [x.baslik, 'yeni', []]));
    const ortakBeklenen = { policeSuresi: '1', hastalik: 'H', kvkkOnayi: 'E', yenileme: 'H', indirimOrani: '0', odemeAdimiDahil: true };
    expect(on.taslaklar[0].veri).toEqual({ sigortaliTipi: 'yabanciKimlik', sigortaliProfili: 'ybn1', farkliMusteri: 'kendisi', ...ortakBeklenen });
    expect(on.taslaklar[1].veri).toMatchObject({ farkliMusteri: 'farkli', musteriTipi: 'ozel', ettirenProfili: 'tc3' });
    expect(on.taslaklar[2].veri).toMatchObject({ musteriTipi: 'tuzel', ettirenProfili: 'vkn1' });
    expect(on.taslaklar[7].veri).toMatchObject({ sigortaliTipi: 'pasaport', sigortaliProfili: 'pasaport1', sigortaliAdresProfili: 'adres1', musteriTipi: 'pasaport', ettirenProfili: 'pasaport1' });
    expect(on.notlar.join(' ')).toContain('Kodlu testin kabul ettiği ödeme sonuçları');
    expect(o.vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [ekran.id])?.n).toBe(0);

    const y = akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor, basliklar);
    expect(y).toEqual({ eklenen: 8, atlanan: 0 });
    const kayit = o.vt.tek('SELECT id FROM senaryolar WHERE ekran_id = ? AND baslik = ?', [ekran.id, basliklar[7]]);
    const d = senaryoDetayi(o.vt, String(kayit?.id), o.ortamId);
    expect(d).toMatchObject({ kosuyaDahil: false, ortamlar: [o.ortamId] });
    expect(d.veri).toMatchObject({ sigortaliProfili: 'pasaport1', sigortaliAdresProfili: 'adres1', ettirenProfili: 'pasaport1', policeSuresi: '1', odemeAdimiDahil: true });
    expect(akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor).taslaklar.every((x) => x.durum === 'var')).toBe(true);
  } finally {
    o.temizle();
  }
});

test('JetKOBİ: kodlu matris (2 sigortalı × 3 ettiren × 2 durum) önizlenir, hepsi geçerli; yazılır', async () => {
  const o = await kur();
  try {
    const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: o.medya };
    await sayfaEkle(o.vt, o.projeId, teklifKaydetOdemeAkisPaketi(), secenek);
    await sayfaEkle(o.vt, o.projeId, jetKobiAkisPaketi({ odeme: true }), secenek);
    const ekran = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'jet-kobi-akis');
    if (!ekran) throw new Error('jet-kobi-akis yok');

    const on = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor);
    expect(on.kaynakEkran).toBe('JetKOBİ');
    const basliklar: string[] = [];
    for (const s of ['Özel', 'Tüzel']) {
      for (const e of ['Aynı', 'Farklı Özel', 'Farklı Tüzel']) {
        for (const d of ['Mal Sahibi', 'Kiracı']) basliklar.push(`Sigortalı ${s} / Sigorta Ettiren ${e} / Sigortalı Durumu ${d} Testi`);
      }
    }
    expect(on.taslaklar.map((x) => x.baslik)).toEqual(basliklar);
    expect(on.taslaklar.map((x) => [x.baslik, x.durum, x.hatalar])).toEqual(on.taslaklar.map((x) => [x.baslik, 'yeni', []]));
    expect(on.taslaklar[0].veri).toMatchObject({
      sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaliTelefonKodu: '555', sigortaliTelefonNo: '0000001', sigortaEttiren: 'ayni',
      sigortaliDurumu: 'malSahibi', binaTipi: 'BÜRO BİNASI', brutYuzolcum: '100', daskaBagli: 'hayir', adresKodu: '1000000002', dainiMurtehin: 'yok',
      isciSayisi: '1', istigalCinsi: 'SİGORTA ACENTELİĞİ', ferdiKazaTeminati: '50000', binaYangin: '3000000', yanginVeGuvenlikOnlemleri: 'Yangın tüpü ve alarm',
      odemeAdimiDahil: true
    });
    expect(on.taslaklar[1].veri).not.toHaveProperty('binaTipi');
    expect(on.taslaklar[0].veri).not.toHaveProperty('sigortaEttirenTipi');
    expect(on.taslaklar[10].veri).toMatchObject({
      sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaliTelefonNo: '0000005', sigortaEttiren: 'farkli', sigortaEttirenTipi: 'tuzel',
      sigortaEttirenProfili: 'vkn2', sigortaEttirenTelefonKodu: '555', sigortaEttirenTelefonNo: '0000006', sigortaliDurumu: 'malSahibi'
    });
    expect(on.notlar.join(' ')).toContain('Bu adres kodu için genel müdürlüğe başvurunuz');

    const y = akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor, basliklar);
    expect(y).toEqual({ eklenen: 12, atlanan: 0 });
    const kayit = o.vt.tek('SELECT id FROM senaryolar WHERE ekran_id = ? AND baslik = ?', [ekran.id, basliklar[3]]);
    const d = senaryoDetayi(o.vt, String(kayit?.id), o.ortamId);
    expect(d.veri).toMatchObject({ sigortaEttirenTipi: 'ozel', sigortaEttirenProfili: 'tc2', sigortaliDurumu: 'kiraci', yapiTarzi: 'TAM KAGİR', odemeAdimiDahil: true });
  } finally {
    o.temizle();
  }
});
