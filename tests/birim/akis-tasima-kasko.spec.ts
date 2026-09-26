// KODLU SENARYOLARI AKIŞA TAŞIMA — JetKasko (projeler/galaksi/tasima-kasko.mjs): örnek eski dosyalar (SAHTE veri) aktarılır,
// ödeme ortak akışı ve "JetKasko (akış)" paketi yüklenir; kodlu JetKasko YK testinin veri güdümlü senaryo dizisinin
// (jet-kasko-yk.json > jetKaskoYk.senaryolar) her öğesi bir taslak olur (başlık = kodlu test başlığı), senaryo kaydıyla aynı
// doğrulamadan geçer ve yazılır. Taşıyıcı henüz kayıtlı olmadığı için adaptörün kancası testte sarılır.
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
import { adaptorBul } from '../../projeler/index.mjs';
import type { AktarimAdaptoru } from '../../projeler/index.d.mts';
import { jetKaskoAkisPaketi } from '../../projeler/galaksi/jetkasko-akis.mjs';
import { odemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { jetKaskoTasiyici } from '../../projeler/galaksi/tasima-kasko.mjs';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Akis-Tasima-Kasko-Parolasi-7';

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; medya: string; adaptor: AktarimAdaptoru; temizle: () => void };

async function kur(): Promise<Ortam> {
  const k = geciciKlasor('akis-tasima-kasko');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const galaksi = adaptorBul('galaksi');
  if (!galaksi) throw new Error('galaksi adaptörü yok');
  const paket = await galaksi.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
  const { projeId } = aktarimiUygula(vt, paket);
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  const adaptor: AktarimAdaptoru = {
    ...galaksi,
    akisSenaryoTaslaklari: (v, p, o, e) => {
      if (e !== 'jet-kasko-akis') return null;
      const veri = galaksi.yenidenKur(v, p, o);
      return veri ? jetKaskoTasiyici(veri) : null;
    }
  };
  return { vt, projeId, ortamId, medya: join(k.yol, 'medya'), adaptor, temizle: () => { vt.kapat(); k.temizle(); } };
}

const BASLIKLAR = [
  'YK Özel Otomobil / Sigortalı Özel / Sigorta Ettiren Kendisi',
  'YK Özel Otomobil / Sigortalı Özel / Sigorta Ettiren Farklı Kişi Özel',
  'YK Özel Otomobil / Sigortalı Özel / Sigorta Ettiren Farklı Kişi Tüzel',
  'YK Özel Otomobil / Sigortalı Tüzel / Sigorta Ettiren Kendisi',
  'YK Özel Otomobil / Sigortalı Tüzel / Sigorta Ettiren Farklı Kişi Özel',
  'YK Özel Otomobil / Sigortalı Tüzel / Sigorta Ettiren Farklı Kişi Tüzel',
  'YK Kamyon / Sigortalı Özel / Sigorta Ettiren Kendisi',
  'YK Kamyon / Sigortalı Özel / Sigorta Ettiren Farklı Kişi Özel',
  'YK Kamyon / Sigortalı Özel / Sigorta Ettiren Farklı Kişi Tüzel',
  'YK Kamyon / Sigortalı Tüzel / Sigorta Ettiren Kendisi',
  'YK Kamyon / Sigortalı Tüzel / Sigorta Ettiren Farklı Kişi Özel',
  'YK Kamyon / Sigortalı Tüzel / Sigorta Ettiren Farklı Kişi Tüzel',
  'Yetkili İndirimli Acente YK Teklif Alma'
];

test('JetKasko: kodlu YK senaryo dizisinin her öğesi önizlenir (hatasız), yazılır; tekrar önizlemede "zaten var"', async () => {
  const o = await kur();
  try {
    const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: o.medya };
    await sayfaEkle(o.vt, o.projeId, odemeAkisPaketi(), secenek);
    await sayfaEkle(o.vt, o.projeId, jetKaskoAkisPaketi({ odeme: true }), secenek);
    const ekran = ekranlariListele(o.vt, o.projeId).find((e) => e.anahtar === 'jet-kasko-akis');
    if (!ekran) throw new Error('jet-kasko-akis yok');

    const on = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor);
    expect(on.kaynakEkran).toBe('JetKasko');
    expect(on.taslaklar.map((x) => x.baslik)).toEqual(BASLIKLAR);
    expect(on.taslaklar.map((x) => [x.baslik, x.durum, x.hatalar])).toEqual(on.taslaklar.map((x) => [x.baslik, 'yeni', []]));

    // Özel sigortalı, ettiren kendisi, özel otomobil.
    expect(on.taslaklar[0].veri).toEqual({
      sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', plakaIlKodu: '34', plakaNo: 'YK', sigortaEttiren: 'ayni',
      modelYili: '2026', markaKodu: '8001306', motorNo: 'ORNEKMOTOR0001', sasiNo: 'ORNEKMOTOR0001',
      aracTipi: '1', sinif: '1', kullanim: '1', urun: '3', acenteProfili: 'varsayilan', odemeAdimiDahil: true
    });
    // Farklı tüzel ettiren.
    expect(on.taslaklar[2].veri).toMatchObject({ sigortaEttiren: 'farkli', sigortaEttirenTipi: 'tuzel', sigortaEttirenProfili: 'vkn1' });
    // Tüzel sigortalı + farklı özel ettiren, kamyon.
    expect(on.taslaklar[10].veri).toMatchObject({
      sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn2', sigortaEttiren: 'farkli', sigortaEttirenTipi: 'ozel', sigortaEttirenProfili: 'tc3',
      markaKodu: '5201705', aracTipi: '6'
    });
    // Yetkili indirimli acente: indirim acente profilinden, ürün "5".
    expect(on.taslaklar[12].veri).toMatchObject({ acenteProfili: 'JetKaskoYetkiliİndirimli', yetkiliIndirimi: '15', urun: '5' });
    expect(on.taslaklar[0].veri).not.toHaveProperty('yetkiliIndirimi');
    const notlar = on.notlar.join(' ');
    expect(notlar).toContain('Kodlu testin kabul ettiği ödeme sonuçları');
    expect(notlar).toContain('BRV-OVM-POLICE');
    expect(notlar).toContain('Yetkili indirimi');
    expect(o.vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [ekran.id])?.n).toBe(0);

    const y = akisTasimaUygula(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor, [BASLIKLAR[0], BASLIKLAR[12]]);
    expect(y).toEqual({ eklenen: 2, atlanan: 0 });
    const kayitlar = o.vt.tumu('SELECT id, baslik FROM senaryolar WHERE ekran_id = ? ORDER BY rowid', [ekran.id]);
    expect(kayitlar.map((k) => k.baslik)).toEqual([BASLIKLAR[0], BASLIKLAR[12]]);
    const d0 = senaryoDetayi(o.vt, String(kayitlar[0].id), o.ortamId);
    expect(d0).toMatchObject({ kosuyaDahil: false, ortamlar: [o.ortamId] });
    expect(d0.veri).toMatchObject({ sigortaliProfili: 'tc1', markaKodu: '8001306', urun: '3', odemeAdimiDahil: true });
    const d1 = senaryoDetayi(o.vt, String(kayitlar[1].id), o.ortamId);
    expect(d1.veri).toMatchObject({ acenteProfili: 'JetKaskoYetkiliİndirimli', yetkiliIndirimi: '15', urun: '5' });

    const tekrar = akisTasimaOnizle(o.vt, o.projeId, ekran.id, o.ortamId, o.adaptor);
    expect(tekrar.taslaklar.filter((x) => x.durum === 'var').map((x) => x.baslik)).toEqual([BASLIKLAR[0], BASLIKLAR[12]]);
    expect(tekrar.taslaklar.filter((x) => x.durum === 'yeni')).toHaveLength(11);
  } finally {
    o.temizle();
  }
});
